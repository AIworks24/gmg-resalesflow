import { attachmentFolder, listAttachments, buildAttachmentDownloadLinks } from '../lib/applicationAttachments';

/**
 * Minimal stand-in for supabase.storage, covering only the two calls listAttachments uses:
 *   .from(bucket).list(folder, opts)
 *   .from(bucket).createSignedUrl(path, expiry)
 * `folders` maps a folder path to the entries list() returns for it.
 */
function mockStorage({ folders = {}, listError = null } = {}) {
  const calls = { list: [], sign: [] };
  const bucket = {
    list: async (folder) => {
      calls.list.push(folder);
      if (listError) return { data: null, error: listError };
      return { data: folders[folder] || [], error: null };
    },
    createSignedUrl: async (path, expiry) => {
      calls.sign.push({ path, expiry });
      return { data: { signedUrl: `https://signed.example/${path}` }, error: null };
    },
  };
  return { client: { storage: { from: jest.fn(() => bucket) } }, calls };
}

const file = (name, size = 2048) => ({
  id: `id-${name}`,
  name,
  metadata: { size, mimetype: 'application/pdf' },
});

describe('attachmentFolder', () => {
  it('scopes a single-property application to its own folder', () => {
    expect(attachmentFolder('123')).toBe('application_attachments/123');
  });

  it('scopes a multi-community property to a sub-folder of its application', () => {
    expect(attachmentFolder('123', 'g1')).toBe('application_attachments/123/g1');
  });

  it("keeps an application's property documents outside the shared property_files folder", () => {
    expect(attachmentFolder('123', null, 'property')).toBe('application_property_files/123');
    expect(attachmentFolder('123', 'g1', 'property')).toBe('application_property_files/123/g1');
  });
});

describe('listAttachments', () => {
  it("returns a multi-community property's files with clean names and signed URLs", async () => {
    const { client, calls } = mockStorage({
      folders: { 'application_attachments/123/g1': [file('1700000000_survey.pdf')] },
    });

    const result = await listAttachments(client, '123', 'g1', 3600);

    expect(calls.list).toEqual(['application_attachments/123/g1']);
    expect(result).toEqual([
      {
        name: 'survey.pdf',
        originalName: '1700000000_survey.pdf',
        size: 2048,
        type: 'application/pdf',
        url: 'https://signed.example/application_attachments/123/g1/1700000000_survey.pdf',
      },
    ]);
    expect(calls.sign).toEqual([
      { path: 'application_attachments/123/g1/1700000000_survey.pdf', expiry: 3600 },
    ]);
  });

  it('skips property sub-folders when listing the application-level folder', async () => {
    // Supabase list() returns sub-folders as entries with a null id and no metadata.
    const { client, calls } = mockStorage({
      folders: {
        'application_attachments/123': [file('1700000000_addendum.pdf'), { id: null, name: 'g1', metadata: null }],
      },
    });

    const result = await listAttachments(client, '123', null, 3600);

    expect(result.map((f) => f.originalName)).toEqual(['1700000000_addendum.pdf']);
    expect(calls.sign.map((c) => c.path)).toEqual(['application_attachments/123/1700000000_addendum.pdf']);
  });

  it('returns no files and logs when the folder cannot be listed', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const listError = { message: 'storage unavailable' };
    const { client } = mockStorage({ listError });

    await expect(listAttachments(client, '123', 'g1', 3600)).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Error listing attachments:', listError);

    errorSpy.mockRestore();
  });

  it("lists a property's application-only property documents from their own folder", async () => {
    const { client, calls } = mockStorage({
      folders: { 'application_property_files/123/g1': [file('1700000000_bylaws-amendment.pdf')] },
    });

    const result = await listAttachments(client, '123', 'g1', 3600, 'property');

    expect(calls.list).toEqual(['application_property_files/123/g1']);
    expect(result.map((f) => f.name)).toEqual(['bylaws-amendment.pdf']);
  });
});

describe('buildAttachmentDownloadLinks', () => {
  it("links a property's own property documents first, then its additional files", async () => {
    const { client } = mockStorage({
      folders: {
        'application_property_files/123/g1': [file('1700000000_bylaws-amendment.pdf', 4096)],
        'application_attachments/123/g1': [file('1700000001_addendum.pdf', 1024)],
        'application_property_files/123/g2': [file('1700000002_other-property.pdf')],
        'application_property_files/123': [file('1700000003_app-level.pdf')],
      },
    });

    const links = await buildAttachmentDownloadLinks(client, '123', 'g1', 2592000);

    expect(links).toEqual([
      {
        filename: 'bylaws-amendment.pdf',
        downloadUrl: 'https://signed.example/application_property_files/123/g1/1700000000_bylaws-amendment.pdf',
        type: 'document',
        description: 'Additional Property Document',
        size: 4096,
      },
      {
        filename: 'addendum.pdf',
        downloadUrl: 'https://signed.example/application_attachments/123/g1/1700000001_addendum.pdf',
        type: 'document',
        description: 'Additional Document',
        size: 1024,
      },
    ]);
  });
});

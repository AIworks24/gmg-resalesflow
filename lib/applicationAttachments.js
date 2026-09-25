/**
 * Per-application files attached to the completion email.
 *
 * Two kinds, each in its own storage root:
 *   additional -> application_attachments/{applicationId}     ("Additional Document")
 *   property   -> application_property_files/{applicationId}  ("Additional Property Document")
 *
 * Property documents uploaded for one application must stay out of property_files/{propertyId},
 * which holds the property's main documents and is shared by every application.
 *
 * Multi-community applications keep each property's files in a sub-folder named after
 * its application_property_groups id, so one property's files never ride along in
 * another property's email.
 */

const ROOTS = {
  additional: 'application_attachments',
  property: 'application_property_files',
};

export function attachmentFolder(applicationId, propertyGroupId = null, kind = 'additional') {
  const base = `${ROOTS[kind]}/${applicationId}`;
  return propertyGroupId ? `${base}/${propertyGroupId}` : base;
}

/**
 * List the files in one attachment folder with signed URLs.
 * `name` drops the upload timestamp prefix; `originalName` is the stored name, needed to delete.
 */
export async function listAttachments(supabase, applicationId, propertyGroupId, expirySeconds, kind = 'additional') {
  const folder = attachmentFolder(applicationId, propertyGroupId, kind);
  const bucket = supabase.storage.from('bucket0');

  const { data, error } = await bucket.list(folder, { limit: 100, offset: 0 });
  if (error) {
    console.error('Error listing attachments:', error);
    return [];
  }

  // Sub-folders (a multi-community property's files) come back as entries with a null id.
  const files = (data || []).filter((entry) => entry.id !== null);

  return Promise.all(files.map(async (file) => {
    const { data: urlData } = await bucket.createSignedUrl(`${folder}/${file.name}`, expirySeconds);
    return {
      name: file.name.replace(/^\d+_/, ''),
      originalName: file.name,
      size: file.metadata?.size || 0,
      type: file.metadata?.mimetype || 'application/octet-stream',
      url: urlData?.signedUrl,
    };
  }));
}

const EMAIL_LABELS = {
  property: 'Additional Property Document',
  additional: 'Additional Document',
};

/**
 * Email download links for everything uploaded to this application (or, for multi-community,
 * this property within it): its property documents first, then its additional files.
 */
export async function buildAttachmentDownloadLinks(supabase, applicationId, propertyGroupId, expirySeconds) {
  const links = [];
  for (const kind of ['property', 'additional']) {
    const files = await listAttachments(supabase, applicationId, propertyGroupId, expirySeconds, kind);
    for (const file of files) {
      if (!file.url) continue;
      links.push({
        filename: file.name,
        downloadUrl: file.url,
        type: 'document',
        description: EMAIL_LABELS[kind],
        size: file.size || 'Unknown',
      });
    }
  }
  return links;
}

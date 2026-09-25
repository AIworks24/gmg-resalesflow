import handler from '../pages/api/send-approval-email';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendApprovalEmail } from '../lib/emailService';
import { getDeliveryPause } from '../lib/propertyStatus';

jest.mock('@supabase/auth-helpers-nextjs', () => ({ createPagesServerClient: jest.fn() }));
jest.mock('../lib/emailService', () => ({ sendApprovalEmail: jest.fn() }));
// Draft-pause lookup is covered separately below; attachment tests assume a published property.
jest.mock('../lib/propertyStatus', () => ({
  ...jest.requireActual('../lib/propertyStatus'),
  getDeliveryPause: jest.fn(),
}));

const APP_ID = 563;

/**
 * Stand-in for the Supabase client the handler builds. Every query chain resolves to
 * the canned row(s) for its table, whether it ends in .single() or is awaited directly.
 * Storage list() answers per folder path.
 */
function mockSupabase({ folders = {} } = {}) {
  const rows = {
    profiles: { role: 'admin', first_name: 'Test', last_name: 'Admin' },
    applications: {
      id: APP_ID,
      submitter_type: 'realtor',
      application_type: 'single_property',
      submitter_email: 'requester@example.com',
      submitter_name: 'Requester',
      buyer_email: null,
      property_address: '1 Main St',
      pdf_url: 'https://files.example/primary.pdf',
      notes: null,
      hoa_property_id: 'p-primary',
      hoa_properties: { name: 'Primary HOA' },
      property_owner_forms: [],
    },
    application_property_groups: { property_id: 'p-foxcreek' },
    // The property's main documents (shared by every application for this property).
    property_documents: [{
      document_key: 'bylaws',
      document_name: 'Bylaws',
      display_name: 'Bylaws.pdf',
      file_path: 'property_files/p-foxcreek/bylaws_1600000000_Bylaws.pdf',
    }],
  };

  const query = (table) => {
    const result = { data: rows[table], error: null };
    const builder = {
      select: () => builder,
      update: () => builder,
      eq: () => builder,
      neq: () => builder,
      not: () => builder,
      single: async () => result,
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  };

  const bucket = {
    list: async (folder) => ({ data: folders[folder] || [], error: null }),
    createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
  };

  return {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'admin-1' } } } }) },
    from: jest.fn(query),
    storage: { from: () => bucket },
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const file = (name) => ({ id: `id-${name}`, name, metadata: { size: 1024, mimetype: 'application/pdf' } });

// Files uploaded to the application-level folder and to two different MC properties.
const folders = {
  [`application_attachments/${APP_ID}`]: [
    file('1700000000_app-level.pdf'),
    { id: null, name: 'g1', metadata: null },
    { id: null, name: 'g2', metadata: null },
  ],
  [`application_attachments/${APP_ID}/g1`]: [file('1700000001_foxcreek-only.pdf')],
  [`application_attachments/${APP_ID}/g2`]: [file('1700000002_greenwich-only.pdf')],
  // Property documents uploaded for this application only (never in property_files/).
  [`application_property_files/${APP_ID}`]: [
    file('1700000003_app-level-bylaws.pdf'),
    { id: null, name: 'g1', metadata: null },
    { id: null, name: 'g2', metadata: null },
  ],
  [`application_property_files/${APP_ID}/g1`]: [file('1700000004_foxcreek-bylaws.pdf')],
  [`application_property_files/${APP_ID}/g2`]: [file('1700000005_greenwich-bylaws.pdf')],
};

const sentLinkNames = (description) =>
  sendApprovalEmail.mock.calls[0][0].downloadLinks
    .filter((link) => link.description === description)
    .map((link) => link.filename);

const sentAttachmentNames = () => sentLinkNames('Additional Document');

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  createPagesServerClient.mockReturnValue(mockSupabase({ folders }));
  sendApprovalEmail.mockResolvedValue({});
  getDeliveryPause.mockResolvedValue({ paused: false, draftPropertyIds: [], draftPropertyNames: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
  sendApprovalEmail.mockReset();
});

describe('POST /api/send-approval-email attachments', () => {
  it("sends a multi-community property only its own attachments", async () => {
    const res = mockRes();

    await handler({
      method: 'POST',
      body: {
        applicationId: APP_ID,
        propertyGroupId: 'g1',
        propertyName: 'Foxcreek Owners Association, Inc.',
        pdfUrl: 'https://files.example/foxcreek.pdf',
      },
    }, res);

    expect(sentAttachmentNames()).toEqual(['foxcreek-only.pdf']);
  });

  it('sends a single-property application its application-level attachments only', async () => {
    const res = mockRes();

    await handler({ method: 'POST', body: { applicationId: APP_ID } }, res);

    expect(sentAttachmentNames()).toEqual(['app-level.pdf']);
  });

  it('still reports a property-specific send to the caller', async () => {
    const res = mockRes();

    await handler({
      method: 'POST',
      body: {
        applicationId: APP_ID,
        propertyGroupId: 'g2',
        propertyName: 'Greenwich Walk Homeowners Association, Inc.',
        pdfUrl: 'https://files.example/greenwich.pdf',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    // send-all-mc-emails counts a property as sent only on 200 + success.
    expect(res.body).toMatchObject({
      success: true,
      propertyName: 'Greenwich Walk Homeowners Association, Inc.',
    });
    expect(res.body.propertySpecific).toBeTruthy();
    expect(sentAttachmentNames()).toEqual(['greenwich-only.pdf']);
  });

  it("sends a multi-community property only its own additional property documents", async () => {
    const res = mockRes();

    await handler({
      method: 'POST',
      body: {
        applicationId: APP_ID,
        propertyGroupId: 'g1',
        propertyName: 'Foxcreek Owners Association, Inc.',
        pdfUrl: 'https://files.example/foxcreek.pdf',
      },
    }, res);

    expect(sentLinkNames('Additional Property Document')).toEqual(['foxcreek-bylaws.pdf']);
  });

  it('sends a single-property application its application-level property documents', async () => {
    const res = mockRes();

    await handler({ method: 'POST', body: { applicationId: APP_ID } }, res);

    expect(sentLinkNames('Additional Property Document')).toEqual(['app-level-bylaws.pdf']);
  });

  it("keeps the property's main documents alongside, labelled as main documents", async () => {
    const res = mockRes();

    await handler({ method: 'POST', body: { applicationId: APP_ID } }, res);

    expect(sentLinkNames('Bylaws')).toEqual(['Bylaws.pdf']);
    expect(sentLinkNames('Bylaws')).not.toContain('app-level-bylaws.pdf');
  });
});

describe('POST /api/send-approval-email while the property is in Draft', () => {
  it('refuses to send and names the draft property', async () => {
    getDeliveryPause.mockResolvedValue({ paused: true, draftPropertyIds: ['p-foxcreek'], draftPropertyNames: ['Foxcreek HOA'] });
    const res = mockRes();

    await handler({ method: 'POST', body: { applicationId: APP_ID, propertyGroupId: 'g1' } }, res);

    expect(getDeliveryPause).toHaveBeenCalledWith(expect.anything(), APP_ID, 'g1');
    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ code: 'PROPERTY_DRAFT', draftProperties: ['Foxcreek HOA'] });
    expect(sendApprovalEmail).not.toHaveBeenCalled();
  });
});

/**
 * Fixture setup for the restructure e2e tests.
 *
 * The Restructure flow mutates the application it runs on, so each test reseeds
 * application 563 back to its pre-restructure shape first. Writes go through the
 * service-role client against the TEST Supabase project configured in .env.local.
 */

const { createClient } = require('@supabase/supabase-js');

// Communities used by the fixture, mirroring the production shape of App #2734:
// a primary community linked to two others, all settlement work routed to accounting.
const PRIMARY = 24; // Unit Owners Association of Greenwich Walk Condominiums
const LINKED = [23, 1]; // Greenwich Walk HOA, Foxcreek Owners Association

const ACCOUNTING = 'rizh.hrly@gmail.com'; // Curtis Jackson (accounting)
const OTHER_ACCOUNTING = 'ianrizhahaha@gmail.com'; // Nasir bin Olu Jones (accounting)

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Reseed the application as a correctly-assigned multi-community settlement app.
 *
 * @param {number} applicationId
 * @param {object} [opts]
 * @param {string} [opts.appAssignee]           applications.assigned_to (default: the accounting user)
 * @param {string} [opts.primarySettlementEmail] settlement_assignee_email on the primary community
 */
async function seedSettlementMcApplication(applicationId, opts = {}) {
  const { appAssignee = ACCOUNTING, primarySettlementEmail = ACCOUNTING } = opts;
  const db = serviceClient();

  // Every community routes settlement work to an accounting user, while each keeps a
  // different community manager as its default_assignee_email — the discriminator the
  // bug turned on.
  await db.from('hoa_properties').update({ settlement_assignee_email: ACCOUNTING }).in('id', LINKED);
  await db.from('hoa_properties').update({ settlement_assignee_email: primarySettlementEmail }).eq('id', PRIMARY);

  await db.from('application_property_groups').delete().eq('application_id', applicationId);

  const { error: appError } = await db
    .from('applications')
    .update({
      hoa_property_id: PRIMARY,
      application_type: 'settlement_va',
      assigned_to: appAssignee,
      correction_metadata: null,
      correction_stripe_session_id: null,
      processing_locked: false,
      processing_locked_at: null,
      processing_locked_reason: null,
    })
    .eq('id', applicationId);
  if (appError) throw appError;

  const ids = [PRIMARY, ...LINKED];
  const { data: properties, error: propError } = await db
    .from('hoa_properties')
    .select('id, name, location, property_owner_email')
    .in('id', ids);
  if (propError) throw propError;

  const groups = properties.map((p) => ({
    application_id: applicationId,
    property_id: p.id,
    property_name: p.name,
    property_location: p.location,
    property_owner_email: p.property_owner_email,
    is_primary: p.id === PRIMARY,
    status: 'pending',
    inspection_status: 'not_started',
    resale_status: 'not_started',
    pdf_status: 'not_started',
    email_status: 'not_started',
    assigned_to: p.id === PRIMARY ? primarySettlementEmail : ACCOUNTING,
  }));

  const { error: groupError } = await db.from('application_property_groups').insert(groups);
  if (groupError) throw groupError;
}

/** Read back the assignment the restructure left behind. */
async function readAssignments(applicationId) {
  const db = serviceClient();

  const { data: app } = await db
    .from('applications')
    .select('assigned_to, hoa_property_id, application_type')
    .eq('id', applicationId)
    .single();

  const { data: groups } = await db
    .from('application_property_groups')
    .select('property_id, property_name, is_primary, assigned_to')
    .eq('application_id', applicationId)
    .order('is_primary', { ascending: false });

  return { app, groups: groups || [] };
}

module.exports = {
  seedSettlementMcApplication,
  readAssignments,
  PRIMARY,
  LINKED,
  ACCOUNTING,
  OTHER_ACCOUNTING,
};

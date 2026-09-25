/**
 * Property publish/draft status helpers (ClickUp 14ypaj0dg6g).
 *
 * A 'draft' property is being set up and is not orderable by requesters. While a property is
 * in draft, document-delivery emails for its existing applications are paused, because its
 * files/settings may be mid-update. Receipts, owner notifications, cancel/reject etc. still send.
 */

export const PROPERTY_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
};

export const PROPERTY_DRAFT_ERROR = 'PROPERTY_DRAFT';
export const PROPERTY_UNAVAILABLE_ERROR = 'PROPERTY_UNAVAILABLE';

export const PROPERTY_DRAFT_MESSAGE =
  'This property is in Draft — publish it to send document emails.';
export const PROPERTY_UNAVAILABLE_MESSAGE =
  'This property is temporarily unavailable. Please check back later.';

export const isDraftStatus = (status) => status === PROPERTY_STATUS.DRAFT;

/**
 * Can a requester order against this property right now?
 * Not orderable when the property is retired, in draft, or (MC primary) any linked property is in draft.
 * @returns {Promise<{orderable: boolean, reason: string|null, draftLinkedNames: string[]}>}
 */
export async function getPropertyOrderability(supabase, propertyId) {
  if (!propertyId) return { orderable: false, reason: 'missing', draftLinkedNames: [] };

  const { data: property, error } = await supabase
    .from('hoa_properties')
    .select('id, status, deleted_at')
    .eq('id', propertyId)
    .maybeSingle();

  if (error) throw error;
  if (!property || property.deleted_at) return { orderable: false, reason: 'retired', draftLinkedNames: [] };
  if (isDraftStatus(property.status)) return { orderable: false, reason: 'draft', draftLinkedNames: [] };

  const { data: links, error: linkError } = await supabase
    .from('linked_properties')
    .select('hoa_properties!linked_properties_linked_property_id_fkey(name, status)')
    .eq('primary_property_id', propertyId);

  if (linkError) throw linkError;

  const draftLinkedNames = (links || [])
    .map((l) => l.hoa_properties)
    .filter((p) => p && isDraftStatus(p.status))
    .map((p) => p.name);

  if (draftLinkedNames.length > 0) {
    return { orderable: false, reason: 'linked_draft', draftLinkedNames };
  }
  return { orderable: true, reason: null, draftLinkedNames: [] };
}

/**
 * Is document delivery paused for an application (or one of its MC property groups)?
 * - With propertyGroupId: only that group's property is checked.
 * - Without: the primary property and every group property are checked (any draft pauses).
 * @returns {Promise<{paused: boolean, draftPropertyIds: number[], draftPropertyNames: string[]}>}
 */
export async function getDeliveryPause(supabase, applicationId, propertyGroupId = null) {
  const { data: app, error } = await supabase
    .from('applications')
    .select(
      'id, hoa_property_id, hoa_properties(id, name, status), ' +
        'application_property_groups(id, property_id, property_name, hoa_properties(id, name, status))'
    )
    .eq('id', applicationId)
    .maybeSingle();

  if (error) throw error;
  if (!app) return { paused: false, draftPropertyIds: [], draftPropertyNames: [] };

  const groups = app.application_property_groups || [];
  let candidates;
  if (propertyGroupId) {
    const group = groups.find((g) => String(g.id) === String(propertyGroupId));
    candidates = group ? [group.hoa_properties] : [app.hoa_properties];
  } else {
    candidates = [app.hoa_properties, ...groups.map((g) => g.hoa_properties)];
  }

  const drafts = new Map();
  for (const p of candidates) {
    if (p && isDraftStatus(p.status)) drafts.set(p.id, p.name);
  }

  return {
    paused: drafts.size > 0,
    draftPropertyIds: [...drafts.keys()],
    draftPropertyNames: [...drafts.values()],
  };
}

/**
 * Standard 409 body for a paused send. `error` is human-readable because existing admin UI
 * handlers surface `result.error` directly; callers branch on `code`.
 */
export function propertyDraftErrorBody(draftPropertyNames = []) {
  return {
    code: PROPERTY_DRAFT_ERROR,
    error: draftPropertyNames.length
      ? `${draftPropertyNames.join(', ')} ${draftPropertyNames.length === 1 ? 'is' : 'are'} in Draft — publish to send document emails.`
      : PROPERTY_DRAFT_MESSAGE,
    draftProperties: draftPropertyNames,
  };
}

/** Client-side: is the property (joined row) in draft? */
export const isPropertyDraft = (property) => isDraftStatus(property?.status);

/**
 * Count real orders attached to a property, each application once whether attached directly
 * (single community) or through a multi-community group. Drafts and unpaid carts are excluded.
 * @returns {Promise<{total: number, inProgress: number}>}
 */
export async function countPropertyApplications(supabase, propertyId) {
  const [{ data: directApps }, { data: groupRows }] = await Promise.all([
    supabase
      .from('applications')
      .select('id, status')
      .eq('hoa_property_id', propertyId)
      .is('deleted_at', null),
    supabase
      .from('application_property_groups')
      .select('application_id')
      .eq('property_id', propertyId),
  ]);

  const byId = new Map();
  (directApps || []).forEach((app) => byId.set(app.id, app.status));

  // Applications reached via a group need their status looked up separately.
  const groupAppIds = (groupRows || [])
    .map((row) => row.application_id)
    .filter((id) => id && !byId.has(id));

  if (groupAppIds.length > 0) {
    const { data: groupApps } = await supabase
      .from('applications')
      .select('id, status')
      .in('id', groupAppIds)
      .is('deleted_at', null);
    (groupApps || []).forEach((app) => byId.set(app.id, app.status));
  }

  const statuses = Array.from(byId.values()).filter(
    (status) => status !== 'draft' && status !== 'pending_payment'
  );

  return {
    total: statuses.length,
    inProgress: statuses.filter((status) => status !== 'completed' && status !== 'rejected').length,
  };
}

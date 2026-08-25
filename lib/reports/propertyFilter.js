/**
 * Shared "filter reports by property" helper.
 *
 * A community can be attached to an application two ways:
 *   1. applications.hoa_property_id — the PRIMARY community
 *   2. application_property_groups.property_id — a member of a multi-community order
 *
 * Filtering on hoa_property_id alone under-reports: an MC order shows up only
 * under its primary community. Filtering on the group table alone loses rows too,
 * since groups are created lazily post-payment. So the correct scope is the union.
 *
 * PostgREST cannot filter an embedded foreign table inside .or() (PGRST100), so we
 * pre-query the matching application IDs — same workaround as the community search
 * in pages/api/admin/applications.js.
 */

/** Parse a request-supplied property id, or null when absent/invalid. */
export function parsePropertyId(propertyId) {
  if (propertyId === undefined || propertyId === null || propertyId === '' || propertyId === 'all') {
    return null;
  }
  const id = parseInt(propertyId, 10);
  return Number.isInteger(id) ? id : null;
}

/**
 * Resolve the property scope once (one pre-query), so callers that build several
 * queries — e.g. the four comparison windows — don't repeat the lookup.
 * Returns null when no valid property id was supplied.
 */
export async function resolvePropertyScope(supabase, propertyId) {
  const id = parsePropertyId(propertyId);
  if (id === null) return null;

  const { data: groupRows } = await supabase
    .from('application_property_groups')
    .select('application_id')
    .eq('property_id', id);

  const groupApplicationIds = [
    ...new Set((groupRows || []).map((r) => r.application_id).filter(Boolean)),
  ];

  return { id, groupApplicationIds };
}

/** Apply an already-resolved scope to an `applications` query. */
export function applyPropertyScope(query, scope) {
  if (!scope) return query;
  const { id, groupApplicationIds } = scope;

  // id and the group ids come from the DB / a validated parseInt, so interpolation is safe.
  return groupApplicationIds.length > 0
    ? query.or(`hoa_property_id.eq.${id},id.in.(${groupApplicationIds.join(',')})`)
    : query.eq('hoa_property_id', id);
}

/**
 * NOTE: there is deliberately no `async applyPropertyFilter(supabase, query, id)`
 * convenience wrapper here. A PostgrestFilterBuilder is a *thenable*, so
 * `query = await someAsyncFn()` that returns a builder does not hand back the
 * builder — awaiting chains into its .then(), runs the query, and resolves to
 * `{ data, error, count }`. Any further `.eq()/.order()/.range()` then throws
 * "query.range is not a function".
 *
 * Always use the two-step instead — resolve first (await plain data), then
 * apply synchronously:
 *
 *   const scope = await resolvePropertyScope(supabase, propertyId);
 *   query = applyPropertyScope(query, scope);
 */

/** Look up a property name for report titles/headers. Returns '' when unknown. */
export async function getPropertyName(supabase, propertyId) {
  const id = parsePropertyId(propertyId);
  if (id === null) return '';

  const { data } = await supabase
    .from('hoa_properties')
    .select('name')
    .eq('id', id)
    .single();

  return data?.name || '';
}

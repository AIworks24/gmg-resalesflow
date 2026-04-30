/**
 * Per-user Builder pricing utilities
 * Resolves account-specific Builder price overrides for a (user, property) pair.
 *
 * Precedence (server-side):
 *   1. Active, non-expired per-user override  → use override_price
 *   2. Property-wide Builder Force Price       → use force_price_value
 *   3. Catalog pricing                         → standard rates
 *
 * Data model: one offer row can cover multiple users via builder_pricing_offer_users.
 * Query joins from the junction table side to find the offer for a given userId.
 */

import { getSupabaseClient } from './supabase';

function getClient(supabaseClient) {
  const client = supabaseClient || getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is required. Pass it as a parameter for server-side use.');
  }
  return client;
}

/**
 * Fetch the active per-user Builder price override for a (propertyId, userId) pair.
 * Queries through the junction table (builder_pricing_offer_users → builder_user_property_pricing).
 *
 * @param {number} propertyId
 * @param {string} userId - auth user UUID
 * @param {Object} [supabaseClient]
 * @returns {Promise<{overridePrice: number, validUntil: string|null, applicantMessage: string|null, pricingId: string}|null>}
 *   Returns null if no valid offer exists.
 */
export async function getUserOverride(propertyId, userId, supabaseClient = null) {
  if (!propertyId || !userId) return null;

  const client = getClient(supabaseClient);
  const now = new Date().toISOString();

  const { data, error } = await client
    .from('builder_pricing_offer_users')
    .select(`
      builder_user_property_pricing!inner (
        id,
        override_price,
        valid_until,
        applicant_message
      )
    `)
    .eq('user_id', userId)
    .eq('builder_user_property_pricing.hoa_property_id', propertyId)
    .eq('builder_user_property_pricing.active', true)
    .lte('builder_user_property_pricing.valid_from', now)
    .or(
      `valid_until.is.null,valid_until.gte.${now}`,
      { referencedTable: 'builder_user_property_pricing' }
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('[userPricingUtils] Error fetching user override:', error);
    }
    return null;
  }

  if (!data?.builder_user_property_pricing) return null;

  const offer = data.builder_user_property_pricing;
  return {
    pricingId: offer.id,
    overridePrice: parseFloat(offer.override_price),
    validUntil: offer.valid_until || null,
    applicantMessage: offer.applicant_message || null,
  };
}

/**
 * Convenience: return only the override price value (in dollars), or null.
 *
 * @param {number} propertyId
 * @param {string} userId
 * @param {Object} [supabaseClient]
 * @returns {Promise<number|null>}
 */
export async function getUserOverridePrice(propertyId, userId, supabaseClient = null) {
  const override = await getUserOverride(propertyId, userId, supabaseClient);
  return override ? override.overridePrice : null;
}

// CommonJS exports for backend compatibility (API routes use require)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getUserOverride, getUserOverridePrice };
}

/**
 * Property Pricing Utilities
 * Helper functions for checking and retrieving property force price settings
 */

import { getSupabaseClient } from './supabase';

// Helper function to get supabase client
function getClient(supabaseClient) {
  const client = supabaseClient || getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is required. Pass it as a parameter for server-side use.');
  }
  return client;
}

/**
 * Get force price information for a property
 * @param {number} propertyId - The property ID
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<Object>} - Object with enabled flag and value
 */
export async function getPropertyForcePrice(propertyId, supabaseClient = null) {
  const client = getClient(supabaseClient);
  
  const { data, error } = await client
    .from('hoa_properties')
    .select('force_price_enabled, force_price_value')
    .eq('id', propertyId)
    .single();

  if (error) {
    console.error('Error fetching property force price:', error);
    return { enabled: false, value: null };
  }

  if (!data) {
    return { enabled: false, value: null };
  }

  return {
    enabled: data.force_price_enabled || false,
    value: data.force_price_value || null
  };
}

/**
 * Check if a property has forced price enabled
 * @param {number} propertyId - The property ID
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<boolean>} - True if forced price is enabled
 */
export async function hasForcedPrice(propertyId, supabaseClient = null) {
  const forcePrice = await getPropertyForcePrice(propertyId, supabaseClient);
  return forcePrice.enabled && forcePrice.value !== null && forcePrice.value >= 0;
}

/**
 * Get the forced price value for a property (returns null if not enabled)
 * @param {number} propertyId - The property ID
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<number|null>} - Forced price value in dollars, or null if not enabled
 */
export async function getForcedPriceValue(propertyId, supabaseClient = null) {
  const forcePrice = await getPropertyForcePrice(propertyId, supabaseClient);
  if (forcePrice.enabled && forcePrice.value !== null && forcePrice.value >= 0) {
    return parseFloat(forcePrice.value);
  }
  return null;
}

// CommonJS exports for backend compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getPropertyForcePrice,
    hasForcedPrice,
    getForcedPriceValue
  };
}


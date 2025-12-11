/**
 * Multi-Community Property Utilities
 * Handles property linking, pricing, and transaction logic for multi-community properties
 */

import { getSupabaseClient } from './supabase';
import { getForcedPriceValue } from './propertyPricingUtils';

// Helper function to get supabase client
function getClient(supabaseClient) {
  const client = supabaseClient || getSupabaseClient();
  if (!client) {
    throw new Error('Supabase client is required. Pass it as a parameter for server-side use.');
  }
  return client;
}

/**
 * Get all linked properties for a given property
 * @param {number} propertyId - The primary property ID
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<Array>} - Array of linked property objects
 */
export async function getLinkedProperties(propertyId, supabaseClient = null) {
  const client = getClient(supabaseClient);
  
  const { data, error } = await client
    .rpc('get_linked_properties', { property_id: propertyId });

  if (error) {
    console.error('Error fetching linked properties:', error);
    throw new Error('Failed to fetch linked properties');
  }

  return data || [];
}

/**
 * Check if a property has linked associations
 * @param {number} propertyId - The property ID to check
 * @returns {Promise<boolean>} - True if property has linked associations
 */
export async function hasLinkedProperties(propertyId, supabaseClient = null) {
  const client = getClient(supabaseClient);
  const { data, error } = await client
    .rpc('has_linked_properties', { property_id: propertyId });

  if (error) {
    console.error('Error checking linked properties:', error);
    return false;
  }

  return data || false;
}

/**
 * Get all properties that link to a given property
 * @param {number} propertyId - The property ID to check
 * @returns {Promise<Array>} - Array of properties that link to this property
 */
export async function getPropertiesLinkingTo(propertyId, supabaseClient = null) {
  const client = getClient(supabaseClient);
  const { data, error } = await client
    .rpc('get_properties_linking_to', { property_id: propertyId });

  if (error) {
    console.error('Error fetching properties linking to:', error);
    throw new Error('Failed to fetch linking properties');
  }

  return data || [];
}

/**
 * Get all properties for a multi-community transaction
 * @param {number} primaryPropertyId - The primary property ID
 * @returns {Promise<Array>} - Array including primary property and all linked properties
 */
export async function getAllPropertiesForTransaction(primaryPropertyId, supabaseClient = null) {
  const client = getClient(supabaseClient);
  // Get the primary property (exclude soft-deleted)
  const { data: primaryProperty, error: primaryError } = await client
    .from('hoa_properties')
    .select('*')
    .eq('id', primaryPropertyId)
    .is('deleted_at', null) // Only get non-deleted properties
    .single();

  if (primaryError) {
    console.error('Error fetching primary property:', primaryError);
    throw new Error('Failed to fetch primary property');
  }

  // Get linked properties (pass the same client)
  const linkedProperties = await getLinkedProperties(primaryPropertyId, client);

  // Return array with primary property first, then linked properties
  return [primaryProperty, ...linkedProperties];
}

/**
 * Calculate pricing for multi-community transaction
 * @param {number} primaryPropertyId - The primary property ID
 * @param {string} packageType - 'standard' or 'rush'
 * @param {string} applicationType - The application type (e.g., 'standard', 'settlement_agent_va')
 * @param {Object} supabaseClient - Supabase client for server-side use
 * @param {string} submitterType - Optional submitter type to check if forced price applies
 * @param {boolean} publicOffering - Optional flag indicating if public offering is requested
 * @returns {Promise<Object>} - Pricing breakdown object
 */
export async function calculateMultiCommunityPricing(primaryPropertyId, packageType, applicationType, supabaseClient = null, submitterType = null, publicOffering = false) {
  const allProperties = await getAllPropertiesForTransaction(primaryPropertyId, supabaseClient);
  const propertyCount = allProperties.length;

  // Base pricing per property (from applicationTypes.js logic)
  let basePricePerProperty = 0;
  
  if (applicationType === 'public_offering_statement') {
    basePricePerProperty = 200.0;
  } else if (applicationType === 'settlement_va' || applicationType === 'settlement_nc') {
    // Settlement pricing - use pricing config values
    try {
      const { PRICING_CONFIG } = await import('./pricingConfig');
      if (applicationType === 'settlement_va') {
        // VA: $0 standard, rush fee per property
        basePricePerProperty = PRICING_CONFIG.SETTLEMENT_VA_PRICE / 100; // Convert cents to dollars
      } else if (applicationType === 'settlement_nc') {
        // NC: SETTLEMENT_NC_PRICE per property
        basePricePerProperty = PRICING_CONFIG.SETTLEMENT_NC_PRICE / 100; // Convert cents to dollars
      }
    } catch (error) {
      console.error('Error loading pricing config for settlement:', error);
      // Fallback to hardcoded values
      basePricePerProperty = applicationType === 'settlement_va' ? 0 : 450.0;
    }
  } else if (applicationType.startsWith('settlement_agent')) {
    // Legacy support for old naming convention
    const isVirginia = applicationType === 'settlement_agent_va';
    basePricePerProperty = isVirginia ? 0 : 450.0; // NC settlement pricing
  } else {
    // Standard pricing - base price is always 317.95, rush fee is separate
    basePricePerProperty = 317.95;
  }

  const subtotal = basePricePerProperty * propertyCount;
  const transactionFees = 21.0 * propertyCount; // $21 per association
  const legacyTotal = subtotal + transactionFees;

  // Check if forced price applies (builder submitter type and not public offering)
  let globalForcedPrice = null;
  let shouldCheckForcedPrice = false;
  
  try {
    const { shouldApplyForcedPrice } = await import('./applicationTypes');
    shouldCheckForcedPrice = submitterType && shouldApplyForcedPrice(submitterType, publicOffering);
    
    // If forced price should apply, check ALL properties to find any forced price
    // If ANY property has a forced price, apply it to ALL properties in the multi-community
    // Priority: Primary property first, then any other property
    if (shouldCheckForcedPrice) {
      // First, check the primary property (index 0)
      const primaryProperty = allProperties[0];
      const primaryPropId = primaryProperty.id || primaryPropertyId;
      const primaryForcedPrice = await getForcedPriceValue(primaryPropId, supabaseClient);
      
      if (primaryForcedPrice !== null) {
        // Primary property has forced price - use it for all properties
        globalForcedPrice = primaryForcedPrice;
      } else {
        // Primary doesn't have forced price, check other linked properties
        for (let i = 1; i < allProperties.length; i++) {
          const property = allProperties[i];
          const propertyId = property.linked_property_id || property.id;
          const forcedPrice = await getForcedPriceValue(propertyId, supabaseClient);
          if (forcedPrice !== null) {
            // Found a forced price in a linked property - use it for all properties
            globalForcedPrice = forcedPrice;
            break;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking forced price for multi-community:', error);
    // Fall through to standard pricing
  }

  // Calculate individual association pricing
  // Note: This is async, so we need to use Promise.all
  const associations = await Promise.all(
    allProperties.map(async (property, index) => {
      const isPrimary = index === 0;
      const propertyId = property.linked_property_id || property.id || primaryPropertyId;
      
      // Use global forced price if found, otherwise use standard pricing
      let basePrice = globalForcedPrice !== null ? globalForcedPrice : basePricePerProperty;
      let rushFee = 0;
      let hasForcedPrice = globalForcedPrice !== null;
      
      // Calculate rush fee if applicable
      if (packageType === 'rush') {
        if (applicationType === 'settlement_va') {
          // VA: rush fee per property
          try {
            const { PRICING_CONFIG } = await import('./pricingConfig');
            rushFee = PRICING_CONFIG.SETTLEMENT_VA_RUSH_FEE / 100; // Convert cents to dollars
          } catch (error) {
            console.error('Error loading pricing config for VA rush:', error);
            rushFee = 70.66; // Fallback
          }
        } else if (applicationType === 'settlement_nc') {
          // NC: rush fee per property
          try {
            const { PRICING_CONFIG } = await import('./pricingConfig');
            rushFee = PRICING_CONFIG.SETTLEMENT_NC_RUSH_FEE / 100; // Convert cents to dollars
          } catch (error) {
            console.error('Error loading pricing config for NC rush:', error);
            rushFee = 100.0; // Fallback
          }
        } else if (applicationType === 'settlement_agent_nc') {
          // Legacy support
          rushFee = 100.0;
        } else if (applicationType !== 'settlement_agent_va') {
          // Standard rush fee for non-settlement or non-VA settlement
          rushFee = 70.66;
        }
        // settlement_agent_va and settlement_va with rush already handled above
      }
      
      const convenienceFee = 9.95; // Credit card convenience fee (will be conditionally applied in frontend)
      const total = basePrice + rushFee; // Don't include convenience fee in base total

      return {
        propertyId,
        name: property.property_name || property.name,
        basePrice,
        rushFee,
        convenienceFee,
        total,
        isPrimary,
        hasForcedPrice // Flag to indicate if this property uses forced price
      };
    })
  );

  // Calculate totals (without convenience fees)
  const totalBasePrice = associations.reduce((sum, assoc) => sum + assoc.basePrice, 0);
  const totalRushFee = associations.reduce((sum, assoc) => sum + assoc.rushFee, 0);
  const totalConvenienceFee = associations.reduce((sum, assoc) => sum + assoc.convenienceFee, 0);
  const total = totalBasePrice + totalRushFee; // Base total without convenience fees

  return {
    propertyCount,
    associations,
    total,
    totalBasePrice,
    totalRushFee,
    totalConvenienceFee,
    // Legacy fields for backward compatibility
    basePricePerProperty,
    subtotal: totalBasePrice,
    transactionFees: totalConvenienceFee,
    legacyTotal,
    breakdown: associations.map(assoc => ({
      propertyId: assoc.propertyId,
      propertyName: assoc.name,
      amount: assoc.basePrice,
      isPrimary: assoc.isPrimary
    }))
  };
}

/**
 * Generate user notification message for multi-community properties
 * @param {number} primaryPropertyId - The primary property ID
 * @param {Array} linkedProperties - Array of linked property objects
 * @param {Object} pricing - Pricing breakdown object
 * @returns {Object} - Notification message object
 */
export function generateMultiCommunityNotification(primaryPropertyId, linkedProperties, pricing) {
  const totalAssociations = linkedProperties.length + 1; // +1 for primary property
  
  return {
    type: 'multi_community',
    title: 'Multi-Community Association Detected',
    message: `Your property is part of a Master Association. Additional documents and fees will be included for ${totalAssociations} total associations.`,
    details: {
      totalAssociations,
      additionalFees: pricing.transactionFees,
      totalAmount: pricing.total,
      associations: [
        { name: 'Primary Property', isPrimary: true },
        ...linkedProperties.map(prop => ({ 
          name: prop.property_name, 
          isPrimary: false 
        }))
      ]
    },
    showWarning: true
  };
}

/**
 * Generate warning message for unmanaged parent associations
 * @param {Array} unmanagedProperties - Array of unmanaged property names
 * @returns {Object} - Warning message object
 */
export function generateUnmanagedAssociationWarning(unmanagedProperties) {
  return {
    type: 'unmanaged_association',
    title: 'Additional Documents Required',
    message: `You also need to obtain ${unmanagedProperties.join(', ')} Master Association documents separately.`,
    showWarning: true,
    isError: true
  };
}

/**
 * Validate property linking (prevent circular references)
 * @param {number} primaryPropertyId - The primary property ID
 * @param {number} linkedPropertyId - The property ID to link
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<boolean>} - True if linking is valid
 */
export async function validatePropertyLinking(primaryPropertyId, linkedPropertyId, supabaseClient = null) {
  // Block self-linking
  if (primaryPropertyId === linkedPropertyId) {
    return false;
  }

  try {
    const client = getClient(supabaseClient);
    // Block exact duplicates only
    const { data, error } = await client
      .from('linked_properties')
      .select('id')
      .eq('primary_property_id', primaryPropertyId)
      .eq('linked_property_id', linkedPropertyId)
      .limit(1);

    if (error) {
      console.error('Error validating property linking (duplicate check):', error);
      // Be permissive on validation failure; insertion will still be checked by DB constraints
      return true;
    }

    return !(data && data.length > 0);
  } catch (e) {
    console.error('Unexpected validation error:', e);
    return true;
  }
}

/**
 * Link properties for multi-community transactions
 * @param {number} primaryPropertyId - The primary property ID
 * @param {Array} linkedPropertyIds - Array of property IDs to link
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<boolean>} - True if successful
 */
export async function linkProperties(primaryPropertyId, linkedPropertyIds, supabaseClient = null) {
  try {
    const client = getClient(supabaseClient);
    
    // Validate all links first
    for (const linkedId of linkedPropertyIds) {
      const isValid = await validatePropertyLinking(primaryPropertyId, linkedId, client);
      if (!isValid) {
        throw new Error(`Invalid property link: ${primaryPropertyId} -> ${linkedId}`);
      }
    }

    // Create link records
    const linkRecords = linkedPropertyIds.map(linkedId => ({
      primary_property_id: primaryPropertyId,
      linked_property_id: linkedId
    }));

    const { error } = await client
      .from('linked_properties')
      .insert(linkRecords);

    if (error) throw error;

    // Update is_multi_community based on actual linked properties count
    // This works both with and without the database trigger
    // If trigger exists, this will just confirm the value; if not, it sets it
    const { count: linkedCount } = await client
      .from('linked_properties')
      .select('*', { count: 'exact', head: true })
      .eq('primary_property_id', primaryPropertyId);

    const hasLinks = (linkedCount || 0) > 0;

    // Update using API endpoint (client-side) or direct update (server-side)
    if (typeof window !== 'undefined' && !supabaseClient) {
      // Client-side: use API endpoint with service role to bypass RLS
      try {
        const response = await fetch('/api/admin/update-property-multi-community', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            propertyId: primaryPropertyId,
            isMultiCommunity: hasLinks
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.warn('⚠️ API update failed, but links were created:', errorData);
          // Don't throw - links were created successfully
        } else {
          console.log(`✅ Successfully updated is_multi_community=${hasLinks} for property ${primaryPropertyId}`);
        }
      } catch (apiError) {
        console.warn('⚠️ API update failed, but links were created:', apiError);
        // Don't throw - links were created successfully
      }
    } else {
      // Server-side: use direct update
      const { error: updateError } = await client
        .from('hoa_properties')
        .update({ is_multi_community: hasLinks })
        .eq('id', primaryPropertyId);

      if (updateError) {
        console.warn('⚠️ Failed to update is_multi_community, but links were created:', updateError);
      } else {
        console.log(`✅ Successfully updated is_multi_community=${hasLinks} for property ${primaryPropertyId}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error linking properties:', error);
    throw error;
  }
}

/**
 * Unlink properties
 * @param {number} primaryPropertyId - The primary property ID
 * @param {Array} linkedPropertyIds - Array of property IDs to unlink
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<boolean>} - True if successful
 */
export async function unlinkProperties(primaryPropertyId, linkedPropertyIds, supabaseClient = null) {
  try {
    const client = getClient(supabaseClient);
    
    const { error } = await client
      .from('linked_properties')
      .delete()
      .eq('primary_property_id', primaryPropertyId)
      .in('linked_property_id', linkedPropertyIds);

    if (error) throw error;

    // Check if property still has any links
    const hasLinks = await hasLinkedProperties(primaryPropertyId, client);
    
    // Update is_multi_community based on actual linked properties count
    // This works both with and without the database trigger
    if (typeof window !== 'undefined' && !supabaseClient) {
      // Client-side: use API endpoint with service role to bypass RLS
      try {
        const response = await fetch('/api/admin/update-property-multi-community', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            propertyId: primaryPropertyId,
            isMultiCommunity: hasLinks
          })
        });

        if (!response.ok) {
          console.warn('⚠️ API update failed during unlink:', await response.json().catch(() => ({})));
        } else {
          console.log(`✅ Successfully updated is_multi_community=${hasLinks} for property ${primaryPropertyId}`);
        }
      } catch (apiError) {
        console.warn('⚠️ API update failed during unlink:', apiError);
      }
    } else {
      // Server-side: use direct update
      const { error: updateError } = await client
        .from('hoa_properties')
        .update({ is_multi_community: hasLinks })
        .eq('id', primaryPropertyId);

      if (updateError) {
        console.warn('⚠️ Failed to update is_multi_community during unlink:', updateError);
      } else {
        console.log(`✅ Successfully updated is_multi_community=${hasLinks} for property ${primaryPropertyId}`);
      }
    }

    return true;
  } catch (error) {
    console.error('Error unlinking properties:', error);
    throw error;
  }
}

// CommonJS exports for backend compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getLinkedProperties,
    hasLinkedProperties,
    getPropertiesLinkingTo,
    getAllPropertiesForTransaction,
    calculateMultiCommunityPricing,
    generateMultiCommunityNotification,
    generateUnmanagedAssociationWarning,
    validatePropertyLinking,
    linkProperties,
    unlinkProperties
  };
}
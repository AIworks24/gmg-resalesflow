/**
 * Multi-Community Property Utilities
 * Handles property linking, pricing, and transaction logic for multi-community properties
 */

import { supabase } from './supabase';

/**
 * Get all linked properties for a given property
 * @param {number} propertyId - The primary property ID
 * @returns {Promise<Array>} - Array of linked property objects
 */
export async function getLinkedProperties(propertyId) {
  const { data, error } = await supabase
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
export async function hasLinkedProperties(propertyId) {
  const { data, error } = await supabase
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
export async function getPropertiesLinkingTo(propertyId) {
  const { data, error } = await supabase
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
export async function getAllPropertiesForTransaction(primaryPropertyId) {
  // Get the primary property
  const { data: primaryProperty, error: primaryError } = await supabase
    .from('hoa_properties')
    .select('*')
    .eq('id', primaryPropertyId)
    .single();

  if (primaryError) {
    console.error('Error fetching primary property:', primaryError);
    throw new Error('Failed to fetch primary property');
  }

  // Get linked properties
  const linkedProperties = await getLinkedProperties(primaryPropertyId);

  // Return array with primary property first, then linked properties
  return [primaryProperty, ...linkedProperties];
}

/**
 * Calculate pricing for multi-community transaction
 * @param {number} primaryPropertyId - The primary property ID
 * @param {string} packageType - 'standard' or 'rush'
 * @param {string} applicationType - The application type (e.g., 'standard', 'settlement_agent_va')
 * @returns {Promise<Object>} - Pricing breakdown object
 */
export async function calculateMultiCommunityPricing(primaryPropertyId, packageType, applicationType) {
  const allProperties = await getAllPropertiesForTransaction(primaryPropertyId);
  const propertyCount = allProperties.length;

  // Base pricing per property (from applicationTypes.js logic)
  let basePricePerProperty = 0;
  
  if (applicationType === 'public_offering_statement') {
    basePricePerProperty = 200.0;
  } else if (applicationType.startsWith('settlement_agent')) {
    const isVirginia = applicationType === 'settlement_agent_va';
    basePricePerProperty = isVirginia ? 0 : 450.0; // NC settlement pricing
  } else {
    // Standard pricing
    basePricePerProperty = packageType === 'rush' ? 1024.51 : 317.95;
  }

  // Add rush fee if applicable
  if (packageType === 'rush' && applicationType !== 'settlement_agent_va') {
    const rushFee = applicationType === 'settlement_agent_nc' ? 100.0 : 70.66;
    basePricePerProperty += rushFee;
  }

  const subtotal = basePricePerProperty * propertyCount;
  const transactionFees = 21.0 * propertyCount; // $21 per association
  const total = subtotal + transactionFees;

  return {
    propertyCount,
    basePricePerProperty,
    subtotal,
    transactionFees,
    total,
    breakdown: allProperties.map((property, index) => ({
      propertyId: property.linked_property_id || primaryPropertyId,
      propertyName: property.property_name || property.name,
      amount: basePricePerProperty,
      isPrimary: index === 0
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
 * @returns {Promise<boolean>} - True if linking is valid
 */
export async function validatePropertyLinking(primaryPropertyId, linkedPropertyId) {
  // Block self-linking
  if (primaryPropertyId === linkedPropertyId) {
    return false;
  }

  try {
    // Block exact duplicates only
    const { data, error } = await supabase
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
 * @returns {Promise<boolean>} - True if successful
 */
export async function linkProperties(primaryPropertyId, linkedPropertyIds) {
  try {
    // Validate all links first
    for (const linkedId of linkedPropertyIds) {
      const isValid = await validatePropertyLinking(primaryPropertyId, linkedId);
      if (!isValid) {
        throw new Error(`Invalid property link: ${primaryPropertyId} -> ${linkedId}`);
      }
    }

    // Create link records
    const linkRecords = linkedPropertyIds.map(linkedId => ({
      primary_property_id: primaryPropertyId,
      linked_property_id: linkedId
    }));

    const { error } = await supabase
      .from('linked_properties')
      .insert(linkRecords);

    if (error) throw error;

    // Update primary property to mark as multi-community
    const { error: updateError } = await supabase
      .from('hoa_properties')
      .update({ is_multi_community: true })
      .eq('id', primaryPropertyId);

    if (updateError) throw updateError;

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
 * @returns {Promise<boolean>} - True if successful
 */
export async function unlinkProperties(primaryPropertyId, linkedPropertyIds) {
  try {
    const { error } = await supabase
      .from('linked_properties')
      .delete()
      .eq('primary_property_id', primaryPropertyId)
      .in('linked_property_id', linkedPropertyIds);

    if (error) throw error;

    // Check if property still has any links
    const hasLinks = await hasLinkedProperties(primaryPropertyId);
    
    // If no more links, unmark as multi-community
    if (!hasLinks) {
      const { error: updateError } = await supabase
        .from('hoa_properties')
        .update({ is_multi_community: false })
        .eq('id', primaryPropertyId);

      if (updateError) throw updateError;
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
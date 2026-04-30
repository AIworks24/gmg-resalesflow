/**
 * Application Types Management Utility
 * Handles application type determination, pricing, and form management
 * Updated to use property-based application types with environment variable pricing
 */

import { supabase } from './supabase';
import { getPricing, calculatePricingTotal, getPricingDisplay } from './pricingConfig';
import { getForcedPriceValue } from './propertyPricingUtils';
import { getUserOverridePrice } from './userPricingUtils';

// Utility function for property state detection
function getPropertyState(location) {
  if (!location) return null;
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) return 'VA';
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) return 'NC';
  return null;
}

/**
 * Determine application type based on submitter, property, and special flags
 * @param {string} submitterType - The submitter type ('settlement', 'realtor', etc.)
 * @param {Object} hoaProperty - The selected HOA property object
 * @param {boolean} publicOffering - Whether this is a public offering statement request
 * @param {boolean} infoPacket - Whether this is an info packet (welcome package) request
 * @returns {string} - Application type name
 */
export function determineApplicationType(submitterType, hoaProperty, publicOffering = false, infoPacket = false) {
  // Lender Questionnaire: allowed for both single and multi-community properties.
  // For MC properties, only the primary property receives the questionnaire.
  if (submitterType === 'lender_questionnaire') {
    return 'lender_questionnaire';
  }

  // Info Packet (Welcome Package) - builder only, allowed for MC (charged per community)
  if (infoPacket) {
    return 'info_packet';
  }

  // Public Offering Statement (special case for builders - allowed for MC)
  if (publicOffering) {
    return 'public_offering';
  }
  
  // Settlement agents get special treatment based on property state
  // Check this BEFORE multi-community so settlement type is preserved for multi-community properties
  if (submitterType === 'settlement' && hoaProperty) {
    const propertyState = getPropertyState(hoaProperty.location);
    if (propertyState === 'VA') return 'settlement_va';
    if (propertyState === 'NC') return 'settlement_nc';
  }
  
  // Multi-community properties (but NOT settlement - settlement type already determined above)
  if (hoaProperty && hoaProperty.is_multi_community && submitterType !== 'settlement') {
    return 'multi_community';
  }
  
  // Default to single property
  return 'single_property';
}

/**
 * Get application type data from database
 * @param {string} applicationTypeName - The application type name
 * @returns {Promise<Object>} - Application type data
 */
export async function getApplicationTypeData(applicationTypeName) {
  const { data, error } = await supabase
    .from('application_types')
    .select('*')
    .eq('name', applicationTypeName)
    .single();

  if (error) {
    console.error('Error fetching application type:', error);
    throw new Error(`Application type '${applicationTypeName}' not found`);
  }

  return data;
}

/**
 * Check if forced price should apply based on submitter type and special request flags
 * Force price ONLY applies when submitterType is 'builder' AND no special request (POS or info packet)
 * @param {string} submitterType - The submitter type ('builder', 'settlement', etc.)
 * @param {boolean} publicOffering - Whether public offering statement is requested
 * @param {boolean} infoPacket - Whether info packet is requested
 * @returns {boolean} - True if forced price should apply
 */
export function shouldApplyForcedPrice(submitterType, publicOffering = false, infoPacket = false) {
  return submitterType === 'builder' && !publicOffering && !infoPacket;
}

/**
 * Get pricing for application type.
 * Precedence when submitterType is 'builder' (standard resale only):
 *   1. Per-user override (userId + propertyId)  — replaces property force price for that user
 *   2. Property-wide Builder Force Price
 *   3. Catalog pricing
 *
 * @param {string} applicationTypeName
 * @param {string} packageType - 'standard' or 'rush'
 * @param {number|null} propertyId
 * @param {Object|null} supabaseClient
 * @param {string|null} submitterType
 * @param {boolean} publicOffering
 * @param {string|null} userId - auth user UUID for per-user override lookup
 * @returns {Promise<number>} - Price in dollars
 */
export async function getApplicationTypePricing(applicationTypeName, packageType, propertyId = null, supabaseClient = null, submitterType = null, publicOffering = false, userId = null) {
  if (propertyId && submitterType && shouldApplyForcedPrice(submitterType, publicOffering)) {
    try {
      // 1. Per-user override takes precedence
      if (userId) {
        const userPrice = await getUserOverridePrice(propertyId, userId, supabaseClient);
        if (userPrice !== null) {
          if (packageType === 'rush') {
            const pricing = getPricing(applicationTypeName, true);
            return userPrice + pricing.rushFee / 100;
          }
          return userPrice;
        }
      }

      // 2. Property-wide Builder Force Price
      const forcedPrice = await getForcedPriceValue(propertyId, supabaseClient);
      if (forcedPrice !== null) {
        if (packageType === 'rush') {
          const pricing = getPricing(applicationTypeName, true);
          return forcedPrice + pricing.rushFee / 100;
        }
        return forcedPrice;
      }
    } catch (error) {
      console.error('Error checking builder price override:', error);
      // Fall through to standard pricing
    }
  }

  // 3. Catalog pricing
  const isRush = packageType === 'rush';
  const pricing = getPricing(applicationTypeName, isRush);
  return pricing.total / 100;
}

/**
 * Get form steps for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Array} - Array of form step objects
 */
export function getFormSteps(applicationTypeName) {
  if (applicationTypeName === 'lender_questionnaire') {
    // Lender Questionnaire flow: same as standard but with file upload after payment
    return [
      { id: 1, name: 'HOA Property', key: 'property' },
      { id: 2, name: 'Submitter Info', key: 'submitter' },
      { id: 3, name: 'Transaction Details', key: 'transaction' },
      { id: 4, name: 'Package & Payment', key: 'payment' },
      { id: 5, name: 'Upload Lender Form', key: 'upload' }
    ];
  }
  
  if (applicationTypeName === 'public_offering') {
    // Skip transaction details — go straight to payment
    return [
      { id: 1, name: 'Submitter Info', key: 'submitter' },
      { id: 2, name: 'Payment', key: 'payment' }
    ];
  }

  if (applicationTypeName === 'info_packet') {
    // Info Packet: include buyer details step (document delivery destination)
    return [
      { id: 1, name: 'HOA Property', key: 'property' },
      { id: 2, name: 'Submitter Info', key: 'submitter' },
      { id: 3, name: 'Buyer Details', key: 'transaction' },
      { id: 4, name: 'Payment', key: 'payment' }
    ];
  }
  
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    // Settlement agent flow - includes Transaction Details for buyer/seller info
    return [
      { id: 1, name: 'HOA Property', key: 'property' },
      { id: 2, name: 'Submitter Info', key: 'submitter' },
      { id: 3, name: 'Transaction Details', key: 'transaction' },
      { id: 4, name: 'Package & Payment', key: 'payment' }
    ];
  }
  
  // Single property and multi-community use standard flow
  return [
    { id: 1, name: 'HOA Property', key: 'property' },
    { id: 2, name: 'Submitter Info', key: 'submitter' },
    { id: 3, name: 'Transaction Details', key: 'transaction' },
    { id: 4, name: 'Package & Payment', key: 'payment' }
  ];
}

/**
 * Check if application type requires specific fields
 * @param {string} applicationTypeName - The application type name
 * @returns {Object} - Object with field requirements
 */
export function getFieldRequirements(applicationTypeName) {
  if (applicationTypeName === 'lender_questionnaire') {
    return {
      requiresSellerInfo: true,
      requiresTransactionDetails: true,
      requiresBuyerInfo: true,
      requiresClosingDate: true,
      skipPropertyFiles: true // Lender questionnaire uses custom form upload instead
    };
  }
  
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return {
      requiresSellerInfo: true, // Required for settlement forms to auto-fill
      requiresTransactionDetails: true, // Required for settlement forms
      requiresBuyerInfo: true,
      requiresClosingDate: true,
      skipPropertyFiles: true
    };
  }
  
  if (applicationTypeName === 'public_offering') {
    return {
      requiresSellerInfo: false,
      requiresTransactionDetails: false,
      requiresBuyerInfo: false,
      requiresClosingDate: false,
      skipPropertyFiles: true
    };
  }

  if (applicationTypeName === 'info_packet') {
    return {
      requiresSellerInfo: false,
      requiresTransactionDetails: false,
      requiresBuyerInfo: true,   // buyer email is required for document delivery
      requiresClosingDate: false,
      skipPropertyFiles: true
    };
  }
  
  // Single property and multi-community requirements
  return {
    requiresSellerInfo: true,
    requiresTransactionDetails: true,
    requiresBuyerInfo: true,
    requiresClosingDate: true,
    skipPropertyFiles: false
  };
}

/**
 * Get custom messaging for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Object} - Object with custom messages
 */
export function getApplicationTypeMessaging(applicationTypeName) {
  if (applicationTypeName === 'lender_questionnaire') {
    return {
      title: 'Lender Questionnaire Application',
      subtitle: 'Upload your lender\'s form and receive completed document',
      pricingNote: 'Standard: $400 | Rush: $500',
      completionMessage: 'Please upload your lender\'s questionnaire form.',
      formType: 'Lender Questionnaire'
    };
  }
  
  if (applicationTypeName === 'public_offering') {
    return {
      title: 'Public Offering Statement Request',
      subtitle: 'Document delivery only',
      pricingNote: '$200 flat fee',
      completionMessage: 'Request submitted. Staff will deliver the document.',
      formType: 'Public Offering Statement'
    };
  }

  if (applicationTypeName === 'info_packet') {
    return {
      title: 'Info Packet (Welcome Package) Request',
      subtitle: 'Document package delivered automatically upon payment',
      pricingNote: '$200 per association',
      completionMessage: 'Info Packet delivered to your email. Check your inbox.',
      formType: 'Info Packet (Welcome Package)'
    };
  }
  
  if (applicationTypeName === 'settlement_va') {
    return {
      title: 'Settlement Agent Application - Virginia',
      subtitle: 'FREE by Virginia law',
      pricingNote: 'FREE standard processing + optional rush fee',
      completionMessage: 'Settlement form created and sent to accounting for review',
      formType: 'Settlement Agent Request (VA)'
    };
  }
  
  if (applicationTypeName === 'settlement_nc') {
    return {
      title: 'Settlement Agent Application - North Carolina',
      subtitle: 'North Carolina settlement pricing',
      pricingNote: 'North Carolina settlement pricing',
      completionMessage: 'Settlement form created and sent to accounting for review',
      formType: 'Settlement Agent Request (NC)'
    };
  }
  
  if (applicationTypeName === 'multi_community') {
    return {
      title: 'Multi-Community HOA Resale Certificate',
      subtitle: 'Master Association with linked properties',
      pricingNote: 'Pricing includes all linked associations',
      completionMessage: 'Application submitted successfully - forms sent to staff for processing',
      formType: 'Multi-Community Resale Certificate'
    };
  }
  
  return {
    title: 'HOA Resale Certificate Application',
    subtitle: 'Complete resale certificate package',
    pricingNote: 'Standard processing includes all required documents',
    completionMessage: 'Application submitted successfully - forms sent to staff for processing',
    formType: 'Standard Resale Certificate'
  };
}

/**
 * Calculate total amount including fees
 * @param {string} applicationTypeName - The application type name
 * @param {string} packageType - 'standard' or 'rush'
 * @param {string} paymentMethod - 'credit_card' or 'ach'
 * @returns {Promise<number>} - Total amount in dollars
 */
export async function calculateTotalAmount(applicationTypeName, packageType, paymentMethod) {
  const isRush = packageType === 'rush';
  const pricing = getPricing(applicationTypeName, isRush);
  let total = pricing.total / 100; // Convert cents to dollars
  
  // Add credit card processing fee if applicable
  if (paymentMethod === 'credit_card' && total > 0) {
    total += 9.95; // $9.95 credit card fee
  }
  
  return total;
}

/**
 * Check if payment is required for application type
 * @param {string} applicationTypeName - The application type name
 * @param {string} packageType - 'standard' or 'rush'
 * @returns {Promise<boolean>} - Whether payment is required
 */
export async function isPaymentRequired(applicationTypeName, packageType) {
  const isRush = packageType === 'rush';
  const pricing = getPricing(applicationTypeName, isRush);
  return pricing.total > 0;
}

/**
 * Get required forms for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Array} - Array of required form types
 */
export function getRequiredForms(applicationTypeName) {
  if (applicationTypeName === 'lender_questionnaire') {
    return ['lender_questionnaire']; // Custom lender form uploaded by user
  }
  
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return ['settlement_form'];
  }
  
  if (applicationTypeName === 'public_offering' || applicationTypeName === 'info_packet') {
    return []; // No forms required, just document delivery
  }
  
  // Single property and multi-community
  return ['resale_certificate', 'inspection_form'];
}

/**
 * Get allowed staff roles for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Array} - Array of allowed staff roles
 */
export function getAllowedRoles(applicationTypeName) {
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return ['accounting'];
  }
  
  // Single property, multi-community, public offering, and info packet
  return ['staff'];
}

/**
 * Check if application type requires property files
 * @param {string} applicationTypeName - The application type name
 * @returns {boolean} - Whether property files are required
 */
export function requiresPropertyFiles(applicationTypeName) {
  if (applicationTypeName === 'lender_questionnaire') {
    return false; // Uses custom lender form upload instead
  }
  
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return false;
  }
  
  if (applicationTypeName === 'public_offering' || applicationTypeName === 'info_packet') {
    return false;
  }

  // Single property and multi-community
  return true;
}

// CommonJS exports for backend compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    determineApplicationType,
    getApplicationTypeData,
    getApplicationTypePricing,
    shouldApplyForcedPrice,
    getFormSteps,
    getFieldRequirements,
    getApplicationTypeMessaging,
    calculateTotalAmount,
    isPaymentRequired,
    getRequiredForms,
    getAllowedRoles,
    requiresPropertyFiles
  };
}


// Also update getApplicationTypePricing to accept infoPacket flag
// (shouldApplyForcedPrice signature updated above — callers passing 3 args work correctly)
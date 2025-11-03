/**
 * Application Types Management Utility
 * Handles application type determination, pricing, and form management
 * Updated to use property-based application types with environment variable pricing
 */

import { supabase } from './supabase';
import { getPricing, calculatePricingTotal, getPricingDisplay } from './pricingConfig';
import { getForcedPriceValue } from './propertyPricingUtils';

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
 * @returns {string} - Application type name
 */
export function determineApplicationType(submitterType, hoaProperty, publicOffering = false) {
  // Public Offering Statement (special case for builders)
  if (publicOffering) {
    return 'public_offering';
  }
  
  // Settlement agents get special treatment based on property state
  if (submitterType === 'settlement' && hoaProperty) {
    const propertyState = getPropertyState(hoaProperty.location);
    if (propertyState === 'VA') return 'settlement_va';
    if (propertyState === 'NC') return 'settlement_nc';
  }
  
  // Multi-community properties
  if (hoaProperty && hoaProperty.is_multi_community) {
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
 * Get pricing for application type
 * @param {string} applicationTypeName - The application type name
 * @param {string} packageType - 'standard' or 'rush'
 * @param {number} propertyId - Optional property ID to check for forced price
 * @param {Object} supabaseClient - Optional Supabase client (for server-side use)
 * @returns {Promise<number>} - Price in dollars
 */
export async function getApplicationTypePricing(applicationTypeName, packageType, propertyId = null, supabaseClient = null) {
  // Check for forced price override if propertyId is provided
  if (propertyId) {
    try {
      const forcedPrice = await getForcedPriceValue(propertyId, supabaseClient);
      if (forcedPrice !== null) {
        // Forced price overrides base price, but rush fees still apply
        if (packageType === 'rush') {
          const pricing = getPricing(applicationTypeName, true); // Get rush pricing
          const rushFee = pricing.rushFee / 100; // Convert cents to dollars
          return forcedPrice + rushFee;
        }
        return forcedPrice;
      }
    } catch (error) {
      console.error('Error checking forced price:', error);
      // Fall through to standard pricing if check fails
    }
  }
  
  // Use standard pricing logic
  const isRush = packageType === 'rush';
  const pricing = getPricing(applicationTypeName, isRush);
  return pricing.total / 100; // Convert cents to dollars
}

/**
 * Get form steps for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Array} - Array of form step objects
 */
export function getFormSteps(applicationTypeName) {
  if (applicationTypeName === 'public_offering') {
    // Skip to payment immediately
    return [
      { id: 1, name: 'Submitter Info', key: 'submitter' },
      { id: 2, name: 'Payment', key: 'payment' }
    ];
  }
  
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    // Settlement agent simplified flow
    return [
      { id: 1, name: 'Submitter Info', key: 'submitter' },
      { id: 2, name: 'Property Selection', key: 'property' },
      { id: 3, name: 'Buyer Information', key: 'buyer' },
      { id: 4, name: 'Payment & Summary', key: 'payment' }
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
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return {
      requiresSellerInfo: false,
      requiresTransactionDetails: false,
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
  if (applicationTypeName === 'public_offering') {
    return {
      title: 'Public Offering Statement Request',
      subtitle: 'Document delivery only',
      pricingNote: '$200 flat fee',
      completionMessage: 'Request submitted. Staff will deliver the document.',
      formType: 'Public Offering Statement'
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
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return ['settlement_form'];
  }
  
  if (applicationTypeName === 'public_offering') {
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
  
  // Single property, multi-community, and public offering
  return ['staff'];
}

/**
 * Check if application type requires property files
 * @param {string} applicationTypeName - The application type name
 * @returns {boolean} - Whether property files are required
 */
export function requiresPropertyFiles(applicationTypeName) {
  if (applicationTypeName === 'settlement_va' || applicationTypeName === 'settlement_nc') {
    return false;
  }
  
  if (applicationTypeName === 'public_offering') {
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
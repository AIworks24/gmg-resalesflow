/**
 * Application Types Management Utility
 * Handles application type determination, pricing, and form management
 */

import { supabase } from './supabase';

// Utility function for property state detection
function getPropertyState(location) {
  if (!location) return null;
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) return 'VA';
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) return 'NC';
  return null;
}

/**
 * Determine application type based on submitter and property
 * @param {string} submitterType - The submitter type ('settlement', 'realtor', etc.)
 * @param {Object} hoaProperty - The selected HOA property object
 * @returns {string} - Application type name
 */
export function determineApplicationType(submitterType, hoaProperty) {
  // Special request: Public Offering Statement under Builder/Developer
  // This is handled as its own application type on the client via formData.publicOffering
  // Server may receive explicit flag via metadata; keep default rules here.
  if (submitterType === 'settlement' && hoaProperty) {
    const propertyState = getPropertyState(hoaProperty.location);
    if (propertyState === 'VA') return 'settlement_agent_va';
    if (propertyState === 'NC') return 'settlement_agent_nc';
  }
  
  return 'standard'; // Default to standard application
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
 * @returns {Promise<number>} - Price in dollars
 */
export async function getApplicationTypePricing(applicationTypeName, packageType) {
  if (applicationTypeName === 'public_offering_statement') {
    const basePrice = 200.0;
    const rushFee = packageType === 'rush' ? 70.66 : 0;
    return basePrice + rushFee;
  }
  const appTypeData = await getApplicationTypeData(applicationTypeName);
  
  const priceInCents = packageType === 'rush' 
    ? appTypeData.price_rush 
    : appTypeData.price_standard;
    
  return priceInCents / 100; // Convert cents to dollars
}

/**
 * Get form steps for application type
 * @param {string} applicationTypeName - The application type name
 * @returns {Array} - Array of form step objects
 */
export function getFormSteps(applicationTypeName) {
  if (applicationTypeName === 'public_offering_statement') {
    // Skip to payment immediately
    return [
      { id: 1, name: 'Submitter Info', key: 'submitter' },
      { id: 2, name: 'Payment', key: 'payment' }
    ];
  }
  if (applicationTypeName.startsWith('settlement_agent')) {
    // Settlement agent simplified flow
    return [
      { id: 1, name: 'Submitter Info', key: 'submitter' },
      { id: 2, name: 'Property Selection', key: 'property' },
      { id: 3, name: 'Buyer Information', key: 'buyer' },
      { id: 4, name: 'Payment & Summary', key: 'payment' }
    ];
  }
  
  // Standard application flow (unchanged)
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
  if (applicationTypeName.startsWith('settlement_agent')) {
    return {
      requiresSellerInfo: false,
      requiresTransactionDetails: false,
      requiresBuyerInfo: true,
      requiresClosingDate: true,
      skipPropertyFiles: true
    };
  }
  
  // Standard application requirements
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
  if (applicationTypeName === 'public_offering_statement') {
    return {
      title: 'Public Offering Statement Request',
      subtitle: 'Document delivery only',
      pricingNote: '$200 flat fee',
      completionMessage: 'Request submitted. Staff will deliver the document.',
      formType: 'Public Offering Statement'
    };
  }
  if (applicationTypeName.startsWith('settlement_agent')) {
    const isVirginia = applicationTypeName === 'settlement_agent_va';
    
    return {
      title: 'Settlement Agent Application',
      subtitle: 'Simplified process for settlement agents',
      pricingNote: isVirginia 
        ? 'FREE by Virginia law + optional rush fee'
        : 'North Carolina settlement pricing',
      completionMessage: 'Settlement form created and sent to accounting for review',
      formType: 'Settlement Agent Request'
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
  const basePrice = await getApplicationTypePricing(applicationTypeName, packageType);
  
  let total = basePrice;
  
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
  const pricing = await getApplicationTypePricing(applicationTypeName, packageType);
  return pricing > 0;
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
    isPaymentRequired
  };
}
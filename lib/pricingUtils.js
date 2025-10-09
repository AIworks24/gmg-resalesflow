/**
 * Utility functions for settlement agent pricing calculations
 */

/**
 * Extract state from HOA property location string
 * @param {string} location - Location string from hoa_properties.location
 * @returns {string|null} - 'VA', 'NC', or null if unknown
 */
function getPropertyState(location) {
  if (!location) return null;
  
  const locationUpper = location.toUpperCase();
  
  // Check for Virginia indicators
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) {
    return 'VA';
  }
  
  // Check for North Carolina indicators  
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) {
    return 'NC';
  }
  
  return null;
}

/**
 * Calculate settlement agent pricing based on property state and rush option
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {boolean} isRush - Whether rush processing is selected
 * @returns {number} - Price in cents for Stripe
 */
function calculateSettlementPrice(propertyState, isRush) {
  if (propertyState === 'VA') {
    // Virginia: FREE by law, only rush fee if selected
    return isRush ? 7066 : 0; // $70.66 or $0.00
  } else if (propertyState === 'NC') {
    // North Carolina: $450 standard, $550 rush
    return isRush ? 55000 : 45000; // $550.00 or $450.00
  }
  
  throw new Error(`Unknown property state: ${propertyState}`);
}

/**
 * Calculate settlement agent pricing in dollars (for display)
 * @param {string} propertyState - 'VA' or 'NC'
 * @param {boolean} isRush - Whether rush processing is selected
 * @returns {number} - Price in dollars
 */
function calculateSettlementPriceDisplay(propertyState, isRush) {
  return calculateSettlementPrice(propertyState, isRush) / 100;
}

/**
 * Get settlement form document type based on property state
 * @param {string} propertyState - 'VA' or 'NC'
 * @returns {string} - Document type description
 */
function getSettlementDocumentType(propertyState) {
  if (propertyState === 'VA') {
    return 'Dues Request - Escrow Instructions';
  } else if (propertyState === 'NC') {
    return 'Statement of Unpaid Assessments';
  }
  
  throw new Error(`Unknown property state: ${propertyState}`);
}

/**
 * Check if property state is supported for settlement agents
 * @param {string} propertyState - State to check
 * @returns {boolean} - Whether state is supported
 */
function isSupportedSettlementState(propertyState) {
  return propertyState === 'VA' || propertyState === 'NC';
}

// Export functions for both ES modules and CommonJS
module.exports = {
  getPropertyState,
  calculateSettlementPrice,
  calculateSettlementPriceDisplay,
  getSettlementDocumentType,
  isSupportedSettlementState
};

// Note: This file is used primarily on the backend (CommonJS)
// For frontend usage, use the applicationTypes.js module instead
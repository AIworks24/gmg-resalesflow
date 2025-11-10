/**
 * Environment Variable Pricing Configuration
 * Handles all pricing logic via environment variables for maximum flexibility
 */

// Load environment variables first (for testing and development)
if (typeof process !== 'undefined' && !process.env.SINGLE_PROPERTY_BASE_PRICE) {
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch (error) {
    // Silently fail if .env.local doesn't exist
  }
}

// Validation schema for pricing configuration
const PricingSchema = {
  SINGLE_PROPERTY_BASE_PRICE: { min: 0, default: 31795 },
  SINGLE_PROPERTY_RUSH_FEE: { min: 0, default: 7066 },
  MULTI_COMMUNITY_BASE_PRICE: { min: 0, default: 45000 },
  MULTI_COMMUNITY_RUSH_FEE: { min: 0, default: 10000 },
  SETTLEMENT_VA_PRICE: { min: 0, default: 0 },
  SETTLEMENT_VA_RUSH_FEE: { min: 0, default: 7066 },
  SETTLEMENT_NC_PRICE: { min: 0, default: 45000 },
  SETTLEMENT_NC_RUSH_FEE: { min: 0, default: 10000 },
  PUBLIC_OFFERING_PRICE: { min: 0, default: 20000 },
  LENDER_QUESTIONNAIRE_BASE_PRICE: { min: 0, default: 40000 },
  LENDER_QUESTIONNAIRE_RUSH_FEE: { min: 0, default: 10000 },
};

// Parse and validate environment variables
function parseEnvVar(key, schema) {
  const value = parseInt(process.env[key]);
  if (isNaN(value) || value < schema.min) {
    console.warn(`Invalid ${key}: ${process.env[key]}, using default: ${schema.default}`);
    return schema.default;
  }
  return value;
}

// Load pricing configuration from environment variables
export const PRICING_CONFIG = {
  SINGLE_PROPERTY_BASE_PRICE: parseEnvVar('SINGLE_PROPERTY_BASE_PRICE', PricingSchema.SINGLE_PROPERTY_BASE_PRICE),
  SINGLE_PROPERTY_RUSH_FEE: parseEnvVar('SINGLE_PROPERTY_RUSH_FEE', PricingSchema.SINGLE_PROPERTY_RUSH_FEE),
  MULTI_COMMUNITY_BASE_PRICE: parseEnvVar('MULTI_COMMUNITY_BASE_PRICE', PricingSchema.MULTI_COMMUNITY_BASE_PRICE),
  MULTI_COMMUNITY_RUSH_FEE: parseEnvVar('MULTI_COMMUNITY_RUSH_FEE', PricingSchema.MULTI_COMMUNITY_RUSH_FEE),
  SETTLEMENT_VA_PRICE: parseEnvVar('SETTLEMENT_VA_PRICE', PricingSchema.SETTLEMENT_VA_PRICE),
  SETTLEMENT_VA_RUSH_FEE: parseEnvVar('SETTLEMENT_VA_RUSH_FEE', PricingSchema.SETTLEMENT_VA_RUSH_FEE),
  SETTLEMENT_NC_PRICE: parseEnvVar('SETTLEMENT_NC_PRICE', PricingSchema.SETTLEMENT_NC_PRICE),
  SETTLEMENT_NC_RUSH_FEE: parseEnvVar('SETTLEMENT_NC_RUSH_FEE', PricingSchema.SETTLEMENT_NC_RUSH_FEE),
  PUBLIC_OFFERING_PRICE: parseEnvVar('PUBLIC_OFFERING_PRICE', PricingSchema.PUBLIC_OFFERING_PRICE),
  LENDER_QUESTIONNAIRE_BASE_PRICE: parseEnvVar('LENDER_QUESTIONNAIRE_BASE_PRICE', PricingSchema.LENDER_QUESTIONNAIRE_BASE_PRICE),
  LENDER_QUESTIONNAIRE_RUSH_FEE: parseEnvVar('LENDER_QUESTIONNAIRE_RUSH_FEE', PricingSchema.LENDER_QUESTIONNAIRE_RUSH_FEE),
};

// Log pricing configuration on startup (for debugging)
if (process.env.NODE_ENV === 'development') {
  console.log('💰 Pricing Configuration Loaded:', PRICING_CONFIG);
}

/**
 * Get pricing for a specific application type
 * @param {string} applicationType - The application type
 * @param {boolean} isRush - Whether rush processing is requested
 * @returns {Object} Pricing information
 */
export function getPricing(applicationType, isRush = false) {
  const config = {
    single_property: {
      base: PRICING_CONFIG.SINGLE_PROPERTY_BASE_PRICE,
      rush: PRICING_CONFIG.SINGLE_PROPERTY_RUSH_FEE
    },
    multi_community: {
      base: PRICING_CONFIG.MULTI_COMMUNITY_BASE_PRICE,
      rush: PRICING_CONFIG.MULTI_COMMUNITY_RUSH_FEE
    },
    settlement_va: {
      base: PRICING_CONFIG.SETTLEMENT_VA_PRICE,
      rush: PRICING_CONFIG.SETTLEMENT_VA_RUSH_FEE // VA settlement standard is free, rush is $70.66
    },
    settlement_nc: {
      base: PRICING_CONFIG.SETTLEMENT_NC_PRICE,
      rush: PRICING_CONFIG.SETTLEMENT_NC_RUSH_FEE
    },
    public_offering: {
      base: PRICING_CONFIG.PUBLIC_OFFERING_PRICE,
      rush: 0 // Public offering doesn't have rush processing
    },
    lender_questionnaire: {
      base: PRICING_CONFIG.LENDER_QUESTIONNAIRE_BASE_PRICE,
      rush: PRICING_CONFIG.LENDER_QUESTIONNAIRE_RUSH_FEE
    }
  };

  const pricing = config[applicationType];
  if (!pricing) {
    throw new Error(`Unknown application type: ${applicationType}`);
  }

  const rushFee = isRush ? pricing.rush : 0;
  const total = pricing.base + rushFee;

  return {
    base: pricing.base,
    rushFee: rushFee,
    total: total,
    isRush: isRush,
    applicationType: applicationType
  };
}

/**
 * Calculate total amount for an application
 * @param {string} applicationType - The application type
 * @param {boolean} isRush - Whether rush processing is requested
 * @returns {number} Total amount in cents
 */
export function calculatePricingTotal(applicationType, isRush = false) {
  const pricing = getPricing(applicationType, isRush);
  return pricing.total;
}

/**
 * Format price for display
 * @param {number} priceInCents - Price in cents
 * @returns {string} Formatted price string
 */
export function formatPrice(priceInCents) {
  return `$${(priceInCents / 100).toFixed(2)}`;
}

/**
 * Get pricing information for display
 * @param {string} applicationType - The application type
 * @param {boolean} isRush - Whether rush processing is requested
 * @returns {Object} Formatted pricing information
 */
export function getPricingDisplay(applicationType, isRush = false) {
  const pricing = getPricing(applicationType, isRush);
  
  return {
    base: formatPrice(pricing.base),
    rushFee: formatPrice(pricing.rushFee),
    total: formatPrice(pricing.total),
    isRush: pricing.isRush,
    applicationType: pricing.applicationType
  };
}

/**
 * Validate pricing configuration on startup
 */
export function validatePricingConfig() {
  const requiredVars = Object.keys(PricingSchema);
  const missingVars = requiredVars.filter(key => !process.env[key]);
  
  if (missingVars.length > 0) {
    console.warn(`⚠️  Missing pricing environment variables: ${missingVars.join(', ')}`);
    console.warn('Using default values. Please set these environment variables for production.');
  }
  
  return true;
}

// Validate configuration on module load
validatePricingConfig();
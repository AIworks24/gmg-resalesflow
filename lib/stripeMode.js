/**
 * Stripe Mode Utility
 * Handles switching between test (sandbox) and live (production) modes
 */

/**
 * Check if test mode is enabled based on query parameter
 * Usage: ?test=YOUR_SECRET_CODE
 * 
 * @param {string} testCode - The test code from query parameter
 * @returns {boolean} - True if test mode should be enabled
 */
export function isTestModeEnabled(testCode) {
  if (!testCode) {
    return false;
  }

  const validTestCode = process.env.TEST_MODE_CODE;
  
  // If no test code is configured, allow test mode only in development
  if (!validTestCode) {
    return process.env.NODE_ENV === 'development';
  }

  // Compare test code (case-sensitive)
  return testCode === validTestCode;
}

/**
 * Get Stripe keys based on mode (test or live)
 * 
 * @param {boolean} useTestMode - Whether to use test mode
 * @returns {Object} - Object with publishableKey and secretKey
 */
function getStripeKeys(useTestMode = false) {
  if (useTestMode) {
    return {
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET,
    };
  } else {
    return {
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      secretKey: process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET,
    };
  }
}

/**
 * Get Stripe Price IDs or Product IDs based on mode (test or live)
 * Supports both Price IDs (price_...) and Product IDs (prod_...)
 * If Product ID is provided, the code will fetch its default price
 * 
 * @param {boolean} useTestMode - Whether to use test mode
 * @returns {Object} - Object with standardProcessingPriceId and rushProcessingPriceId
 *                    (can be Price ID or Product ID)
 */
function getStripePriceIds(useTestMode = false) {
  if (useTestMode) {
    return {
      standardProcessingPriceId: process.env.STRIPE_STD_PROCESSING_TEST || process.env.STRIPE_STD_PROCESSING,
      rushProcessingPriceId: process.env.STRIPE_RUSH_PROCESSING_TEST || process.env.STRIPE_RUSH_PROCESSING,
    };
  } else {
    return {
      standardProcessingPriceId: process.env.STRIPE_STD_PROCESSING_LIVE || process.env.STRIPE_STD_PROCESSING,
      rushProcessingPriceId: process.env.STRIPE_RUSH_PROCESSING_LIVE || process.env.STRIPE_RUSH_PROCESSING,
    };
  }
}

/**
 * Extract test mode from request (works for both client and server)
 * Defaults to LIVE mode if no valid test code is found
 * 
 * @param {Object} req - Request object (server-side) or window location (client-side)
 * @returns {boolean} - True if test mode should be enabled, false for LIVE mode
 */
function getTestModeFromRequest(req) {
  // Server-side: check query parameters first
  if (req && req.query && req.query.test) {
    const testCode = req.query.test;
    const isValid = isTestModeEnabled(testCode);
    // If invalid code, default to LIVE (return false)
    return isValid;
  }
  
  // Server-side: check request body
  if (req && req.body && req.body.testMode === true) {
    // Only trust explicit testMode: true from body
    return true;
  }
  
  // Client-side: check URL search params first
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const testCode = params.get('test');
    
    if (testCode) {
      // If test code is present, validate it
      const isValid = isTestModeEnabled(testCode);
      // If invalid code, default to LIVE (return false)
      return isValid;
    }
    
    // No test code in URL - check cookie for session persistence
    const cookieTestMode = getTestModeFromCookie();
    return cookieTestMode;
  }
  
  // Default: LIVE mode (return false)
  return false;
}

/**
 * Get test mode from cookies (for client-side persistence)
 * 
 * @returns {boolean} - True if test mode cookie is set
 */
function getTestModeFromCookie() {
  if (typeof document === 'undefined') {
    return false;
  }
  
  const cookies = document.cookie.split(';');
  const testModeCookie = cookies.find(cookie => cookie.trim().startsWith('test_mode='));
  
  if (testModeCookie) {
    return testModeCookie.split('=')[1] === 'true';
  }
  
  return false;
}

/**
 * Set test mode cookie (for client-side persistence - session only)
 * 
 * @param {boolean} enabled - Whether test mode is enabled
 */
function setTestModeCookie(enabled) {
  if (typeof document === 'undefined') {
    return;
  }
  
  // Set session-only cookie (no expires date = session cookie)
  if (enabled) {
    document.cookie = `test_mode=true; path=/; SameSite=Lax`;
  } else {
    // Remove cookie if disabling test mode
    document.cookie = `test_mode=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

/**
 * Get current Stripe mode (for logging/debugging)
 * 
 * @param {boolean} useTestMode - Whether test mode is enabled
 * @returns {string} - 'test' or 'live'
 */
function getStripeMode(useTestMode) {
  return useTestMode ? 'test' : 'live';
}

/**
 * Get Stripe Connected Account ID based on mode (test or live)
 * 
 * @param {boolean} useTestMode - Whether to use test mode
 * @returns {string|null} - Connected account ID or null if not configured
 */
function getConnectedAccountId(useTestMode = false) {
  if (useTestMode) {
    return process.env.STRIPE_CONNECTED_ACCOUNT_ID_TEST || process.env.STRIPE_CONNECTED_ACCOUNT_ID || null;
  } else {
    return process.env.STRIPE_CONNECTED_ACCOUNT_ID_LIVE || process.env.STRIPE_CONNECTED_ACCOUNT_ID || null;
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isTestModeEnabled,
    getStripeKeys,
    getStripePriceIds,
    getTestModeFromRequest,
    getTestModeFromCookie,
    setTestModeCookie,
    getStripeMode,
    getConnectedAccountId,
  };
}

// Export for ES modules
export {
  isTestModeEnabled,
  getStripeKeys,
  getStripePriceIds,
  getTestModeFromRequest,
  getTestModeFromCookie,
  setTestModeCookie,
  getStripeMode,
  getConnectedAccountId,
};


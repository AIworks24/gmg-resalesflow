import { loadStripe } from '@stripe/stripe-js';
import { getStripeKeys, getTestModeFromRequest, getStripeMode } from './stripeMode';

/**
 * Client-side Stripe instance with error handling
 * @param {boolean} useTestMode - Whether to use test mode keys
 */
export const getStripe = (useTestMode = false) => {
  try {
    const keys = getStripeKeys(useTestMode);
    const mode = getStripeMode(useTestMode);
    console.log(`[Stripe] Initializing client-side in ${mode} mode`);
    return loadStripe(keys.publishableKey);
  } catch (error) {
    console.warn('Failed to load Stripe:', error);
    return Promise.reject(error);
  }
};

/**
 * Enhanced Stripe wrapper that handles common ad blocker issues
 * @param {boolean} useTestMode - Whether to use test mode keys
 */
export const getStripeWithFallback = async (useTestMode = false) => {
  try {
    const keys = getStripeKeys(useTestMode);
    const mode = getStripeMode(useTestMode);
    console.log(`[Stripe] Initializing with fallback in ${mode} mode`);
    
    const stripe = await loadStripe(keys.publishableKey);
    
    // Test if Stripe is working by checking if it has the expected methods
    if (!stripe || typeof stripe.redirectToCheckout !== 'function') {
      throw new Error('Stripe failed to initialize properly');
    }
    
    return stripe;
  } catch (error) {
    console.warn('Stripe initialization failed:', error);
    
    // Check if it's a network/blocking error
    if (error.message && (
      error.message.includes('Failed to fetch') ||
      error.message.includes('ERR_BLOCKED_BY_CLIENT') ||
      error.message.includes('r.stripe.com')
    )) {
      throw new Error('Payment system is temporarily unavailable. This may be due to browser security settings or ad blockers. Please try disabling ad blockers or contact support.');
    }
    
    throw error;
  }
};

/**
 * Server-side Stripe instance
 * Defaults to LIVE mode if no valid test code is provided
 * @param {Object} req - Request object (optional, for detecting test mode)
 * @param {Object} options - Optional: { forceTestMode: boolean } (e.g. for impersonation)
 */
export const getServerStripe = (req = null, options = {}) => {
  let useTestMode = req ? getTestModeFromRequest(req) : false;
  if (options.forceTestMode === true) useTestMode = true;
  const keys = getStripeKeys(useTestMode);
  const mode = getStripeMode(useTestMode);
  
  if (!keys.secretKey) {
    throw new Error(`[Stripe] Missing ${mode} secret key. Please set STRIPE_SECRET_KEY${useTestMode ? '_TEST' : '_LIVE'} or STRIPE_SECRET_KEY in environment variables.`);
  }
  
  console.log(`[Stripe] Initializing server-side in ${mode} mode`);
  
  const stripe = require('stripe')(keys.secretKey);
  return stripe;
};

/**
 * Get webhook secret based on mode
 * @param {boolean} useTestMode - Whether to use test mode
 */
export const getWebhookSecret = (useTestMode = false) => {
  const keys = getStripeKeys(useTestMode);
  return keys.webhookSecret;
};

// Package pricing configuration
export const PACKAGE_PRICING = {
  standard: {
    basePrice: 31795, // $317.95 in cents
    rushFee: 0,
    description: 'Standard Processing (15 calendar days)'
  },
  rush: {
    basePrice: 31795, // $317.95 in cents
    rushFee: 7066, // $70.66 in cents
    description: 'Rush Processing (5 business days)'
  }
};

// Payment method fees
export const PAYMENT_FEES = {
  credit_card: 995, // $9.95 in cents
  ach: 0
};

// Calculate total amount in cents
export const calculateTotalAmount = (packageType, paymentMethod) => {
  const packageConfig = PACKAGE_PRICING[packageType];
  const paymentFee = PAYMENT_FEES[paymentMethod];
  
  return packageConfig.basePrice + packageConfig.rushFee + paymentFee;
};

// Dynamic URLs - constructed at runtime using the request origin
export const getStripeUrls = (origin) => ({
  success: `${origin}/payment/success`,
  cancel: `${origin}/payment/cancel`,
  webhook: `${origin}/api/webhooks/stripe`
});

/**
 * Convert Stripe/checkout errors into user-friendly messages
 * @param {Error} error
 * @returns {string}
 */
export function getFriendlyPaymentErrorMessage(error) {
  const msg = error?.message || '';
  // Test session vs live Stripe.js (e.g. during impersonation without test key on client)
  if (
    msg.includes('sessionId is for a test mode') ||
    msg.includes('test mode Checkout Session') ||
    (msg.includes('Stripe.js') && msg.includes('live mode publishable key'))
  ) {
    return "Payment is in test mode for this session. If you're viewing as another user, this is expected—please try again. If the problem continues, contact support.";
  }
  // Live session vs test Stripe.js
  if (
    msg.includes('sessionId is for a live mode') ||
    msg.includes('live mode Checkout Session') ||
    (msg.includes('Stripe.js') && msg.includes('test mode publishable key'))
  ) {
    return "The payment page couldn't be opened because of a test/live mode mismatch. Please try again or contact support.";
  }
  if (msg.includes('Failed to fetch') || msg.includes('ERR_BLOCKED_BY_CLIENT') || msg.includes('r.stripe.com')) {
    return 'Payment system is temporarily unavailable. This may be due to browser security settings or ad blockers. Please try disabling ad blockers or contact support.';
  }
  return msg || 'We couldn\'t open the payment page. Please try again or contact support.';
}

// Legacy URLs (kept for backward compatibility but not used)
export const STRIPE_URLS = {
  success: process.env.NODE_ENV === 'production' 
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/payment/success`
    : 'http://localhost:3000/payment/success',
  cancel: process.env.NODE_ENV === 'production'
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/payment/cancel`
    : 'http://localhost:3000/payment/cancel',
  webhook: process.env.NODE_ENV === 'production'
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/stripe`
    : 'http://localhost:3000/api/webhooks/stripe'
}; 
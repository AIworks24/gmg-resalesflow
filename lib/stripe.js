import { loadStripe } from '@stripe/stripe-js';

// Client-side Stripe instance with error handling
export const getStripe = () => {
  try {
    return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  } catch (error) {
    console.warn('Failed to load Stripe:', error);
    return Promise.reject(error);
  }
};

// Enhanced Stripe wrapper that handles common ad blocker issues
export const getStripeWithFallback = async () => {
  try {
    const stripe = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    
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

// Server-side Stripe instance
export const getServerStripe = () => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
};

// Package pricing configuration
export const PACKAGE_PRICING = {
  standard: {
    basePrice: 31795, // $317.95 in cents
    rushFee: 0,
    description: 'Standard Processing (10-15 business days)'
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
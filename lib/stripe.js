import { loadStripe } from '@stripe/stripe-js';

// Client-side Stripe instance
export const getStripe = () => {
  return loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
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

// Firebase hosting URLs (update these with your actual Firebase domain)
export const STRIPE_URLS = {
  success: process.env.NODE_ENV === 'production' 
    ? 'https://your-firebase-app.web.app/payment/success'
    : 'http://localhost:3000/payment/success',
  cancel: process.env.NODE_ENV === 'production'
    ? 'https://your-firebase-app.web.app/payment/cancel'
    : 'http://localhost:3000/payment/cancel',
  webhook: process.env.NODE_ENV === 'production'
    ? 'https://your-firebase-app.web.app/api/webhooks/stripe'
    : 'http://localhost:3000/api/webhooks/stripe'
}; 
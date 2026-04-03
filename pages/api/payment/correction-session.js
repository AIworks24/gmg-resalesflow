import { createClient } from '@supabase/supabase-js';
import { getServerStripe } from '../../../lib/stripe';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STRIPE_MIN_EXPIRY_MS = 30 * 60 * 1000; // Stripe minimum: 30 minutes

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { applicationId, testWindowMinutes } = req.query;

  // Dev-only: shrink the payment window for testing expiry without waiting 48 hrs.
  // e.g. GET /api/payment/correction-session?applicationId=X&testWindowMinutes=1
  const paymentWindowMs = (process.env.NODE_ENV === 'development' && testWindowMinutes)
    ? parseInt(testWindowMinutes, 10) * 60 * 1000
    : 48 * 60 * 60 * 1000;
  if (!applicationId) {
    return res.status(400).json({ error: 'applicationId is required' });
  }

  const { data: app, error: fetchError } = await supabase
    .from('applications')
    .select(
      'id, processing_locked, processing_locked_reason, processing_locked_at, ' +
      'correction_stripe_session_id, is_test_transaction, stripe_session_id, ' +
      'correction_metadata'
    )
    .eq('id', applicationId)
    .single();

  if (fetchError || !app) {
    return res.status(404).json({ status: 'not_found' });
  }

  // Not a pending correction invoice — already paid or no invoice was created
  if (!app.processing_locked || app.processing_locked_reason !== 'pending_property_correction_payment') {
    return res.status(200).json({ status: 'inactive' });
  }

  // Enforce strict 48-hour payment window from when the lock was set
  const lockedAt   = new Date(app.processing_locked_at).getTime();
  const windowEnd  = lockedAt + paymentWindowMs;
  const now        = Date.now();

  if (now >= windowEnd) {
    return res.status(200).json({ status: 'expired' });
  }

  const isTest = !!app.is_test_transaction
    || (app.stripe_session_id || '').startsWith('cs_test_');
  const stripe = getServerStripe(req, { forceTestMode: isTest });

  // Try the existing Stripe session first — reuse if still open
  if (app.correction_stripe_session_id) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(app.correction_stripe_session_id);
      if (existing.status === 'open') {
        return res.status(200).json({ status: 'redirect', url: existing.url });
      }
    } catch (e) {
      // Session not found or retrieval failed — fall through to recreate
      console.warn('correction-session: could not retrieve existing session:', e.message);
    }
  }

  // Session expired or missing — recreate within the remaining window
  const remainingMs = windowEnd - now;
  if (remainingMs < STRIPE_MIN_EXPIRY_MS) {
    // Less than 30 minutes left — treat as expired rather than create a session
    // that Stripe would immediately reject
    return res.status(200).json({ status: 'expired' });
  }

  const meta = app.correction_metadata || {};
  const { lineItems, paymentIntentData, totalAdditionalCents, submitterEmail } = meta;

  if (!lineItems || lineItems.length === 0 || !totalAdditionalCents) {
    console.error('correction-session: missing pricing data in correction_metadata for app', app.id);
    return res.status(200).json({ status: 'error' });
  }

  // Cap the session expiry at the payment window end (max 24 hrs per Stripe limit)
  const expiresAt = Math.floor(Math.min(windowEnd, now + 24 * 60 * 60 * 1000) / 1000);

  try {
    const sessionData = {
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items:           lineItems,
      expires_at:           expiresAt,
      success_url:          `${process.env.NEXT_PUBLIC_SITE_URL}/payment/correction-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:           `${process.env.NEXT_PUBLIC_SITE_URL}/payment/cancel`,
      customer_email:       submitterEmail,
      metadata: {
        applicationId:  String(applicationId),
        correctionType: 'additional_property',
      },
    };

    if (paymentIntentData) {
      sessionData.payment_intent_data = paymentIntentData;
    }

    const session = await stripe.checkout.sessions.create(sessionData);

    await supabase
      .from('applications')
      .update({
        correction_stripe_session_id: session.id,
        updated_at:                   new Date().toISOString(),
      })
      .eq('id', applicationId);

    return res.status(200).json({ status: 'redirect', url: session.url });

  } catch (stripeErr) {
    console.error('correction-session: Stripe session creation failed:', stripeErr);
    return res.status(200).json({ status: 'error' });
  }
}

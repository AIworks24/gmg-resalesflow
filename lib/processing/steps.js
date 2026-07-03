/**
 * Idempotent step handlers for the application processing job worker.
 *
 * Each handler receives { app, supabase, payload } and either returns an output object
 * (recorded on the job step) or throws (recorded as a step failure → retried with
 * backoff). Every handler is safe to run more than once: side-effects are guarded by a
 * durable marker column on `applications` (receipt_sent_at / property_owner_notified_at /
 * email_completed_at) or by the underlying create* helpers' existence checks.
 *
 * `payload` carries only IDs + Stripe references needed to reconstruct Stripe context
 * asynchronously (the worker runs after the webhook, so it has no live Stripe event):
 *   { eventId, eventType, testMode, applicationId, stripeSessionId,
 *     stripePaymentIntentId, amountTotal, customerEmail, customerName, propertyAddress,
 *     packageType, correctionType? }
 */

import {
  sendInvoiceReceiptEmail,
  sendPaymentConfirmationEmail,
} from '../emailService';
import { getStripeKeys } from '../stripeMode';
import {
  createPropertyOwnerForms,
  autoSubmitApplication,
  createMcGroups,
} from './handlers';

function getStripeClient(testMode) {
  const keys = getStripeKeys(!!testMode);
  return require('stripe')(keys.secretKey);
}

function emailsDisabled(app) {
  return app?.impersonation_metadata?.send_emails === false;
}

// ── send_receipt ────────────────────────────────────────────────────────────
// Sends the Stripe payment receipt exactly once (guarded by applications.receipt_sent_at,
// set only after a successful send). This durable guard is what eliminates the receipt
// race: no matter which Stripe event enqueued the job or how many times it retries, the
// receipt goes out a single time.
async function sendReceipt({ app, supabase, payload }) {
  if (app.receipt_sent_at) return { skipped: 'already_sent' };
  if (emailsDisabled(app)) {
    await supabase.from('applications')
      .update({ receipt_sent_at: new Date().toISOString() })
      .eq('id', app.id);
    return { skipped: 'impersonation_emails_disabled' };
  }

  const stripe = getStripeClient(payload.testMode);
  let receiptUrl = null;
  let receiptNumber = null;
  let paymentMethod = null;
  let lineItems = [];

  const paymentIntentId = payload.stripePaymentIntentId || app.stripe_payment_intent_id;
  if (paymentIntentId) {
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        receiptUrl = charge.receipt_url;
        receiptNumber = charge.receipt_number;
        if (charge.payment_method_details?.card) {
          const { brand, last4 } = charge.payment_method_details.card;
          paymentMethod = `${(brand || 'CARD').toUpperCase()} - ${last4 || '****'}`;
        }
      }
    } catch (err) {
      console.warn(`[Step:send_receipt] Could not retrieve charge for ${paymentIntentId}: ${err.message}`);
    }
  }

  const sessionId = payload.stripeSessionId || app.stripe_session_id;
  if (sessionId) {
    try {
      const sessionLineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
        expand: ['data.price.product'],
      });
      lineItems = (sessionLineItems?.data || []).map(item => {
        const product = item.price?.product && typeof item.price.product !== 'string'
          ? item.price.product : null;
        return {
          name: product?.name || item.description || 'Service',
          description: product?.description || item.description || null,
          amount: (item.amount_total / 100).toFixed(2),
          quantity: item.quantity || 1,
        };
      });
    } catch (err) {
      console.warn(`[Step:send_receipt] Could not retrieve line items for ${sessionId}: ${err.message}`);
    }
  }

  const recipient = app.submitter_email || payload.customerEmail;
  const totalAmount = (app.total_amount != null
    ? Number(app.total_amount)
    : (payload.amountTotal || 0) / 100).toFixed(2);

  try {
    await sendInvoiceReceiptEmail({
      to: recipient,
      applicationId: app.id,
      customerName: app.submitter_name || payload.customerName || 'Customer',
      propertyAddress: app.property_address || payload.propertyAddress || '',
      packageType: app.package_type || payload.packageType || 'standard',
      totalAmount,
      invoiceNumber: receiptNumber || `PAY-${app.id}`,
      invoicePdfUrl: receiptUrl,
      hostedInvoiceUrl: receiptUrl,
      stripeChargeId: paymentIntentId,
      invoiceDate: new Date().toISOString(),
      applicationType: app.application_type || 'single_property',
      paymentMethod,
      lineItems,
    });
  } catch (receiptErr) {
    // Match legacy behavior: fall back to the simpler payment confirmation email.
    await sendPaymentConfirmationEmail({
      to: recipient,
      applicationId: app.id,
      customerName: app.submitter_name,
      propertyAddress: app.property_address,
      packageType: app.package_type,
      totalAmount,
      stripeChargeId: paymentIntentId,
    });
  }

  await supabase.from('applications')
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq('id', app.id);

  return { recipient, receiptNumber, paymentMethod, lineItems: lineItems.length };
}

// ── create_forms ──────────────────────────────────────────────────────────────
async function createForms({ app, supabase }) {
  return await createPropertyOwnerForms(app.id, supabase);
}

// ── create_mc_groups ────────────────────────────────────────────────────────────
async function createMcGroupsStep({ app, supabase }) {
  return await createMcGroups(app.id, supabase);
}

// ── auto_submit ─────────────────────────────────────────────────────────────────
async function autoSubmit({ app, supabase }) {
  return await autoSubmitApplication(app.id, supabase);
}

// ── notify_owners ───────────────────────────────────────────────────────────────
// Creates in-app + email notifications for property owners / accounting (createNotifications
// handles all per-type routing). Guarded by applications.property_owner_notified_at. Runs
// AFTER status has advanced past pending_payment, so createNotifications' unpaid guard no
// longer skips it — this is what fixes the missing property-owner notifications.
async function notifyOwners({ app, supabase }) {
  if (app.property_owner_notified_at) return { skipped: 'already_notified' };

  const { createNotifications } = await import('../../pages/api/notifications/create');
  const result = await createNotifications(app.id, supabase);

  await supabase.from('applications')
    .update({ property_owner_notified_at: new Date().toISOString() })
    .eq('id', app.id);

  return {
    notificationsCreated: result?.notificationsCreated ?? null,
    emailsQueued: result?.emailsQueued ?? null,
  };
}

// ── deliver_documents ─────────────────────────────────────────────────────────
// For public_offering / info_packet: delivers the document(s) and auto-completes the
// application. Delegates to the existing internal endpoints (which set email_completed_at
// and status=completed). Guarded by applications.email_completed_at so Stripe redeliveries
// / retries never re-send the documents.
async function deliverDocuments({ app, payload }) {
  if (app.email_completed_at) return { skipped: 'already_delivered' };

  const endpoint = app.application_type === 'info_packet'
    ? '/api/send-info-packet-email'
    : '/api/send-public-offering-email';

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.INTERNAL_API_SECRET && { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` }),
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }),
    },
    body: JSON.stringify({ applicationId: app.id }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`deliver_documents (${endpoint}) failed (${res.status}): ${errText}`);
  }
  return { endpoint, delivered: true };
}

// ── mark_payment_confirmed ──────────────────────────────────────────────────────
// Lender questionnaire: no forms, no auto-submit. Just make the app visible and awaiting
// the requester's file upload (the upload API takes it to under_review + notifications).
async function markPaymentConfirmed({ app, supabase }) {
  const updates = { updated_at: new Date().toISOString() };
  if (app.status === 'pending_payment' || app.status === 'payment_completed') {
    updates.status = 'payment_confirmed';
  }
  if (!app.submitted_at) updates.submitted_at = new Date().toISOString();
  await supabase.from('applications').update(updates).eq('id', app.id);
  return { status: updates.status || app.status };
}

export const STEP_HANDLERS = {
  send_receipt: sendReceipt,
  create_forms: createForms,
  create_mc_groups: createMcGroupsStep,
  auto_submit: autoSubmit,
  notify_owners: notifyOwners,
  deliver_documents: deliverDocuments,
  mark_payment_confirmed: markPaymentConfirmed,
};

import { getServerStripe, getWebhookSecret } from '../../../lib/stripe';
import { getTestModeFromRequest } from '../../../lib/stripeMode';
import { sendEmail, sendInvoiceReceiptEmail, sendPaymentConfirmationEmail } from '../../../lib/emailService';
import { parseEmails } from '../../../lib/emailUtils';
import { enqueueJob } from '../../../lib/processing/enqueue';

// Helper function to get raw body for webhook signature verification
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      resolve(Buffer.from(body, 'utf8'));
    });
    req.on('error', err => {
      reject(err);
    });
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  
  // Get raw body first (needed for signature verification)
  const rawBody = await getRawBody(req);
  
  // Get both secrets for verification
  const testSecret = getWebhookSecret(true);
  const liveSecret = getWebhookSecret(false);
  
  // Try to verify with test mode secret first (since most events are test mode)
  // Then try live mode if that fails
  let event;
  let useTestMode = true; // Start with test mode since livemode: false events are common
  let endpointSecret;
  
  // We need a temporary Stripe instance just for webhook verification
  // We'll create the correct one after we know the event's livemode
  const tempStripe = getServerStripe(req);
  
  try {
    // Try test mode first
    endpointSecret = testSecret;
    event = tempStripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    useTestMode = true;
  } catch (testErr) {
    // Try live mode
    try {
      endpointSecret = liveSecret;
      event = tempStripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
      useTestMode = false;
    } catch (liveErr) {
      console.error('[Webhook] ✗ Both test and live mode verification failed');
      console.error('[Webhook] Test mode error:', testErr.message);
      console.error('[Webhook] Live mode error:', liveErr.message);
      console.error('[Webhook] Signature header:', sig ? `${sig.substring(0, 50)}...` : 'MISSING');
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }
  }
  
  // Now determine the correct mode from the event itself (most reliable)
  // event.livemode is false for test mode, true for live mode
  const eventIsLiveMode = event.livemode === true;
  const correctTestMode = !eventIsLiveMode;
  
  // Create the correct Stripe client based on the event's livemode
  const { getStripeKeys } = require('../../../lib/stripeMode');
  const keys = getStripeKeys(correctTestMode);
  const stripe = require('stripe')(keys.secretKey);
  
  console.log(`[Webhook] Event livemode: ${event.livemode}, using ${correctTestMode ? 'test' : 'live'} mode Stripe client`);

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;

        // --- Correction payment early exit ---
        // Correction payments (additional_property, rush_upgrade) are created by the
        // Restructure Application feature. They use correction_stripe_session_id on the
        // application row — NOT stripe_session_id — so the standard lookup below would
        // silently no-op. Route them to the dedicated handler instead.
        if (session.metadata?.correctionType) {
          console.log(`[Webhook] Correction payment detected: type=${session.metadata.correctionType}, session=${session.id}`);
          await handleCorrectionPayment(session, stripe, supabase);
          break;
        }

        // Mark payment as completed and record timestamps.
        // Does NOT touch status — status progression is owned by payment_intent.succeeded.
        const updateData = {
          payment_completed_at: new Date().toISOString(),
          payment_status: 'completed'
        };

        // Store the payment intent ID if available
        if (session.payment_intent) {
          updateData.stripe_payment_intent_id = session.payment_intent;
        }

          // Idempotency guard: skip if already processed (prevents duplicate emails on Stripe retries)
          const { data: updatedApp } = await supabase
            .from('applications')
            .update(updateData)
            .eq('stripe_session_id', session.id)
            .neq('payment_status', 'completed')
          .select('id, application_type, impersonation_metadata')
          .single();

        if (!updatedApp) {
          console.log(`[Webhook] checkout.session.completed already processed for session ${session.id} — skipping duplicate`);
          break;
        }

        // Write redemption audit record when a per-user Builder price override was applied.
        // Primary path uses checkout metadata; fallback path resolves from the application
        // so single-property checkouts are still counted even if metadata is incomplete.
        if (session.metadata?.pricing_source === 'user_override' || updatedApp?.id) {
          try {
            let pricingId = session.metadata.builder_pricing_id || null;
            let overrideUserId = session.metadata.override_user_id || null;
            let appForOverride = null;
            let canFallbackLookup = false;

            if ((!pricingId || !overrideUserId) && updatedApp?.id) {
              const { data: appRow } = await supabase
                .from('applications')
                .select('id, user_id, hoa_property_id, submitter_type, application_type')
                .eq('id', updatedApp.id)
                .single();
              appForOverride = appRow;

              // Fallback resolution is only valid for builder resale flows.
              // Explicit metadata flag still takes precedence regardless of type.
              canFallbackLookup =
                session.metadata?.pricing_source === 'user_override' ||
                (
                  appForOverride?.submitter_type === 'builder' &&
                  appForOverride?.application_type !== 'public_offering' &&
                  appForOverride?.application_type !== 'info_packet' &&
                  appForOverride?.application_type !== 'lender_questionnaire'
                );

              if (!overrideUserId) {
                overrideUserId = appForOverride?.user_id || null;
              }

              if (canFallbackLookup && !pricingId && overrideUserId && appForOverride?.hoa_property_id) {
                const propertyIds = [appForOverride.hoa_property_id];

                const { data: linkedRows } = await supabase
                  .from('linked_properties')
                  .select('linked_property_id')
                  .eq('primary_property_id', appForOverride.hoa_property_id);

                for (const row of (linkedRows || [])) {
                  if (row?.linked_property_id) propertyIds.push(row.linked_property_id);
                }

                const { getUserOverride } = await import('../../../lib/userPricingUtils');
                for (const pid of propertyIds) {
                  const resolved = await getUserOverride(pid, overrideUserId, supabase);
                  if (resolved?.pricingId) {
                    pricingId = resolved.pricingId;
                    break;
                  }
                }
              }
            }

            const { data: offer } = await supabase
              .from('builder_user_property_pricing')
              .select('override_price, hoa_property_id')
              .eq('id', pricingId)
              .single();
            if (offer && overrideUserId && pricingId) {
              await supabase
                .from('builder_pricing_redemptions')
                .upsert(
                  {
                    pricing_id:                pricingId,
                    application_id:            updatedApp.id,
                    user_id:                   overrideUserId,
                    hoa_property_id:           offer.hoa_property_id,
                    stripe_checkout_session_id: session.id,
                    amount_paid:               session.amount_total / 100,
                    override_price_snapshot:   parseFloat(offer.override_price),
                    paid_at:                   new Date().toISOString(),
                  },
                  { onConflict: 'stripe_checkout_session_id', ignoreDuplicates: true }
                );
              console.log(`[Webhook] Builder pricing redemption recorded: offer=${pricingId}, app=${updatedApp.id}`);
            } else if (session.metadata?.pricing_source === 'user_override') {
              console.warn(
                `[Webhook] Builder pricing redemption skipped: missing pricing/user metadata (session=${session.id}, app=${updatedApp?.id || 'unknown'})`
              );
            }
          } catch (redemptionErr) {
            console.error('[Webhook] Builder pricing redemption record failed (non-fatal):', redemptionErr);
          }
        }

        // Durable post-payment processing is enqueued as a job (receipt, forms,
        // notifications, auto-submit, document delivery). The per-payment idempotency
        // key means this event and payment_intent.succeeded — plus any Stripe redelivery —
        // collapse to exactly one job, so the receipt can never race or be sent twice.
        if (updatedApp) {
          await enqueueAndKick(supabase, {
            applicationId: updatedApp.id,
            paymentIntentId: session.payment_intent,
            sessionId: session.id,
            amountTotal: session.amount_total,
            customerEmail: session.customer_email || session.metadata?.customerEmail,
            metaIsMultiCommunity: session.metadata?.isMultiCommunity === 'true',
            testMode: correctTestMode,
            event,
          });
        }
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;

        // --- Correction payment early exit ---
        // The correctionType lives on the checkout session metadata, not the payment intent.
        // Do a quick session lookup to detect correction payments before running the
        // standard form-creation / status-update logic, which would corrupt correction payments.
        // Also track whether a checkout session exists so we can skip the duplicate receipt email
        // (checkout.session.completed already sends it for all Stripe Checkout payments).
        let hasCheckoutSession = false;
        try {
          const piSessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 1 });
          if (piSessions.data.length > 0) {
            if (piSessions.data[0].metadata?.correctionType) {
              console.log(`[Webhook] payment_intent.succeeded is a correction payment — already handled by checkout.session.completed. Skipping.`);
              break;
            }
            hasCheckoutSession = true;
          }
        } catch (piSessionErr) {
          console.warn('[Webhook] Could not check payment intent for correctionType:', piSessionErr.message);
        }

        const isMultiCommunity = paymentIntent.metadata?.isMultiCommunity === 'true';

        // For multi-community apps, record payment metadata but DON'T change status yet.
        // The status update is deferred until AFTER property groups are created, so the
        // application only appears in the admin dashboard once the tree view data is ready.
          const paymentUpdateData = {
            payment_completed_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntent.id,
            payment_status: 'completed'
          };
          if (!isMultiCommunity) {
            paymentUpdateData.status = 'payment_confirmed';
          }
          
          // Correct the total amount based on actual payment
        if (paymentIntent.amount_total) {
          paymentUpdateData.total_amount = paymentIntent.amount_total / 100; // Convert from cents
        }
        
        // First, try to update by stripe_payment_intent_id
        let { data: updatedApplication } = await supabase
          .from('applications')
          .update(paymentUpdateData)
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .select(`
            id,
            submitter_email,
            submitter_name,
            property_address,
            package_type,
            total_amount,
            application_type,
            impersonation_metadata,
            payment_status
          `)
          .single();

        // If update by stripe_payment_intent_id failed, try to update by applicationId from metadata.
        // SECURITY: integer application ids are NOT unique across databases (test vs live). A
        // test-mode event that reaches this deployment (e.g. a local/staging test checkout whose
        // webhook fans out to prod) can carry a metadata.applicationId that collides with an
        // unrelated live row. So we SELECT the candidate first and only mutate it if its Stripe
        // mode matches this event's mode — never trust the bare integer id.
        if (!updatedApplication && paymentIntent.metadata?.applicationId) {
          console.log(`[Webhook] Could not find application by stripe_payment_intent_id ${paymentIntent.id}, trying by applicationId from metadata: ${paymentIntent.metadata.applicationId}`);

          const { data: candidate } = await supabase
            .from('applications')
            .select('id, stripe_session_id, is_test_transaction')
            .eq('id', paymentIntent.metadata.applicationId)
            .single();

          if (candidate && appMatchesEventMode(candidate, correctTestMode)) {
            const { data: fallbackApplication } = await supabase
              .from('applications')
              .update(paymentUpdateData)
              .eq('id', candidate.id)
              .select(`
                id,
                submitter_email,
                submitter_name,
                property_address,
                package_type,
                total_amount,
                application_type,
                impersonation_metadata,
                payment_status
              `)
              .single();

            if (fallbackApplication) {
              updatedApplication = fallbackApplication;
              console.log(`[Webhook] Successfully updated application ${fallbackApplication.id} using applicationId from metadata`);
            } else {
              console.error(`[Webhook] Could not find application by applicationId ${paymentIntent.metadata.applicationId} either`);
            }
          } else if (candidate) {
            console.warn(`[Webhook] Ignoring applicationId fallback for ${paymentIntent.metadata.applicationId}: event mode (test=${correctTestMode}) != application mode — likely a cross-environment id collision. Skipping.`);
          } else {
            console.error(`[Webhook] Could not find application by applicationId ${paymentIntent.metadata.applicationId} either`);
          }
        }

        // Fallback: find the app via the Stripe checkout session that created this payment intent.
        // This handles the race where payment_intent.succeeded fires before checkout.session.completed
        // has set stripe_payment_intent_id on the application row.
        if (!updatedApplication) {
          try {
            const sessions = await stripe.checkout.sessions.list({
              payment_intent: paymentIntent.id,
              limit: 1
            });
            if (sessions.data.length > 0) {
              const sessionId = sessions.data[0].id;
              console.log(`[Webhook] Trying session lookup: ${sessionId}`);

              // First set the stripe_payment_intent_id so future lookups work
              const { data: sessionApp } = await supabase
                .from('applications')
                .update({ ...paymentUpdateData, stripe_payment_intent_id: paymentIntent.id })
                .eq('stripe_session_id', sessionId)
                .select(`
                  id,
                  submitter_email,
                  submitter_name,
                  property_address,
                  package_type,
                  total_amount,
                  application_type,
                  impersonation_metadata,
                  payment_status
                `)
                .single();

              if (sessionApp) {
                updatedApplication = sessionApp;
                console.log(`[Webhook] Found application ${sessionApp.id} via session ${sessionId}`);
              }
            }
          } catch (sessionErr) {
            console.warn(`[Webhook] Session fallback lookup failed:`, sessionErr.message);
          }
        }

        // If the Stripe API call to list checkout sessions failed (hasCheckoutSession stayed false),
        // use payment_status as a fallback guard to avoid sending a duplicate receipt.
        // checkout.session.completed sets payment_status = 'completed' before sending the email.
        if (!hasCheckoutSession && updatedApplication?.payment_status === 'completed') {
          console.log(`[Webhook] payment_intent.succeeded: receipt already sent via checkout.session.completed for application ${updatedApplication.id} — skipping duplicate`);
          hasCheckoutSession = true;
        }

        // Ensure submitted_at is set for paid apps — info packets and lender questionnaires
        // don't set it elsewhere, so they'd otherwise sort to the bottom of the admin list.
        if (updatedApplication?.id) {
          await supabase
            .from('applications')
            .update({ submitted_at: new Date().toISOString() })
            .eq('id', updatedApplication.id)
            .is('submitted_at', null);
        }

        // Enqueue durable post-payment processing. Same per-payment idempotency key as
        // checkout.session.completed, so whichever event arrives first creates the single
        // job and the other is ignored — no double processing, no lost receipt, and this
        // handler can no longer 500 (which previously caused Stripe retry storms for MC).
        if (updatedApplication?.id) {
          await enqueueAndKick(supabase, {
            applicationId: updatedApplication.id,
            paymentIntentId: paymentIntent.id,
            sessionId: null,
            amountTotal: paymentIntent.amount_total || paymentIntent.amount,
            customerEmail: updatedApplication.submitter_email,
            metaIsMultiCommunity: paymentIntent.metadata?.isMultiCommunity === 'true',
            testMode: correctTestMode,
            event,
          });
        } else {
          console.warn(`[Webhook] payment_intent.succeeded: no application resolved for payment intent ${paymentIntent.id}`);
        }
        break;

      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('Payment failed:', failedPayment.id);
        
        // Update application status
        await supabase
          .from('applications')
          .update({
            status: 'payment_failed',
            payment_failed_at: new Date().toISOString(),
            payment_failure_reason: failedPayment.last_payment_error?.message || 'Payment failed'
          })
          .eq('stripe_payment_intent_id', failedPayment.id);
        break;

      case 'payment_intent.canceled':
        const canceledPayment = event.data.object;
        console.log('Payment canceled:', canceledPayment.id);
        
        // Update application status
        await supabase
          .from('applications')
          .update({
            status: 'payment_canceled',
            payment_canceled_at: new Date().toISOString()
          })
          .eq('stripe_payment_intent_id', canceledPayment.id);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ─── Correction Payment Handler ───────────────────────────────────────────────
// Handles checkout.session.completed for correction payments originating from the
// "Restructure Application" feature. Two correctionTypes are supported:
//   - 'additional_property': property correction with extra communities (delta > 0)
//   - 'rush_upgrade':        package upgrade from standard → rush
//
// These sessions use correction_stripe_session_id on the application row (NOT
// stripe_session_id) so the standard webhook path cannot find them.
async function handleCorrectionPayment(session, stripe, supabase) {
  const correctionType = session.metadata?.correctionType;
  const applicationId  = session.metadata?.applicationId;

  if (!applicationId) {
    console.error('[Webhook][Correction] Missing applicationId in session metadata:', session.id);
    return;
  }

  // Look up application by correction_stripe_session_id
  const { data: app, error: appError } = await supabase
    .from('applications')
    .select('id, submitter_email, submitter_name, property_address, package_type, application_type, submitted_at, impersonation_metadata, notes, correction_metadata')
    .eq('correction_stripe_session_id', session.id)
    .single();

  if (appError || !app) {
    console.error(`[Webhook][Correction] No application found for correction session ${session.id}. appError:`, appError?.message);
    return;
  }

  console.log(`[Webhook][Correction] Processing ${correctionType} for application ${app.id}`);

  // Build update payload — unlock tasks in all cases
  const amountDisplay = session.amount_total ? (session.amount_total / 100).toFixed(2) : null;
  const correctionLabel = correctionType === 'rush_upgrade' ? 'rush upgrade' : 'property correction';
  const auditNote = `[${new Date().toISOString()}] Invoice paid by ${app.submitter_email}${amountDisplay ? ` ($${amountDisplay})` : ''} for ${correctionLabel}.`;

  const updatePayload = {
    processing_locked:            false,
    processing_locked_at:         null,
    processing_locked_reason:     null,
    correction_stripe_session_id: null, // clear so future corrections are not blocked
    notes:                        app.notes ? `${app.notes}\n\n${auditNote}` : auditNote,
    updated_at:                   new Date().toISOString(),
  };

  if (correctionType === 'rush_upgrade') {
    // Upgrade package and recalculate expected_completion_date (5 business days from submitted_at)
    updatePayload.package_type      = 'rush';
    updatePayload.rush_upgraded_at  = new Date().toISOString();

    if (app.submitted_at) {
      // Count 5 business days forward from submitted_at
      let deadline = new Date(app.submitted_at);
      let businessDaysAdded = 0;
      while (businessDaysAdded < 5) {
        deadline.setDate(deadline.getDate() + 1);
        const dow = deadline.getDay();
        if (dow !== 0 && dow !== 6) businessDaysAdded++; // skip weekends
      }
      updatePayload.expected_completion_date = deadline.toISOString().split('T')[0];
      console.log(`[Webhook][Correction] New rush deadline: ${updatePayload.expected_completion_date}`);
    }
  }

  const { error: updateError } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', app.id);

  if (updateError) {
    console.error(`[Webhook][Correction] Failed to update application ${app.id}:`, updateError.message);
    return;
  }

  console.log(`[Webhook][Correction] Application ${app.id} unlocked. correctionType=${correctionType}`);

  // For property corrections, ensure per-group forms exist (idempotent safety net).
  // correct-primary-property.js creates them proactively, but this catches any edge case
  // where the endpoint ran before our fix was deployed.
  if (correctionType === 'additional_property') {
    try {
      const { createPropertyOwnerFormsForGroups } = require('../../../lib/groupingService');
      const { data: correctionGroups } = await supabase
        .from('application_property_groups')
        .select('id, property_name')
        .eq('application_id', app.id);
      if (correctionGroups && correctionGroups.length > 0) {
        await createPropertyOwnerFormsForGroups(app.id, correctionGroups);
        console.log(`[Webhook][Correction] Per-group forms ensured for application ${app.id}`);
      }
    } catch (formErr) {
      console.error(`[Webhook][Correction] Per-group form creation failed (non-fatal) for application ${app.id}:`, formErr);
    }
  }

  // Send receipt email (reuse existing sendInvoiceReceiptEmail)
  const impersonationMeta = app.impersonation_metadata;
  const shouldSendEmail   = !(impersonationMeta && impersonationMeta.send_emails === false);

  if (!shouldSendEmail) {
    console.log(`[Webhook][Correction] Skipping receipt email — impersonation mode for application ${app.id}`);
    return;
  }

  try {
    let receiptUrl    = null;
    let receiptNumber = null;
    let paymentMethod = null;
    let lineItems     = [];

    // Retrieve charge for receipt URL + payment method
    if (session.payment_intent) {
      try {
        const pi     = await stripe.paymentIntents.retrieve(session.payment_intent);
        if (pi.latest_charge) {
          const charge = await stripe.charges.retrieve(pi.latest_charge);
          receiptUrl    = charge.receipt_url;
          receiptNumber = charge.receipt_number;
          if (charge.payment_method_details?.card) {
            const { brand, last4 } = charge.payment_method_details.card;
            paymentMethod = `${(brand || 'CARD').toUpperCase()} - ${last4 || '****'}`;
          }
        }
      } catch (chargeErr) {
        console.warn('[Webhook][Correction] Could not retrieve charge:', chargeErr.message);
      }
    }

    // Retrieve line items from checkout session
    try {
      const sessionLineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ['data.price.product'],
      });
      if (sessionLineItems?.data?.length > 0) {
        lineItems = sessionLineItems.data.map(item => {
          const product = item.price?.product && typeof item.price.product !== 'string'
            ? item.price.product : null;
          return {
            name:        product?.name        || item.description || 'Service',
            description: product?.description || item.description || null,
            amount:      (item.amount_total / 100).toFixed(2),
            quantity:    item.quantity || 1,
          };
        });
      }
    } catch (liErr) {
      console.warn('[Webhook][Correction] Could not retrieve line items:', liErr.message);
    }

    await sendInvoiceReceiptEmail({
      to:              app.submitter_email,
      applicationId:   app.id,
      customerName:    app.submitter_name    || session.metadata?.customerName || 'Customer',
      propertyAddress: app.property_address  || session.metadata?.propertyAddress || '',
      packageType:     correctionType === 'rush_upgrade' ? 'rush' : (app.package_type || 'standard'),
      totalAmount:     (session.amount_total / 100).toFixed(2),
      invoiceNumber:   receiptNumber || `COR-${app.id}`,
      invoicePdfUrl:   receiptUrl,
      hostedInvoiceUrl: receiptUrl,
      stripeChargeId:  session.payment_intent,
      invoiceDate:     new Date().toISOString(),
      applicationType: app.application_type || 'single_property',
      paymentMethod,
      lineItems,
    });

    console.log(`[Webhook][Correction] Receipt email sent to ${app.submitter_email} for application ${app.id}`);
  } catch (emailErr) {
    console.error('[Webhook][Correction] Failed to send receipt email:', emailErr);
    // Don't fail the webhook if email fails
  }

  // ── Notify property owners ──────────────────────────────────────────────────
  // Logic differs by correctionType:
  //
  // RUSH UPGRADE: all property owners are the same — notify them the timeline changed.
  //
  // PROPERTY CORRECTION: uses correction_metadata (saved before old groups were deleted):
  //   A) Old owner NO LONGER in new setup  → "application corrected, now it is {new property}"
  //   B) Old owner STILL in new setup      → "new application from correction for your property"
  //   C) Brand-new owner (not in old set)  → "new application from correction for your property"
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl     = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor  = '#0f4734';
    const isRushUpgrade = correctionType === 'rush_upgrade';
    const processingLabel = (app.package_type === 'rush' || isRushUpgrade)
      ? 'Rush — 5 business days'
      : 'Standard — 15 calendar days';

    // Shared email builder — keeps HTML consistent across all notification types
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://resalesflow.gmgva.com';
    const buildPropertyOwnerEmail = ({ heading, body, propertyName, nextStepNote, ctaUrl, ctaLabel }) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${heading}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;"><img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;display:block;border:0;"/></div>
      <div style="text-align:center;"><h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">${heading}</h1></div>
    </div>
    <div style="padding:30px 20px;">
      <p style="margin:0 0 16px 0;font-size:15px;color:#333333;">Dear Property Manager,</p>
      <p style="margin:0 0 24px 0;font-size:15px;color:#555555;">${body}</p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:20px;border:1px solid #e5e7eb;margin:0 0 24px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Application ID:</strong></td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;">#${app.id}</td>
          </tr>
          ${propertyName ? `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Your Property:</strong></td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;">${propertyName}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 0;font-size:14px;color:#374151;"><strong>Processing:</strong></td>
            <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;">${processingLabel}</td>
          </tr>
        </table>
      </div>
      ${nextStepNote ? `<div style="background-color:#f0f9f4;border-left:4px solid ${brandColor};border-radius:6px;padding:16px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:14px;color:#065f46;">${nextStepNote}</p>
      </div>` : ''}
      ${ctaUrl ? `<div style="text-align:center;margin:0 0 24px 0;">
        <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">${ctaLabel || 'View Application'}</a>
      </div>` : ''}
      <div style="text-align:center;padding:20px 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;">Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color:${brandColor};text-decoration:none;font-weight:500;">resales@gmgva.com</a></p>
      </div>
    </div>
    <div style="background-color:#f9fafb;padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#6b7280;"><strong style="color:${brandColor};">Goodman Management Group</strong><br>Professional HOA Management &amp; Resale Services</p>
    </div>
  </div>
</body>
</html>`;

    if (isRushUpgrade) {
      // Fetch current groups and notify all property owners of the timeline change
      const { data: currentGroups } = await supabase
        .from('application_property_groups')
        .select('property_name, property_owner_email')
        .eq('application_id', app.id)
        .not('property_owner_email', 'is', null);

      if (currentGroups && currentGroups.length > 0) {
        // Expand comma-separated property_owner_email into individual recipients and deduplicate
        const seen = new Set();
        const recipients = [];
        for (const g of currentGroups) {
          for (const email of parseEmails(g.property_owner_email)) {
            const key = email.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            recipients.push({ email, propertyName: g.property_name });
          }
        }

        await Promise.allSettled(recipients.map(({ email, propertyName }) => sendEmail({
          to:      email,
          subject: `Application Updated — Rush Processing Upgrade (#${app.id})`,
          html:    buildPropertyOwnerEmail({
            heading:      'Rush Processing Upgrade',
            body:         `A resale certificate application associated with your property has been upgraded to <strong>Rush processing (5 business days)</strong>. Our team will prioritise completing the required documents as quickly as possible.`,
            propertyName: propertyName,
            nextStepNote: 'No action is required from you at this time. Processing will continue on the expedited timeline.',
            ctaUrl:       `${siteUrl}/admin/login?applicationId=${app.id}`,
            ctaLabel:     'View Application',
          }),
          context: 'PropertyOwnerRushUpgradeNotification',
        }).then(() => {
          console.log(`[Webhook][Correction] Rush upgrade notice sent to ${email} (${propertyName})`);
        }).catch(err => {
          console.error(`[Webhook][Correction] Failed rush upgrade notice to ${email}:`, err.message);
        })));
      }

    } else {
      // PROPERTY CORRECTION — 3-way logic using correction_metadata
      const meta         = app.correction_metadata || {};
      const oldOwners    = meta.oldOwners || [];          // [{ propertyId, propertyName, email, isPrimary }]
      const newPrimName  = meta.newPrimaryPropertyName || '';

      const { data: currentGroups } = await supabase
        .from('application_property_groups')
        .select('property_id, property_name, property_owner_email')
        .eq('application_id', app.id)
        .not('property_owner_email', 'is', null);

      const newGroups = currentGroups || [];

      // Build lookup sets — use individual parsed emails (not whole comma-separated strings)
      const oldEmailSet = new Set(
        oldOwners.flatMap(o => parseEmails(o.email).map(e => e.toLowerCase()))
      );
      const newPropIdSet = new Set(newGroups.map(g => g.property_id));

      const emails = []; // [{ to, subject, html, context, label }]

      // A) Old owners REMOVED from the application
      const removedSeen = new Set();
      for (const owner of oldOwners.filter(o => !newPropIdSet.has(o.propertyId))) {
        for (const email of parseEmails(owner.email)) {
          const key = email.toLowerCase();
          if (removedSeen.has(key)) continue;
          removedSeen.add(key);
          emails.push({
            to:      email,
            subject: `Application Update — Property Correction (#${app.id})`,
            html:    buildPropertyOwnerEmail({
              heading:      'Application Property Updated',
              body:         `A resale certificate application previously associated with <strong>${owner.propertyName}</strong> has been corrected by the applicant. The application is now assigned to <strong>${newPrimName}</strong>. Your property is no longer part of this application.`,
              propertyName: owner.propertyName,
              nextStepNote: 'No further action is required from you for this application.',
              ctaUrl:       `${siteUrl}/admin/login?applicationId=${app.id}`,
              ctaLabel:     'View Application',
            }),
            context: 'PropertyOwnerRemovedNotification',
            label:   `removed: ${email}`,
          });
        }
      }

      // B) Old owners STILL in the new setup — they have a "new" application from correction
      const continuingSeen = new Set();
      for (const owner of oldOwners.filter(o => newPropIdSet.has(o.propertyId))) {
        const newGroup = newGroups.find(g => g.property_id === owner.propertyId);
        for (const email of parseEmails(owner.email)) {
          const key = email.toLowerCase();
          if (continuingSeen.has(key)) continue;
          continuingSeen.add(key);
          emails.push({
            to:      email,
            subject: `New Application Submitted — Property Correction (#${app.id})`,
            html:    buildPropertyOwnerEmail({
              heading:      'New Application for Your Property',
              body:         `A resale certificate application has been updated and now includes your property. This application was recently corrected by the applicant and your community has been confirmed as part of the new application.`,
              propertyName: newGroup?.property_name || owner.propertyName,
              ctaUrl:       `${siteUrl}/admin/login?applicationId=${app.id}`,
              ctaLabel:     'View Application',
            }),
            context: 'PropertyOwnerCorrectionContinuingNotification',
            label:   `continuing: ${email}`,
          });
        }
      }

      // C) Brand-new property owners not already notified via Case A or B
      const allHandledEmails = new Set([...removedSeen, ...continuingSeen]);
      for (const g of newGroups) {
        for (const email of parseEmails(g.property_owner_email)) {
          const key = email.toLowerCase();
          if (allHandledEmails.has(key)) continue;
          allHandledEmails.add(key);
          emails.push({
            to:      email,
            subject: `New Application Submitted — Property Correction (#${app.id})`,
            html:    buildPropertyOwnerEmail({
              heading:      'New Application for Your Property',
              body:         `A new resale certificate application has been submitted and assigned to your property. This application was recently corrected by the applicant to include your community.`,
              propertyName: g.property_name,
              ctaUrl:       `${siteUrl}/admin/login?applicationId=${app.id}`,
              ctaLabel:     'View Application',
            }),
            context: 'PropertyOwnerNewCorrectionNotification',
            label:   `new: ${email}`,
          });
        }
      }

      await Promise.allSettled(emails.map(e => sendEmail({ to: e.to, subject: e.subject, html: e.html, context: e.context })
        .then(() => console.log(`[Webhook][Correction] Property owner email sent (${e.label}) for application ${app.id}`))
        .catch(err => console.error(`[Webhook][Correction] Failed property owner email (${e.label}):`, err.message))
      ));
    }

    // Clear correction_metadata now that emails are sent — keeps the column lean
    await supabase
      .from('applications')
      .update({ correction_metadata: null })
      .eq('id', app.id);

  } catch (propOwnerErr) {
    console.error('[Webhook][Correction] Failed to send property owner notifications:', propOwnerErr);
    // Non-fatal — correction was already applied
  }
}


// ─── Cross-environment mode guard ────────────────────────────────────────────
// Integer application ids are not unique across databases (test vs live), so a raw-id
// lookup can match the wrong row when a test-mode webhook reaches this deployment. This
// verifies a candidate application belongs to the same Stripe mode as the event before we
// mutate or process it. A Stripe checkout session id embeds mode (cs_test_ / cs_live_) and
// is the most reliable signal; fall back to the is_test_transaction flag when the row has
// no session id yet.
function appMatchesEventMode(app, eventIsTestMode) {
  const appIsTest = app?.stripe_session_id
    ? app.stripe_session_id.startsWith('cs_test_')
    : !!app?.is_test_transaction;
  return appIsTest === eventIsTestMode;
}

// ─── Job enqueue + worker self-kick ──────────────────────────────────────────
// Enqueues the durable processing job for a paid application, then best-effort kicks the
// worker for near-instant processing. The per-minute Vercel Cron (/api/jobs/run) is the
// reliability guarantee; the self-kick is a latency optimization and is intentionally not
// awaited. Enqueue failures never fail the webhook — the cron backstop reprocesses any
// paid application that lacks a completed job.
async function enqueueAndKick(supabase, {
  applicationId, paymentIntentId, sessionId, amountTotal, customerEmail,
  metaIsMultiCommunity, testMode, event,
}) {
  try {
    const { data: app } = await supabase
      .from('applications')
      .select('application_type, hoa_property_id, stripe_session_id, is_test_transaction, hoa_properties(is_multi_community)')
      .eq('id', applicationId)
      .single();

    // Defense-in-depth: never enqueue processing for an application whose Stripe mode does not
    // match this event's mode. Prevents a cross-environment id collision from being processed
    // even if some other resolution path slips a mismatched app through.
    if (app && !appMatchesEventMode(app, testMode)) {
      console.warn(`[Webhook] enqueueAndKick skipped for application ${applicationId}: event mode (test=${testMode}) != application mode — likely a cross-environment id collision.`);
      return;
    }

    const isMultiCommunity = !!metaIsMultiCommunity || !!app?.hoa_properties?.is_multi_community;
    const idempotencyKey = paymentIntentId ? `pay:${paymentIntentId}` : `evt:${event.id}`;

    const { created } = await enqueueJob({
      supabase,
      applicationId,
      idempotencyKey,
      jobType: 'process_payment',
      payload: {
        eventId: event.id,
        eventType: event.type,
        testMode: !!testMode,
        stripePaymentIntentId: paymentIntentId || null,
        stripeSessionId: sessionId || null,
        amountTotal: amountTotal || null,
        customerEmail: customerEmail || null,
      },
      applicationType: app?.application_type,
      isMultiCommunity,
      isFree: false,
    });

    console.log(`[Webhook] Enqueued processing job for application ${applicationId} (key=${idempotencyKey}, created=${created})`);
    kickWorker();
  } catch (err) {
    console.error(`[Webhook] enqueueAndKick failed for application ${applicationId}:`, err.message);
  }
}

// Best-effort, non-awaited worker kick (near-instant processing; cron is the guarantee).
function kickWorker() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
    const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET;
    if (!secret) return;
    fetch(`${baseUrl}/api/jobs/run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        }),
      },
    }).catch(() => {});
  } catch (_) { /* ignore */ }
}
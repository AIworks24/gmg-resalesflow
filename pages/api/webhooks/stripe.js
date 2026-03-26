import { getServerStripe, getWebhookSecret } from '../../../lib/stripe';
import { getTestModeFromRequest } from '../../../lib/stripeMode';
import { sendEmail, sendInvoiceReceiptEmail, sendPaymentConfirmationEmail } from '../../../lib/emailService';
import { parseEmails } from '../../../lib/emailUtils';

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

        // Update application status - keep as pending_payment to allow user to continue the flow
        const updateData = {
          status: 'pending_payment',
          payment_completed_at: new Date().toISOString(),
          payment_status: 'completed'
        };
        
        // Store the payment intent ID if available
        if (session.payment_intent) {
          updateData.stripe_payment_intent_id = session.payment_intent;
        }
        
        const { data: updatedApp } = await supabase
          .from('applications')
          .update(updateData)
          .eq('stripe_session_id', session.id)
          .select('id, application_type, impersonation_metadata')
          .single();

        // Get receipt and send receipt email
        if (updatedApp) {
          try {
            // Get receipt from payment intent (Stripe automatically generates receipts)
            let receiptUrl = null;
            let receiptNumber = null;
            let paymentMethod = null;
            let lineItems = [];
            
            if (session.payment_intent) {
              try {
                const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
                // Get the charge to access receipt and payment method
                if (paymentIntent.latest_charge) {
                  const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
                  receiptUrl = charge.receipt_url;
                  receiptNumber = charge.receipt_number;
                  
                  // Get payment method details
                  if (charge.payment_method_details?.card) {
                    const card = charge.payment_method_details.card;
                    const brand = card.brand?.toUpperCase() || 'CARD';
                    const last4 = card.last4 || '****';
                    paymentMethod = `${brand} - ${last4}`;
                    console.log(`[Webhook] Payment method retrieved: ${paymentMethod}`);
                  } else {
                    console.warn('[Webhook] No payment method details found in charge');
                  }
                }
              } catch (receiptError) {
                console.warn('[Webhook] Could not retrieve receipt URL:', receiptError.message);
              }
            }

            // Get line items from checkout session
            try {
              const sessionLineItems = await stripe.checkout.sessions.listLineItems(session.id, {
                expand: ['data.price.product']
              });
              
              if (sessionLineItems?.data && sessionLineItems.data.length > 0) {
                lineItems = sessionLineItems.data.map(item => {
                  // Get product name - prioritize product name over description
                  let itemName = null;
                  let itemDescription = null;
                  
                  // First try to get product name and description (if product is expanded)
                  if (item.price?.product) {
                    const product = typeof item.price.product === 'string' 
                      ? null 
                      : item.price.product;
                    if (product) {
                      itemName = product.name || null;
                      // Product description contains property address/name
                      itemDescription = product.description || null;
                    }
                  }
                  
                  // Fallback to line item description if product description not available
                  if (!itemDescription) {
                    itemDescription = item.description || null;
                  }
                  
                  // Fallback to description if product name not available
                  if (!itemName) {
                    itemName = item.description || null;
                  }
                  
                  // Final fallback
                  if (!itemName) {
                    itemName = 'Service';
                  }
                  
                  return {
                    name: itemName,
                    description: itemDescription, // Include description which contains property address
                    amount: (item.amount_total / 100).toFixed(2),
                    quantity: item.quantity || 1
                  };
                });
                
                console.log(`[Webhook] Retrieved ${lineItems.length} line items for session ${session.id}`);
              } else {
                console.warn(`[Webhook] No line items found for session ${session.id}`);
              }
            } catch (lineItemsError) {
              console.warn('[Webhook] Could not retrieve line items:', lineItemsError.message);
            }

            // Check if this was created during impersonation and if emails should be sent
            const impersonationMeta = updatedApp.impersonation_metadata;
            const isImpersonated = !!impersonationMeta;
            const shouldSendEmails = impersonationMeta?.send_emails !== false; // Default to true if not specified
            
            if (isImpersonated && !shouldSendEmails) {
              console.log(`[Webhook] Skipping receipt email - impersonation mode with send_emails disabled for application ${updatedApp.id}`);
            } else {
              // Send receipt email
              const recipientEmail = session.customer_email || session.metadata.customerEmail;
              
              console.log(`[Webhook] Sending receipt email with paymentMethod: ${paymentMethod}, lineItems count: ${lineItems.length}`);
              
              await sendInvoiceReceiptEmail({
                to: recipientEmail,
                applicationId: updatedApp.id,
                customerName: session.metadata.customerName || 'Customer',
                propertyAddress: session.metadata.propertyAddress || '',
                packageType: session.metadata.packageType || 'standard',
                totalAmount: (session.amount_total / 100).toFixed(2),
                invoiceNumber: receiptNumber || `PAY-${updatedApp.id}`, // Use receipt number or generate one
                invoicePdfUrl: receiptUrl, // Use Stripe receipt URL
                hostedInvoiceUrl: receiptUrl, // Same URL for hosted view
                stripeChargeId: session.payment_intent,
                invoiceDate: new Date().toISOString(),
                applicationType: updatedApp.application_type || 'single_property', // Pass application type for dynamic content
                paymentMethod: paymentMethod, // Payment method (e.g., "VISA - 8008")
                lineItems: lineItems, // Itemized breakdown
              });
            }
          } catch (receiptError) {
            console.error('[Webhook] Failed to get receipt or send receipt email:', receiptError);
            // Fallback to payment confirmation email
            try {
              await sendPaymentConfirmationEmail({
                to: session.customer_email || session.metadata.customerEmail,
                applicationId: updatedApp.id,
                customerName: session.metadata.customerName,
                propertyAddress: session.metadata.propertyAddress,
                packageType: session.metadata.packageType,
                totalAmount: (session.amount_total / 100).toFixed(2),
                stripeChargeId: session.payment_intent,
              });
            } catch (emailError) {
              console.error('[Webhook] Failed to send payment confirmation email (fallback):', emailError);
              // Don't fail the webhook if email fails
            }
          }
        }
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;

        // --- Correction payment early exit ---
        // The correctionType lives on the checkout session metadata, not the payment intent.
        // Do a quick session lookup to detect correction payments before running the
        // standard form-creation / status-update logic, which would corrupt correction payments.
        try {
          const piSessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntent.id, limit: 1 });
          if (piSessions.data.length > 0 && piSessions.data[0].metadata?.correctionType) {
            console.log(`[Webhook] payment_intent.succeeded is a correction payment — already handled by checkout.session.completed. Skipping.`);
            break;
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
          stripe_payment_intent_id: paymentIntent.id
        };
        if (!isMultiCommunity) {
          paymentUpdateData.status = 'payment_completed';
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
            impersonation_metadata
          `)
          .single();

        // If update by stripe_payment_intent_id failed, try to update by applicationId from metadata
        if (!updatedApplication && paymentIntent.metadata?.applicationId) {
          console.log(`[Webhook] Could not find application by stripe_payment_intent_id ${paymentIntent.id}, trying by applicationId from metadata: ${paymentIntent.metadata.applicationId}`);
          
          const { data: fallbackApplication } = await supabase
            .from('applications')
            .update(paymentUpdateData)
            .eq('id', paymentIntent.metadata.applicationId)
            .select(`
              id,
              submitter_email,
              submitter_name,
              property_address,
              package_type,
              total_amount,
              application_type,
              impersonation_metadata
            `)
            .single();
          
          if (fallbackApplication) {
            updatedApplication = fallbackApplication;
            console.log(`[Webhook] Successfully updated application ${fallbackApplication.id} using applicationId from metadata`);
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
                  impersonation_metadata
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

        // Handle multi-community applications
        const applicationId = paymentIntent.metadata?.applicationId || updatedApplication?.id;
        
        // Get receipt and send receipt email
        if (updatedApplication && updatedApplication.submitter_email) {
          try {
            // Get receipt from charge (Stripe automatically generates receipts)
            let receiptUrl = null;
            let receiptNumber = null;
            let paymentMethod = null;
            let lineItems = [];
            
            if (paymentIntent.latest_charge) {
              try {
                const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
                receiptUrl = charge.receipt_url;
                receiptNumber = charge.receipt_number;
                
                // Get payment method details
                if (charge.payment_method_details?.card) {
                  const card = charge.payment_method_details.card;
                  const brand = card.brand?.toUpperCase() || 'CARD';
                  const last4 = card.last4 || '****';
                  paymentMethod = `${brand} - ${last4}`;
                  console.log(`[Webhook] Payment method retrieved: ${paymentMethod}`);
                } else {
                  console.warn('[Webhook] No payment method details found in charge');
                }
              } catch (receiptError) {
                console.warn('[Webhook] Could not retrieve receipt URL:', receiptError.message);
              }
            }

            // Try to get line items from checkout session if available
            // PaymentIntent might have been created via CheckoutSession
            try {
              // Search for checkout sessions with this payment intent
              const sessions = await stripe.checkout.sessions.list({
                payment_intent: paymentIntent.id,
                limit: 1
              });
              
              if (sessions.data.length > 0) {
                const sessionLineItems = await stripe.checkout.sessions.listLineItems(sessions.data[0].id, {
                  expand: ['data.price.product']
                });
                
                if (sessionLineItems?.data && sessionLineItems.data.length > 0) {
                  lineItems = sessionLineItems.data.map(item => {
                    // Get product name - prioritize product name over description
                    let itemName = null;
                    let itemDescription = null;
                    
                    // First try to get product name and description (if product is expanded)
                    if (item.price?.product) {
                      const product = typeof item.price.product === 'string' 
                        ? null 
                        : item.price.product;
                      if (product) {
                        itemName = product.name || null;
                        // Product description contains property address/name
                        itemDescription = product.description || null;
                      }
                    }
                    
                    // Fallback to line item description if product description not available
                    if (!itemDescription) {
                      itemDescription = item.description || null;
                    }
                    
                    // Fallback to description if product name not available
                    if (!itemName) {
                      itemName = item.description || null;
                    }
                    
                    // Final fallback
                    if (!itemName) {
                      itemName = 'Service';
                    }
                    
                    return {
                      name: itemName,
                      description: itemDescription, // Include description which contains property address
                      amount: (item.amount_total / 100).toFixed(2),
                      quantity: item.quantity || 1
                    };
                  });
                  
                  console.log(`[Webhook] Retrieved ${lineItems.length} line items for payment intent ${paymentIntent.id}`);
                } else {
                  console.warn(`[Webhook] No line items found for payment intent ${paymentIntent.id}`);
                }
              }
            } catch (lineItemsError) {
              console.warn('[Webhook] Could not retrieve line items:', lineItemsError.message);
              // If we can't get line items, we'll construct a basic one from metadata
              // This is a fallback for PaymentIntents created directly (not via CheckoutSession)
            }

            // Check if this was created during impersonation and if emails should be sent
            const impersonationMeta = updatedApplication.impersonation_metadata;
            const isImpersonated = !!impersonationMeta;
            const shouldSendEmails = impersonationMeta?.send_emails !== false; // Default to true if not specified
            
            if (isImpersonated && !shouldSendEmails) {
              console.log(`[Webhook] Skipping receipt email - impersonation mode with send_emails disabled for application ${updatedApplication.id}`);
            } else {
              // Send receipt email
              console.log(`[Webhook] Sending receipt email with paymentMethod: ${paymentMethod}, lineItems count: ${lineItems.length}`);
              
              await sendInvoiceReceiptEmail({
                to: updatedApplication.submitter_email,
                applicationId: updatedApplication.id,
                customerName: updatedApplication.submitter_name || paymentIntent.metadata.customerName || 'Customer',
                propertyAddress: updatedApplication.property_address || paymentIntent.metadata.propertyAddress || 'Unknown',
                packageType: updatedApplication.package_type || paymentIntent.metadata.packageType || 'standard',
                totalAmount: (updatedApplication.total_amount || (paymentIntent.amount_total / 100)).toFixed(2),
                invoiceNumber: receiptNumber || `PAY-${updatedApplication.id}`, // Use receipt number or generate one
                invoicePdfUrl: receiptUrl, // Use Stripe receipt URL
                hostedInvoiceUrl: receiptUrl, // Same URL for hosted view
                stripeChargeId: paymentIntent.id,
                invoiceDate: new Date().toISOString(),
                applicationType: updatedApplication.application_type || 'single_property', // Pass application type for dynamic content
                paymentMethod: paymentMethod, // Payment method (e.g., "VISA - 8008")
                lineItems: lineItems, // Itemized breakdown
              });
            }
          } catch (emailError) {
            console.error('[Webhook] Failed to send receipt email:', emailError);
            // Don't fail the webhook if email fails
          }
        } else {
          console.warn(`[Webhook] Cannot send receipt email - missing submitter_email for application ${applicationId}`);
        }
        
        if (applicationId) {
          // Note: Auto-assignment now happens at submission time, not at payment time
          // This ensures applications are assigned immediately when submitted, not after payment
          // We still check here in case an application wasn't assigned at submission
          let needsNotifications = false;
          
          const { data: appCheck } = await supabase
            .from('applications')
            .select('assigned_to, submitted_at')
            .eq('id', applicationId)
            .single();
          
          if (appCheck && !appCheck.assigned_to && appCheck.submitted_at) {
            // Application was submitted but not assigned - assign it now
            console.log(`[Webhook] Application ${applicationId} was submitted but not assigned, attempting auto-assignment`);
            const assignResult = await autoAssignApplication(applicationId, supabase);
            if (assignResult && assignResult.success) {
              console.log(`[Webhook] Successfully auto-assigned application ${applicationId} to ${assignResult.assignedTo}`);
              // Since we just assigned it here, notifications were created by auto-assign
              needsNotifications = false;
            } else {
              console.warn(`[Webhook] Failed to auto-assign application ${applicationId}:`, assignResult?.error || 'Unknown error');
              // Auto-assign failed, so we need to create notifications manually
              needsNotifications = true;
            }
          } else {
            // Application was already assigned at submission time
            // Notifications were already created by the submission flow, don't duplicate them
            console.log(`[Webhook] Application ${applicationId} was already assigned at submission (assigned_to: ${appCheck?.assigned_to}), skipping notification creation`);
            needsNotifications = false;
          }

          // Only create notifications if needed (fallback for failed auto-assign)
          if (needsNotifications) {
            try {
              console.log(`[Webhook] Creating notifications for application ${applicationId} (fallback after failed auto-assign)`);
              const { createNotifications } = await import('../notifications/create');
              const notificationResult = await createNotifications(applicationId, supabase);
              if (notificationResult.success) {
                console.log(`[Webhook] Fallback notifications created: ${notificationResult.notificationsCreated} notifications, ${notificationResult.emailsQueued || 0} emails queued`);
              } else {
                console.warn(`[Webhook] Failed to create fallback notifications:`, notificationResult.error);
              }
            } catch (notificationError) {
              console.error('[Webhook] Error creating fallback notifications:', notificationError);
              // Don't fail the webhook if notification creation fails
            }
          }
          
          // Check if this is a lender questionnaire application
          const { data: appData } = await supabase
            .from('applications')
            .select('application_type, hoa_property_id')
            .eq('id', applicationId)
            .single();
          
          // Resolve isMultiCommunity: metadata first, then DB (handles missing metadata)
          let resolvedIsMultiCommunity = isMultiCommunity;
          if (!resolvedIsMultiCommunity && appData?.hoa_property_id) {
            const { data: prop } = await supabase
              .from('hoa_properties')
              .select('is_multi_community')
              .eq('id', appData.hoa_property_id)
              .single();
            if (prop?.is_multi_community) {
              resolvedIsMultiCommunity = true;
              console.log(`[Webhook] Application ${applicationId} resolved as MC from hoa_properties`);
            }
          }
          
          // Skip property owner forms for lender questionnaire (user uploads their own form)
          if (appData?.application_type === 'lender_questionnaire') {
            // Update status to under_review (file will be uploaded separately)
            await supabase
              .from('applications')
              .update({ status: 'under_review' })
              .eq('id', applicationId);
            console.log(`Skipping property owner forms for lender questionnaire application ${applicationId}`);
          } else if (appData?.application_type === 'info_packet') {
            // Info Packet: auto-complete and send documents immediately — no staff review needed
            console.log(`[Webhook] Info Packet application ${applicationId} — auto-completing and sending documents`);
            try {
              const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
              const emailRes = await fetch(`${baseUrl}/api/send-info-packet-email`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${process.env.INTERNAL_API_SECRET}`,
                },
                body: JSON.stringify({ applicationId }),
              });
              if (!emailRes.ok) {
                const errText = await emailRes.text();
                console.error(`[Webhook] Info Packet email send failed (${emailRes.status}):`, errText);
              } else {
                console.log(`[Webhook] Info Packet documents sent for application ${applicationId}`);
              }
            } catch (emailErr) {
              console.error('[Webhook] Info Packet email send threw:', emailErr);
              // Don't fail the webhook — mark complete even if email fails; admin can resend
              await supabase
                .from('applications')
                .update({ status: 'completed', updated_at: new Date().toISOString() })
                .eq('id', applicationId);
            }
          } else if (resolvedIsMultiCommunity) {
            await handleMultiCommunityApplication(applicationId, paymentIntent.metadata);
          } else {
            await createPropertyOwnerForms(applicationId, paymentIntent.metadata);
          }
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

// Helper function to create property owner forms using data-driven approach
async function createPropertyOwnerForms(applicationId, metadata) {
  const { createClient } = require('@supabase/supabase-js');
  const { getApplicationTypeData } = require('../../../lib/applicationTypes');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get application details including application_type
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('application_type, submitter_type')
      .eq('id', applicationId)
      .single();

    if (appError) {
      console.error('Error fetching application:', appError);
      return;
    }

    // Get application type data to determine required forms
    const appTypeData = await getApplicationTypeData(application.application_type);
    const requiredForms = appTypeData.required_forms || [];

    console.log(`Creating forms for application type: ${application.application_type}, Required forms: ${JSON.stringify(requiredForms)}`);

    // Create each required form
    for (const formType of requiredForms) {
      await supabase
        .from('property_owner_forms')
        .insert({
          application_id: applicationId,
          form_type: formType,
          status: 'not_started',
          access_token: generateAccessToken(),
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
        });

      console.log(`Created ${formType} for application ${applicationId}`);
    }

    console.log(`Successfully created ${requiredForms.length} forms for application: ${applicationId}`);
  } catch (error) {
    console.error('Error creating property owner forms:', error);
  }
}

// Helper function to generate access token
function generateAccessToken() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Helper function to auto-assign application to property owner
async function autoAssignApplication(applicationId, supabase) {
  try {
    console.log(`Attempting to auto-assign application ${applicationId} to property owner`);
    
    // Get application with property information
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        hoa_property_id,
        hoa_properties (
          id,
          name,
          property_owner_email,
          default_assignee_email,
          is_multi_community
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      console.error('Error fetching application for auto-assignment:', appError);
      return { success: false, error: 'Application not found' };
    }

    // Skip if already assigned
    const { data: currentApp } = await supabase
      .from('applications')
      .select('assigned_to')
      .eq('id', applicationId)
      .single();

    if (currentApp?.assigned_to) {
      console.log(`Application ${applicationId} is already assigned to ${currentApp.assigned_to}, skipping auto-assignment`);
      return { success: false, error: 'Application already assigned' };
    }

    const property = application.hoa_properties;
    if (!property || !property.property_owner_email) {
      console.log(`No property owner email found for application ${applicationId}, skipping auto-assignment`);
      return { success: false, error: 'No property owner email found' };
    }

    // Parse emails (handles both single email string and comma-separated string)
    // Import parseEmails dynamically to avoid circular dependencies
    const { parseEmails } = await import('../../../lib/emailUtils');
    const ownerEmails = parseEmails(property.property_owner_email);
    
    if (ownerEmails.length === 0) {
      console.log(`No valid property owner emails found for application ${applicationId}, skipping auto-assignment`);
      return { success: false, error: 'No valid property owner emails found' };
    }

    // Build ordered list: default assignee first (if set and in list), then the rest
    const defaultEmail = (property.default_assignee_email || '').trim().toLowerCase();
    const defaultInList = defaultEmail && ownerEmails.some(e => (e || '').trim().toLowerCase() === defaultEmail);
    const orderedEmails = defaultInList
      ? [
          ownerEmails.find(e => (e || '').trim().toLowerCase() === defaultEmail),
          ...ownerEmails.filter(e => (e || '').trim().toLowerCase() !== defaultEmail)
        ]
      : ownerEmails;

    console.log(`[Stripe] Trying ${orderedEmails.length} email(s) for application ${applicationId}`);

    // Try each email in order until we find a valid staff/admin/accounting user
    const allowedRoles = ['staff', 'admin', 'accounting'];
    let assignedEmail = null;

    for (const rawEmail of orderedEmails) {
      if (!rawEmail) continue;
      const emailToTry = rawEmail.replace(/^owner\./, '').trim();
      if (!emailToTry) continue;

      let { data: profile } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', emailToTry)
        .single();

      if (!profile) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .ilike('email', emailToTry);
        if (profiles && profiles.length > 0) profile = profiles[0];
      }

      if (profile && allowedRoles.includes(profile.role)) {
        assignedEmail = profile.email;
        console.log(`[Stripe] Found valid assignee: ${assignedEmail} (role: ${profile.role})`);
        break;
      } else if (profile) {
        console.log(`[Stripe] Skipping ${emailToTry}: role "${profile.role}" not allowed`);
      } else {
        console.log(`[Stripe] Skipping ${emailToTry}: no profile found`);
      }
    }

    if (!assignedEmail) {
      console.log(`[Stripe] No valid staff/admin/accounting user found among ${orderedEmails.length} email(s) for application ${applicationId}. Leaving unassigned.`);
      return {
        success: true,
        assignedTo: null,
        message: 'No valid staff user found among property owner emails. Application left unassigned.'
      };
    }

    const ownerEmail = assignedEmail;
    console.log(`[Stripe] Verified property owner user: ${ownerEmail}`);

    // Assign the application to the property owner
    const { error: assignError } = await supabase
      .from('applications')
      .update({ 
        assigned_to: ownerEmail,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (assignError) {
      console.error('Error assigning application:', assignError);
      return { success: false, error: assignError.message };
    }

    console.log(`Successfully auto-assigned application ${applicationId} to property owner: ${ownerEmail}`);
    return { success: true, assignedTo: ownerEmail };
  } catch (error) {
    console.error('Error in auto-assign application:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to handle multi-community applications
async function handleMultiCommunityApplication(applicationId, metadata) {
  const { createClient } = require('@supabase/supabase-js');
  const { createPropertyGroups, generateDocumentsForAllGroups } = require('../../../lib/groupingService');
  const { deleteCachePattern } = require('../../../lib/redis');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log(`[MC] Handling multi-community application: ${applicationId}`);
    
    // Get application details with property information
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties (
          id,
          name,
          location,
          property_owner_email,
          is_multi_community
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      throw new Error(`Application not found: ${appError?.message}`);
    }

    // Get linked properties for the primary property
    const { getLinkedProperties } = require('../../../lib/multiCommunityUtils');
    const linkedProperties = await getLinkedProperties(application.hoa_property_id, supabase);

    if (!linkedProperties || linkedProperties.length === 0) {
      console.log('No linked properties found, falling back to single property flow');
      await createPropertyOwnerForms(applicationId, metadata);
      return;
    }

    // Create property groups
    const groups = await createPropertyGroups(
      applicationId,
      application.hoa_properties,
      linkedProperties
    );

    // Set status to payment_completed immediately after property groups exist.
    // This makes the application visible in the admin dashboard right away and
    // ensures createNotifications (below) does not skip due to pending_payment status.
    await supabase
      .from('applications')
      .update({ status: 'payment_completed', updated_at: new Date().toISOString() })
      .eq('id', applicationId);

    // Purge any stale Redis cache
    await deleteCachePattern('admin:applications:*');
    console.log(`[MC] Application ${applicationId} now visible with ${groups.length} property groups`);

    // Send notifications to ALL property owners (primary + secondary) BEFORE PDF generation.
    // Property groups now exist, so createNotifications can find all recipients.
    // Sending here avoids emails being blocked/delayed by slow PDF generation, which
    // caused the Stripe webhook to time out and retry ~10 hours later.
    try {
      const { createNotifications } = await import('../notifications/create');
      const notifResult = await createNotifications(applicationId, supabase);
      console.log(`[MC] Notifications for application ${applicationId}: ${notifResult.notificationsCreated} created, ${notifResult.emailsQueued || 0} emails queued`);
    } catch (notifError) {
      console.warn(`[MC] Failed to create notifications for application ${applicationId}:`, notifError);
    }

    // Generate documents for all groups (slow - PDFs for each property)
    await generateDocumentsForAllGroups(applicationId, application);

    // Create property owner forms for each group (for admin workflow)
    await createPropertyOwnerFormsForGroups(applicationId, groups);

  } catch (error) {
    console.error('Error handling multi-community application:', error);
    // Fallback to single property flow — still need to set status so the app is visible
    try {
      await createPropertyOwnerForms(applicationId, metadata);
    } catch (fallbackError) {
      console.error('Fallback to single property flow also failed:', fallbackError);
    }
    // Ensure status is set even on failure so the app doesn't get stuck
    await supabase
      .from('applications')
      .update({ status: 'payment_completed', updated_at: new Date().toISOString() })
      .eq('id', applicationId);
    await deleteCachePattern('admin:applications:*');
    console.log(`[MC] Application ${applicationId} status set after error fallback`);
    // Still attempt to notify all property owners (primary + secondary via linked_properties lookup)
    try {
      const { createNotifications } = await import('../notifications/create');
      await createNotifications(applicationId, supabase);
    } catch (notifError) {
      console.warn(`[MC] Failed to create fallback notifications for application ${applicationId}:`, notifError);
    }
  }
}

// Helper function to create property owner forms for each group
async function createPropertyOwnerFormsForGroups(applicationId, groups) {
  const { createClient } = require('@supabase/supabase-js');
  const { getApplicationTypeData } = require('../../../lib/applicationTypes');
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Get application details
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('application_type')
      .eq('id', applicationId)
      .single();

    if (appError) {
      console.error('Error fetching application for group forms:', appError);
      return;
    }

    // Get application type data to determine required forms
    const appTypeData = await getApplicationTypeData(application.application_type);
    const requiredForms = appTypeData.required_forms || [];

    // Create forms for each group
    for (const group of groups) {
      for (const formType of requiredForms) {
        await supabase
          .from('property_owner_forms')
          .insert({
            application_id: applicationId,
            form_type: formType,
            property_group_id: group.id,  // Associate form with specific property group
            status: 'not_started',
            access_token: generateAccessToken(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          });
      }
      console.log(`Created ${requiredForms.length} forms for group: ${group.property_name}`);
    }

    console.log(`Successfully created forms for ${groups.length} property groups`);
  } catch (error) {
    console.error('Error creating property owner forms for groups:', error);
  }
} 
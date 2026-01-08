import { getServerStripe, getWebhookSecret } from '../../../lib/stripe';
import { getTestModeFromRequest } from '../../../lib/stripeMode';
import { sendInvoiceReceiptEmail, sendPaymentConfirmationEmail } from '../../../lib/emailService';

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
        
        // Update application status - keep as pending_payment to allow user to continue the flow
        const { data: updatedApp } = await supabase
          .from('applications')
          .update({
            status: 'pending_payment',
            payment_completed_at: new Date().toISOString(),
            payment_status: 'completed'
          })
          .eq('stripe_session_id', session.id)
          .select('id, application_type')
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
                  
                  // First try to get product name (if product is expanded)
                  if (item.price?.product) {
                    const product = typeof item.price.product === 'string' 
                      ? null 
                      : item.price.product;
                    itemName = product?.name || null;
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
        
        // Update application status and correct total amount
        const updateData = {
          status: 'payment_completed',
          payment_completed_at: new Date().toISOString(),
          stripe_payment_intent_id: paymentIntent.id
        };
        
        // Correct the total amount based on actual payment
        if (paymentIntent.amount_total) {
          updateData.total_amount = paymentIntent.amount_total / 100; // Convert from cents
        }
        
        // Try to find application by payment intent ID first (for direct payment intents)
        let { data: updatedApplication } = await supabase
          .from('applications')
          .update(updateData)
          .eq('stripe_payment_intent_id', paymentIntent.id)
          .select(`
            id,
            submitter_email,
            submitter_name,
            property_address,
            package_type,
            total_amount,
            application_type
          `)
          .single();

        // If not found, try to find via checkout session (for checkout session payments)
        if (!updatedApplication) {
          try {
            // Search for checkout sessions with this payment intent
            const sessions = await stripe.checkout.sessions.list({
              payment_intent: paymentIntent.id,
              limit: 1
            });
            
            if (sessions.data.length > 0) {
              const sessionId = sessions.data[0].id;
              console.log(`[Webhook] PaymentIntent not found directly, trying via checkout session: ${sessionId}`);
              
              // Find application by session ID and update
              const { data: sessionApp } = await supabase
                .from('applications')
                .update(updateData)
                .eq('stripe_session_id', sessionId)
                .select(`
                  id,
                  submitter_email,
                  submitter_name,
                  property_address,
                  package_type,
                  total_amount,
                  application_type
                `)
                .single();
              
              if (sessionApp) {
                updatedApplication = sessionApp;
                console.log(`[Webhook] Found application ${sessionApp.id} via checkout session ${sessionId}`);
              }
            }
          } catch (sessionError) {
            console.warn('[Webhook] Could not find application via checkout session:', sessionError.message);
          }
        }

        // Handle multi-community applications
        const applicationId = paymentIntent.metadata.applicationId || updatedApplication?.id;
        const isMultiCommunity = paymentIntent.metadata.isMultiCommunity === 'true';
        
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
                    
                    // First try to get product name (if product is expanded)
                    if (item.price?.product) {
                      const product = typeof item.price.product === 'string' 
                        ? null 
                        : item.price.product;
                      itemName = product?.name || null;
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
          } catch (emailError) {
            console.error('[Webhook] Failed to send receipt email:', emailError);
            // Don't fail the webhook if email fails
          }
        } else {
          if (!updatedApplication) {
            console.warn(`[Webhook] Application not found for payment intent ${paymentIntent.id}. Metadata:`, paymentIntent.metadata);
            console.warn(`[Webhook] Tried to find by: stripe_payment_intent_id=${paymentIntent.id}`);
          } else if (!updatedApplication.submitter_email) {
            console.warn(`[Webhook] Application ${applicationId} found but missing submitter_email`);
          } else {
            console.warn(`[Webhook] Cannot send receipt email - missing submitter_email for application ${applicationId}`);
          }
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
            .select('application_type')
            .eq('id', applicationId)
            .single();
          
          // Skip property owner forms for lender questionnaire (user uploads their own form)
          if (appData?.application_type === 'lender_questionnaire') {
            // Update status to under_review (file will be uploaded separately)
            await supabase
              .from('applications')
              .update({ status: 'under_review' })
              .eq('id', applicationId);
            console.log(`Skipping property owner forms for lender questionnaire application ${applicationId}`);
          } else if (isMultiCommunity) {
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

    // Use the first email for assignment (notifications will go to all)
    let ownerEmail = ownerEmails[0];
    
    // Remove "owner." prefix if present
    ownerEmail = ownerEmail.replace(/^owner\./, '');

    // For multi-community applications, use the primary property's owner email
    // (The primary property is the one in hoa_property_id, which is already what we have)
    if (property.is_multi_community) {
      console.log(`Multi-community application detected, using primary property owner: ${ownerEmail} (from ${ownerEmails.length} email(s))`);
    } else {
      console.log(`Single property application, using property owner: ${ownerEmail} (from ${ownerEmails.length} email(s))`);
    }

    // Check if a user exists with this email in the profiles table
    // Property owners must have role: staff, admin, or accounting
    // Try exact match first
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, role')
      .eq('email', ownerEmail)
      .single();

    // If not found, try case-insensitive search
    if (profileError || !profile) {
      const { data: profiles, error: searchError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .ilike('email', ownerEmail);
      
      if (!searchError && profiles && profiles.length > 0) {
        profile = profiles[0];
        profileError = null;
        console.log(`Found user with case-insensitive email match: ${profile.email}`);
      }
    }

    if (profileError || !profile) {
      // Property owner email doesn't exist in the system - this is okay, just leave it unassigned
      // This handles cases where fake/placeholder emails were used when creating properties
      console.log(`No user found with email ${ownerEmail} for application ${applicationId}. Leaving application unassigned.`);
      return { 
        success: true, 
        assignedTo: null,
        message: `Property owner email "${ownerEmail}" does not correspond to a user account. Application left unassigned.`
      };
    }

    // Verify the user has the correct role (staff, admin, or accounting)
    const allowedRoles = ['staff', 'admin', 'accounting'];
    if (!allowedRoles.includes(profile.role)) {
      // User exists but doesn't have admin access - leave it unassigned
      // This handles cases where property owner email exists but user doesn't have the right role
      console.log(`User ${ownerEmail} has role "${profile.role}" but property owners must be staff, admin, or accounting. Leaving application unassigned.`);
      return {
        success: true,
        assignedTo: null,
        message: `Property owner email "${ownerEmail}" exists but user has role "${profile.role}" (not staff/admin/accounting). Application left unassigned.`
      };
    }

    console.log(`Verified property owner user: ${ownerEmail} with role: ${profile.role}`);

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
  
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    console.log(`Handling multi-community application: ${applicationId}`);
    
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

    console.log(`Created ${groups.length} property groups`);

    // Generate documents for all groups
    const docResults = await generateDocumentsForAllGroups(applicationId, application);
    
    console.log(`Document generation completed for application ${applicationId}:`, {
      success: docResults.success,
      groupsProcessed: docResults.groups.length,
      errors: docResults.errors.length
    });

    // Create property owner forms for each group (for admin workflow)
    await createPropertyOwnerFormsForGroups(applicationId, groups);

  } catch (error) {
    console.error('Error handling multi-community application:', error);
    // Fallback to single property flow
    try {
      await createPropertyOwnerForms(applicationId, metadata);
    } catch (fallbackError) {
      console.error('Fallback to single property flow also failed:', fallbackError);
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
import { getServerStripe } from '../../../lib/stripe';

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

  const stripe = getServerStripe();
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Get raw body
    const rawBody = await getRawBody(req);
    
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    console.log('Webhook signature verified successfully:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

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
        console.log('Checkout session completed:', session.id);
        
        // Update application status - keep as pending_payment to allow user to continue the flow
        const { data: updatedApp } = await supabase
          .from('applications')
          .update({
            status: 'pending_payment',
            payment_completed_at: new Date().toISOString(),
            payment_status: 'completed'
          })
          .eq('stripe_session_id', session.id)
          .select()
          .single();

        // Send payment confirmation email using existing email service
        if (updatedApp) {
          try {
            const { sendPaymentConfirmationEmail } = require('../../../lib/emailService');
            
            await sendPaymentConfirmationEmail({
              to: session.customer_email || session.metadata.customerEmail,
              applicationId: updatedApp.id,
              customerName: session.metadata.customerName,
              propertyAddress: session.metadata.propertyAddress,
              packageType: session.metadata.packageType,
              totalAmount: (session.amount_total / 100).toFixed(2),
              stripeChargeId: session.payment_intent,
            });

            console.log('Payment confirmation email sent successfully');
          } catch (emailError) {
            console.error('Failed to send payment confirmation email:', emailError);
            // Don't fail the webhook if email fails
          }
        }
        break;

      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('Payment succeeded:', paymentIntent.id);
        
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
        
        await supabase
          .from('applications')
          .update(updateData)
          .eq('stripe_payment_intent_id', paymentIntent.id);

        // Handle multi-community applications
        const applicationId = paymentIntent.metadata.applicationId;
        const isMultiCommunity = paymentIntent.metadata.isMultiCommunity === 'true';
        
        if (applicationId) {
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
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          notes: application.application_type.startsWith('settlement') 
            ? 'Settlement agent request - requires accounting review'
            : null
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
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            notes: `Multi-community form for ${group.property_name} - ${application.application_type.startsWith('settlement') 
              ? 'Settlement agent request - requires accounting review'
              : 'Standard processing'}`
          });
      }
      console.log(`Created ${requiredForms.length} forms for group: ${group.property_name}`);
    }

    console.log(`Successfully created forms for ${groups.length} property groups`);
  } catch (error) {
    console.error('Error creating property owner forms for groups:', error);
  }
} 
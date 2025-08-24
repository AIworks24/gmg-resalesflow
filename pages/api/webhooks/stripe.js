import { getServerStripe } from '../../../lib/stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = getServerStripe();
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
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
        
        // Update application status
        await supabase
          .from('applications')
          .update({
            status: 'payment_completed',
            payment_completed_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntent.id
          })
          .eq('stripe_payment_intent_id', paymentIntent.id);

        // Create property owner forms for the application
        const applicationId = paymentIntent.metadata.applicationId;
        if (applicationId) {
          await createPropertyOwnerForms(applicationId, paymentIntent.metadata);
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
          notes: application.application_type.startsWith('settlement_agent') 
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
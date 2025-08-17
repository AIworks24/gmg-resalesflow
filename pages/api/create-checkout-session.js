const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { packageType, paymentMethod, applicationId, formData, amount } = req.body;

    // Validate required fields
    if (!packageType || !paymentMethod || !applicationId || !formData || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Calculate individual components - settlement agents get $200 base price
    const basePrice = formData.submitterType === 'settlement' ? 20000 : 31795; // Settlement: $200, Regular: $317.95 in cents
    const rushFee = packageType === 'rush' ? 7066 : 0; // $70.66 in cents
    const paymentFee = paymentMethod === 'credit_card' ? 995 : 0; // $9.95 in cents

    // Create line items for the checkout session
    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Virginia Resale Certificate - Standard Processing${formData.submitterType === 'settlement' ? ' (Settlement Agent)' : ''}`,
            description: `Complete HOA resale certificate package for ${formData.propertyAddress || 'your property'} (10-15 business days)${formData.submitterType === 'settlement' ? ' - Settlement Agent Pricing' : ''}`,
          },
          unit_amount: basePrice,
        },
        quantity: 1,
      },
    ];

    // Add rush processing fee as separate line item if rush package
    if (packageType === 'rush') {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Rush Processing Fee',
            description: 'Expedited processing - 5 business days instead of 10-15 days',
          },
          unit_amount: rushFee,
        },
        quantity: 1,
      });
    }

    // Add payment processing fee if credit card
    if (paymentMethod === 'credit_card') {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Credit Card Processing Fee',
            description: 'Processing fee for credit card payments',
          },
          unit_amount: paymentFee,
        },
        quantity: 1,
      });
    }

    // Create checkout session - redirect back to application flow instead of success page
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `${req.headers.origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}&app_id=${applicationId}`,
      cancel_url: `${req.headers.origin}/?payment_cancelled=true&app_id=${applicationId}`,
      metadata: {
        applicationId: applicationId,
        packageType: packageType,
        paymentMethod: paymentMethod,
        propertyAddress: formData.propertyAddress || '',
        customerName: formData.submitterName || '',
        customerEmail: formData.submitterEmail || '',
      },
      customer_email: formData.submitterEmail,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
    });

    // Update the application with the session ID
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    const { error: updateError } = await supabase
      .from('applications')
      .update({ 
        stripe_session_id: session.id,
        payment_status: 'pending'
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Error updating application with session ID:', updateError);
      // Don't fail the entire request if this update fails
    }

    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('Checkout session creation error:', error);
    res.status(500).json({ error: error.message });
  }
} 
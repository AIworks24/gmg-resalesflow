import { getServerStripe, calculateTotalAmount } from '../../lib/stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { packageType, paymentMethod, applicationId, formData, paymentMethodId, amount } = req.body;

    // Validate required fields
    if (!packageType || !paymentMethod) {
      return res.status(400).json({ 
        error: 'Missing required fields: packageType, paymentMethod' 
      });
    }

    // Calculate total amount in cents (use provided amount or calculate)
    const totalAmount = amount || calculateTotalAmount(packageType, paymentMethod);

    // Validate amount
    if (totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const stripe = getServerStripe();

    // Create payment intent
    const paymentIntentData = {
      amount: totalAmount,
      currency: 'usd',
      metadata: {
        applicationId: applicationId || 'temp',
        packageType: packageType,
        paymentMethod: paymentMethod,
        submitterName: formData?.submitterName || '',
        submitterEmail: formData?.submitterEmail || '',
        hoaProperty: formData?.hoaProperty || '',
        propertyAddress: formData?.propertyAddress || '',
        buyerName: formData?.buyerName || '',
        sellerName: formData?.sellerName || '',
        salePrice: formData?.salePrice || '',
        closingDate: formData?.closingDate || ''
      },
    };

    // If payment method ID is provided, attach it to the payment intent
    if (paymentMethodId) {
      paymentIntentData.payment_method = paymentMethodId;
      paymentIntentData.confirmation_method = 'manual';
      paymentIntentData.confirm = true;
      paymentIntentData.return_url = `${req.headers.origin || 'http://localhost:3000'}/payment/success`;
    } else {
      paymentIntentData.automatic_payment_methods = {
        enabled: true,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    // Update application with payment intent ID (only if applicationId exists)
    if (applicationId) {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      await supabase
        .from('applications')
        .update({
          stripe_payment_intent_id: paymentIntent.id,
          total_amount: totalAmount / 100, // Convert back to dollars for storage
          package_type: packageType,
          payment_method: paymentMethod,
          status: 'payment_pending'
        })
        .eq('id', applicationId);
    }

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: error.message 
    });
  }
} 
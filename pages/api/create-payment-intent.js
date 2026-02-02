import { getServerStripe, calculateTotalAmount } from '../../lib/stripe';
import { getTestModeFromRequest, getConnectedAccountId } from '../../lib/stripeMode';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let finalTestMode = getTestModeFromRequest(req);

    const { resolveActingUser } = await import('../../lib/impersonation');
    const identity = await resolveActingUser(req, res);
    if (identity.isImpersonating) {
      finalTestMode = true;
      console.warn('[IMPERSONATION] Forced test mode for payment safety');
    }

    const stripe = getServerStripe(req, { forceTestMode: identity.isImpersonating || undefined });
    const { packageType, paymentMethod, applicationId, formData, paymentMethodId, amount, propertyCount } = req.body;

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

    // Determine property item count for transfer calculation
    // Priority: 1) propertyCount from request body, 2) fetch from database, 3) default to 1
    let propertyItemCount = 1; // Default to 1 for single property
    
    if (propertyCount && typeof propertyCount === 'number' && propertyCount > 0) {
      // Use propertyCount from request body if provided
      propertyItemCount = propertyCount;
    } else if (applicationId) {
      // Try to fetch property information from database
      try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Fetch application with property information
        const { data: application, error: appError } = await supabase
          .from('applications')
          .select(`
            hoa_property_id,
            hoa_properties (
              id,
              is_multi_community
            )
          `)
          .eq('id', applicationId)
          .single();
        
        if (!appError && application?.hoa_properties) {
          const hoaProperty = application.hoa_properties;
          
          if (hoaProperty.is_multi_community) {
            // For multi-community, calculate pricing to get accurate property item count
            // Only count properties that actually have a charge (total > 0)
            try {
              const { calculateMultiCommunityPricing } = require('../../lib/multiCommunityUtils');
              const { determineApplicationType } = require('../../lib/applicationTypes');
              
              // Determine application type (need submitterType and publicOffering from formData)
              const applicationType = determineApplicationType(
                formData?.submitterType || 'standard',
                hoaProperty,
                formData?.publicOffering || false
              );
              
              // Calculate multi-community pricing to get accurate association count
              const multiCommunityPricing = await calculateMultiCommunityPricing(
                hoaProperty.id,
                packageType,
                applicationType,
                supabase,
                formData?.submitterType,
                formData?.publicOffering
              );
              
              // Count only associations that have a charge (total > 0)
              if (multiCommunityPricing?.associations) {
                propertyItemCount = multiCommunityPricing.associations.filter(assoc => assoc.total > 0).length;
              } else {
                // Fallback: count all properties if pricing calculation fails
                const { getAllPropertiesForTransaction } = require('../../lib/multiCommunityUtils');
                const allProperties = await getAllPropertiesForTransaction(hoaProperty.id, supabase);
                propertyItemCount = allProperties.length;
              }
            } catch (pricingError) {
              // Fallback: count all properties if pricing calculation fails
              console.warn(`[Stripe Connect] Could not calculate multi-community pricing, using property count:`, pricingError.message);
              const { getAllPropertiesForTransaction } = require('../../lib/multiCommunityUtils');
              const allProperties = await getAllPropertiesForTransaction(hoaProperty.id, supabase);
              propertyItemCount = allProperties.length;
            }
          } else {
            propertyItemCount = 1;
          }
        }
      } catch (error) {
        console.warn(`[Stripe Connect] Could not determine property count from database, defaulting to 1:`, error.message);
        // Default to 1 if we can't determine
      }
    }

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
        closingDate: formData?.closingDate || '',
        propertyCount: propertyItemCount.toString()
      },
    };

    // Add Stripe Connect transfer for transactions >= $200
    // Transfer $21 per property item to connected account, platform keeps the rest
    const TRANSFER_THRESHOLD_CENTS = 20000; // $200.00
    const TRANSFER_AMOUNT_PER_ITEM_CENTS = 2100; // $21.00 per property item
    
    // Calculate total transfer amount: $21 × number of property items
    const totalTransferAmountCents = TRANSFER_AMOUNT_PER_ITEM_CENTS * propertyItemCount;
    
    if (totalAmount >= TRANSFER_THRESHOLD_CENTS) {
      const connectedAccountId = getConnectedAccountId(finalTestMode);
      
      if (connectedAccountId) {
        // Add transfer_data to payment intent
        paymentIntentData.transfer_data = {
          destination: connectedAccountId,
          amount: totalTransferAmountCents, // $21 × propertyItemCount to connected account
        };
        
        console.log(`[Stripe Connect] PaymentIntent - Transfer enabled: $${(totalTransferAmountCents / 100).toFixed(2)} ($${(TRANSFER_AMOUNT_PER_ITEM_CENTS / 100).toFixed(2)} × ${propertyItemCount} property items) to connected account ${connectedAccountId}`);
        console.log(`[Stripe Connect] PaymentIntent - Total amount: $${(totalAmount / 100).toFixed(2)}, Platform keeps: $${((totalAmount - totalTransferAmountCents) / 100).toFixed(2)}`);
      } else {
        console.warn(`[Stripe Connect] PaymentIntent - Transfer threshold met ($${(totalAmount / 100).toFixed(2)} >= $${(TRANSFER_THRESHOLD_CENTS / 100).toFixed(2)}), but connected account ID not configured`);
      }
    } else {
      console.log(`[Stripe Connect] PaymentIntent - Transfer not needed: $${(totalAmount / 100).toFixed(2)} < $${(TRANSFER_THRESHOLD_CENTS / 100).toFixed(2)}`);
    }

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
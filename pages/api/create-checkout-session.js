const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');
const { 
  determineApplicationType,
  getApplicationTypePricing,
  calculateTotalAmount,
  getApplicationTypeMessaging
} = require('../../lib/applicationTypes');
const { 
  getAllPropertiesForTransaction,
  calculateMultiCommunityPricing 
} = require('../../lib/multiCommunityUtils');

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

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Determine application type using database-driven approach
    let applicationType;
    let isMultiCommunity = false;
    let allProperties = [];
    let multiCommunityPricing = null;
    
    try {
      // Fetch property information to determine application type
      const { data: hoaProperty, error: hoaError } = await supabase
        .from('hoa_properties')
        .select('*')
        .eq('name', formData.hoaProperty)
        .single();

      if (hoaError) {
        console.error('Error fetching HOA property:', hoaError);
        throw new Error('Could not determine property location');
      }

      applicationType = determineApplicationType(formData.submitterType, hoaProperty, formData.publicOffering);
      
      // Check if this is a multi-community property
      if (hoaProperty.is_multi_community) {
        isMultiCommunity = true;
        console.log('Multi-community property detected:', hoaProperty.name);
        
        // Get all properties for this transaction (primary + linked)
        allProperties = await getAllPropertiesForTransaction(hoaProperty.id, supabase);
        console.log('All properties for transaction:', allProperties.map(p => p.name || p.property_name));
        
        // Calculate multi-community pricing
        multiCommunityPricing = await calculateMultiCommunityPricing(
          hoaProperty.id, 
          packageType, 
          applicationType,
          supabase
        );
        console.log('Multi-community pricing:', multiCommunityPricing);
      } else {
        allProperties = [hoaProperty];
      }
    } catch (error) {
      console.error('Error determining application type:', error);
        applicationType = 'single_property'; // Fallback to single property
      // Try to get the property for fallback
      try {
        const { data: hoaProperty } = await supabase
          .from('hoa_properties')
          .select('*')
          .eq('name', formData.hoaProperty)
          .single();
        allProperties = hoaProperty ? [hoaProperty] : [];
      } catch (fallbackError) {
        console.error('Error fetching property for fallback:', fallbackError);
        allProperties = [];
      }
    }

    // Public Offering Statement special handling
    if (formData?.submitterType === 'builder' && formData?.publicOffering) {
      const basePrice = 200.0;
      const rushFee = packageType === 'rush' ? 70.66 : 0;
      const totalAmount = basePrice + rushFee + (paymentMethod === 'credit_card' ? 9.95 : 0);
      const basePriceCents = Math.round(basePrice * 100);
      const rushFeeCents = Math.round(rushFee * 100);
      const creditCardFeeCents = paymentMethod === 'credit_card' ? 995 : 0;

      const lineItems = [];
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Public Offering Statement',
            description: 'Document request only',
          },
          unit_amount: basePriceCents,
        },
        quantity: 1,
      });
      if (rushFeeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Rush Processing',
              description: '5 business days',
            },
            unit_amount: rushFeeCents,
          },
          quantity: 1,
        });
      }
      if (creditCardFeeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: { name: 'Credit Card Processing Fee' },
            unit_amount: creditCardFeeCents,
          },
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: lineItems,
        mode: 'payment',
        allow_promotion_codes: true,
        success_url: `${req.headers.origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}&app_id=${applicationId}`,
        cancel_url: `${req.headers.origin}/?payment_cancelled=true&app_id=${applicationId}`,
        metadata: {
          applicationId: applicationId,
          packageType: 'standard',
          paymentMethod: paymentMethod,
          specialRequest: 'public_offering',
        },
        customer_email: formData.submitterEmail,
        billing_address_collection: 'required',
        shipping_address_collection: { allowed_countries: ['US'] },
      });

      // Update the application with the session ID
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await supabase
        .from('applications')
        .update({ stripe_session_id: session.id, payment_status: 'pending' })
        .eq('id', applicationId);

      return res.status(200).json({ sessionId: session.id });
    }

    // Get pricing and messaging using database-driven approach
    let basePrice, totalAmount, messaging;
    
    if (isMultiCommunity && multiCommunityPricing) {
      // Use multi-community pricing
      // For multi-community, basePrice is just for display (not used in Stripe)
      // totalAmount should be the sum of all associations (base + rush for each property)
      // PLUS a credit card fee for EACH association if applicable
      basePrice = multiCommunityPricing.total; // This is sum of all (base + rush) per association
      totalAmount = multiCommunityPricing.total + (paymentMethod === 'credit_card' ? 9.95 * allProperties.length : 0);
      messaging = getApplicationTypeMessaging(applicationType);
      
      console.log(`Multi-community pricing: Base=${basePrice}, Total=${totalAmount}, Properties=${allProperties.length}`);
    } else {
      // Single property pricing
      try {
        // Get base price without credit card fee
        basePrice = await getApplicationTypePricing(applicationType, packageType);
        
        // Get total amount including credit card fee
        totalAmount = await calculateTotalAmount(applicationType, packageType, paymentMethod);
        
        // Get messaging for the application type
        messaging = getApplicationTypeMessaging(applicationType);
        
        console.log(`Database pricing: Type=${applicationType}, Package=${packageType}, Base=${basePrice}, Total=${totalAmount}`);
      } catch (error) {
        console.error('Database pricing error:', error);
        // Fallback pricing
        if (formData.submitterType === 'settlement') {
          basePrice = 200.00;
          totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
        } else {
          basePrice = 317.95;
          if (packageType === 'rush') basePrice += 70.66;
          totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
        }
        messaging = {
          title: 'Application Processing',
          formType: 'Standard Form'
        };
      }
    }

    // Convert to cents for Stripe
    const basePriceCents = Math.round(basePrice * 100);
    const totalAmountCents = Math.round(totalAmount * 100);
    const creditCardFeeCents = paymentMethod === 'credit_card' ? 995 : 0;

    // Handle free transactions (e.g., Virginia settlement agents with standard processing)
    if (totalAmount === 0) {
      // Update application as completed without payment
      const { error: updateError } = await supabase
        .from('applications')
        .update({ 
          payment_status: 'not_required',
          status: 'under_review' 
        })
        .eq('id', applicationId);

      if (updateError) {
        console.error('Error updating free application:', updateError);
        return res.status(500).json({ error: 'Failed to process free application' });
      }

      return res.status(200).json({ 
        sessionId: null, 
        isFree: true,
        message: 'Application processed successfully - no payment required' 
      });
    }

    // Create line items for the checkout session
    const lineItems = [];
    
    if (isMultiCommunity && multiCommunityPricing) {
      // Multi-community: Create separate line items for each association
      // Use the associations array which includes rush fees
      multiCommunityPricing.associations.forEach((association) => {
        const totalPerAssociation = association.total; // This includes basePrice + rushFee
        const totalPerAssociationCents = Math.round(totalPerAssociation * 100);
        
        if (totalPerAssociationCents > 0) {
          // Build description with breakdown
          let description = `${messaging.formType} for ${association.name}`;
          if (packageType === 'rush') {
            description += ` (5 business days)`;
            if (association.rushFee > 0) {
              description += ` - Base: $${association.basePrice.toFixed(2)}, Rush: +$${association.rushFee.toFixed(2)}`;
            }
          } else {
            description += ` (10-15 business days)`;
          }
          
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${messaging.formType} - ${association.name}${association.isPrimary ? ' (Primary)' : ''}`,
                description: description,
              },
              unit_amount: totalPerAssociationCents,
            },
            quantity: 1,
          });

          // Add credit card processing fee for each association if credit card
          if (creditCardFeeCents > 0) {
            lineItems.push({
              price_data: {
                currency: 'usd',
                product_data: {
                  name: 'Credit Card Processing Fee',
                  description: `Processing fee for ${association.name}`,
                },
                unit_amount: creditCardFeeCents,
              },
              quantity: 1,
            });
          }
        }
      });
    } else {
      // Single property: Add base price item
      if (basePriceCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${messaging.formType} - ${packageType === 'rush' ? 'Rush' : 'Standard'} Processing`,
              description: `${messaging.formType} for ${formData.propertyAddress || 'your property'} (${packageType === 'rush' ? '5 business days' : '10-15 business days'})`,
            },
            unit_amount: basePriceCents,
          },
          quantity: 1,
        });
      }

      // Add payment processing fee if credit card (single fee for single property)
      if (creditCardFeeCents > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Credit Card Processing Fee',
              description: 'Processing fee for credit card payments',
            },
            unit_amount: creditCardFeeCents,
          },
          quantity: 1,
        });
      }
    }

    // Create checkout session - redirect back to application flow instead of success page
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      allow_promotion_codes: true, // Enable promo code input on Stripe checkout page
      success_url: `${req.headers.origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}&app_id=${applicationId}`,
      cancel_url: `${req.headers.origin}/?payment_cancelled=true&app_id=${applicationId}`,
      metadata: {
        applicationId: applicationId,
        packageType: packageType,
        paymentMethod: paymentMethod,
        propertyAddress: formData.propertyAddress || '',
        customerName: formData.submitterName || '',
        customerEmail: formData.submitterEmail || '',
        isMultiCommunity: isMultiCommunity.toString(),
        propertyCount: allProperties.length.toString(),
        primaryProperty: allProperties[0]?.name || formData.hoaProperty,
        linkedProperties: isMultiCommunity ? allProperties.slice(1).map(p => p.name || p.property_name).join(',') : '',
      },
      customer_email: formData.submitterEmail,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
    });

    // Update the application with the session ID
    
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
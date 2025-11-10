const { getServerStripe } = require('../../lib/stripe');
const { getTestModeFromRequest, getStripePriceIds, getConnectedAccountId } = require('../../lib/stripeMode');
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
    // Check if test mode is enabled (defaults to LIVE mode if no valid test code)
    const useTestMode = getTestModeFromRequest(req);
    const stripe = getServerStripe(req);
    
    // Also check testMode from body (but only if it's explicitly true)
    const bodyTestMode = req.body?.testMode === true;
    const finalTestMode = useTestMode || bodyTestMode;
    
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
        // Pass submitterType and publicOffering to check if forced price applies
        multiCommunityPricing = await calculateMultiCommunityPricing(
          hoaProperty.id, 
          packageType, 
          applicationType,
          supabase,
          formData.submitterType,
          formData.publicOffering
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

      // Calculate total amount in cents for public offering
      const publicOfferingTotalCents = basePriceCents + rushFeeCents + creditCardFeeCents;
      
      // Prepare checkout session data for public offering
      const publicOfferingSessionData = {
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
      };

      // Add Stripe Connect transfer for transactions >= $200
      const TRANSFER_THRESHOLD_CENTS = 20000; // $200.00
      const TRANSFER_AMOUNT_CENTS = 2100; // $21.00
      
      if (publicOfferingTotalCents >= TRANSFER_THRESHOLD_CENTS) {
        const connectedAccountId = getConnectedAccountId(finalTestMode);
        
        if (connectedAccountId) {
          publicOfferingSessionData.payment_intent_data = {
            transfer_data: {
              destination: connectedAccountId,
              amount: TRANSFER_AMOUNT_CENTS, // $21 to connected account
            },
          };
          
          console.log(`[Stripe Connect] Public Offering - Transfer enabled: $${(TRANSFER_AMOUNT_CENTS / 100).toFixed(2)} to connected account ${connectedAccountId}`);
          console.log(`[Stripe Connect] Public Offering - Total amount: $${(publicOfferingTotalCents / 100).toFixed(2)}, Platform keeps: $${((publicOfferingTotalCents - TRANSFER_AMOUNT_CENTS) / 100).toFixed(2)}`);
        } else {
          console.warn(`[Stripe Connect] Public Offering - Transfer threshold met, but connected account ID not configured`);
        }
      }

      const session = await stripe.checkout.sessions.create(publicOfferingSessionData);

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
        // Get property ID from hoaProperty (should be available from earlier fetch)
        const propertyId = allProperties.length > 0 ? allProperties[0].id : null;
        
        // Get base price without credit card fee (pass propertyId, submitterType, and publicOffering to check for forced price)
        basePrice = await getApplicationTypePricing(applicationType, packageType, propertyId, supabase, formData.submitterType, formData.publicOffering);
        
        // Calculate total amount
        // Note: getApplicationTypePricing already handles forced price + rush fees correctly
        // basePrice will contain: forced price (if enabled and applicable) + rush fee (if rush package)
        // Forced price only applies to standard resale applications (single_property, multi_community)
        // So we just need to add convenience fee
        if (propertyId) {
          const { shouldApplyForcedPrice } = require('../../lib/applicationTypes');
          const { getForcedPriceValue } = require('../../lib/propertyPricingUtils');
          
          // Only check for forced price if submitterType is 'builder' AND public offering is NOT requested
          if (shouldApplyForcedPrice(formData.submitterType, formData.publicOffering)) {
            const forcedPrice = await getForcedPriceValue(propertyId, supabase);
            if (forcedPrice !== null) {
              // basePrice already includes forced price + rush fee (if rush)
              // Just add convenience fee
              totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
            } else {
              // Use standard calculation with rush fees
              totalAmount = await calculateTotalAmount(applicationType, packageType, paymentMethod);
            }
          } else {
            // Forced price doesn't apply (not builder or public offering requested), use standard calculation
            totalAmount = await calculateTotalAmount(applicationType, packageType, paymentMethod);
          }
        } else {
          // No propertyId available, use standard calculation
          totalAmount = await calculateTotalAmount(applicationType, packageType, paymentMethod);
        }
        
        // Get messaging for the application type
        messaging = getApplicationTypeMessaging(applicationType);
        
        console.log(`Database pricing: Type=${applicationType}, Package=${packageType}, Base=${basePrice}, Total=${totalAmount}`);
      } catch (error) {
        console.error('Database pricing error:', error);
        // Fallback pricing - try to determine correct pricing based on application type
        if (applicationType === 'settlement_nc') {
          // North Carolina settlement: $450 standard, $550 rush
          basePrice = packageType === 'rush' ? 550.00 : 450.00;
          totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
        } else if (applicationType === 'settlement_va') {
          // Virginia settlement: FREE standard, $70.66 rush
          basePrice = packageType === 'rush' ? 70.66 : 0.00;
          totalAmount = basePrice + (paymentMethod === 'credit_card' && basePrice > 0 ? 9.95 : 0);
        } else if (applicationType === 'lender_questionnaire') {
          // Lender questionnaire: $400 standard, $500 rush
          basePrice = packageType === 'rush' ? 500.00 : 400.00;
          totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
        } else if (applicationType === 'public_offering') {
          // Public offering: $200 flat fee
          basePrice = 200.00;
          totalAmount = basePrice + (paymentMethod === 'credit_card' ? 9.95 : 0);
        } else {
          // Standard resale certificate: $317.95 standard, $388.61 rush
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
          status: 'under_review',
          submitted_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) {
        console.error('Error updating free application:', updateError);
        return res.status(500).json({ error: 'Failed to process free application' });
      }

      // Auto-assign application for free transactions
      try {
        const { autoAssignApplication } = require('./auto-assign-application');
        console.log(`[Checkout] Attempting to auto-assign free application ${applicationId}`);
        const assignResult = await autoAssignApplication(applicationId, supabase);
        if (assignResult && assignResult.success) {
          console.log(`[Checkout] Successfully auto-assigned application ${applicationId} to ${assignResult.assignedTo}`);
        } else {
          console.warn(`[Checkout] Failed to auto-assign application ${applicationId}:`, assignResult?.error);
        }
      } catch (assignError) {
        console.error('[Checkout] Error auto-assigning application:', assignError);
        // Don't fail the checkout if auto-assignment fails
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
        // Only use Stripe Price IDs for standard application types (single_property, multi_community)
        // Special application types (settlement_nc, settlement_va, lender_questionnaire, public_offering)
        // should always use price_data to ensure correct pricing
        const shouldUsePriceIds = applicationType === 'single_property' || applicationType === 'multi_community';
        
        let usePriceId = false;
        
        if (shouldUsePriceIds) {
          // Try to use Stripe Price ID or Product ID if available (only for standard types)
          const priceIds = getStripePriceIds(finalTestMode);
          let priceIdOrProductId = packageType === 'rush' 
            ? priceIds.rushProcessingPriceId 
            : priceIds.standardProcessingPriceId;
          
          // If we have a Product ID (starts with prod_), fetch its default price
          if (priceIdOrProductId && priceIdOrProductId.startsWith('prod_')) {
            try {
              const productId = priceIdOrProductId;
              console.log(`[Stripe] Product ID provided (${productId}), fetching price...`);
              
              // Fetch the product to get its default price
              const product = await stripe.products.retrieve(productId);
              console.log(`[Stripe] Product retrieved: ${product.name}, default_price: ${product.default_price}`);
              
              if (product.default_price) {
                // Product has a default price
                priceIdOrProductId = typeof product.default_price === 'string' 
                  ? product.default_price 
                  : product.default_price.id;
                
                // Fetch the price details to verify amount
                const priceDetails = await stripe.prices.retrieve(priceIdOrProductId);
                console.log(`[Stripe] Using default price: ${priceIdOrProductId}, amount: $${(priceDetails.unit_amount / 100).toFixed(2)}`);
                
                // Warn if price doesn't match expected amount (but still use it)
                const expectedAmount = packageType === 'rush' ? 38861 : 31795; // in cents
                if (priceDetails.unit_amount !== expectedAmount) {
                  console.warn(`[Stripe] ⚠️ Price amount mismatch! Expected: $${(expectedAmount / 100).toFixed(2)}, Got: $${(priceDetails.unit_amount / 100).toFixed(2)}`);
                  console.warn(`[Stripe] Product "${product.name}" price should be: $${(expectedAmount / 100).toFixed(2)} (${packageType === 'rush' ? 'base $317.95 + rush $70.66' : 'base $317.95'})`);
                }
              } else {
                // No default price, fetch all active prices and use the first one
                console.log(`[Stripe] No default price found for product, fetching active prices...`);
                const prices = await stripe.prices.list({
                  product: productId,
                  active: true,
                  limit: 10, // Get more prices to find the right one
                });
                
                if (prices.data.length > 0) {
                  // Try to find price that matches expected amount
                  const expectedAmount = packageType === 'rush' ? 38861 : 31795;
                  const matchingPrice = prices.data.find(p => p.unit_amount === expectedAmount);
                  
                  if (matchingPrice) {
                    priceIdOrProductId = matchingPrice.id;
                    console.log(`[Stripe] Found matching price: ${priceIdOrProductId}, amount: $${(matchingPrice.unit_amount / 100).toFixed(2)}`);
                  } else {
                    // Use first active price and warn
                    priceIdOrProductId = prices.data[0].id;
                    console.warn(`[Stripe] Using first active price: ${priceIdOrProductId}, amount: $${(prices.data[0].unit_amount / 100).toFixed(2)}`);
                    console.warn(`[Stripe] ⚠️ Price amount doesn't match expected $${(expectedAmount / 100).toFixed(2)}`);
                  }
                } else {
                  console.warn(`[Stripe] No active prices found for product ${productId}, falling back to price_data`);
                  priceIdOrProductId = null; // No price found, fallback to price_data
                }
              }
            } catch (error) {
              console.error(`[Stripe] Error fetching price for product ${priceIdOrProductId}:`, error.message);
              priceIdOrProductId = null; // Fallback to price_data
            }
          }
          
          // Use Price ID if we have one (starts with price_)
          if (priceIdOrProductId && priceIdOrProductId.startsWith('price_')) {
            console.log(`[Stripe] Using Price ID: ${priceIdOrProductId} for ${packageType === 'rush' ? 'Rush' : 'Standard'} Processing`);
            console.log(`[Stripe] Calculated basePriceCents: ${basePriceCents} (${(basePriceCents / 100).toFixed(2)})`);
            
            // Verify the price matches (optional check - Stripe will charge what's set in Price ID)
            // Note: If using Price IDs, make sure they match:
            // - Standard Processing Price ID should be $317.95 (31795 cents)
            // - Rush Processing Price ID should be $388.61 (38861 cents = $317.95 + $70.66)
            // Credit card fee ($9.95) is added separately as a line item
            
            lineItems.push({
              price: priceIdOrProductId,
              quantity: 1,
            });
            usePriceId = true;
          }
        }
        
        // Use price_data if Price ID is not used (either not applicable or not available)
        if (!usePriceId) {
          // For special application types or when Price ID is not available, use price_data
          // This ensures correct pricing for settlement_nc, settlement_va, lender_questionnaire, etc.
          console.log(`[Stripe] Using price_data for ${applicationType} - creating product on the fly`);
          console.log(`[Stripe] basePriceCents: ${basePriceCents} (${(basePriceCents / 100).toFixed(2)}) for ${packageType === 'rush' ? 'Rush' : 'Standard'} Processing`);
          
          // Determine delivery time based on application type
          let deliveryTime = packageType === 'rush' ? '5 business days' : '10-15 business days';
          if (applicationType === 'settlement_nc' || applicationType === 'settlement_va') {
            deliveryTime = packageType === 'rush' ? '3 business days' : '14 calendar days';
          } else if (applicationType === 'lender_questionnaire') {
            deliveryTime = packageType === 'rush' ? '5 business days' : '10-15 business days';
          }
          
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${messaging.formType} - ${packageType === 'rush' ? 'Rush' : 'Standard'} Processing`,
                description: `${messaging.formType} for ${formData.propertyAddress || 'your property'} (${deliveryTime})`,
              },
              unit_amount: basePriceCents, // This already includes rush fee if rush is selected
            },
            quantity: 1,
          });
        }
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

    // Preserve test mode in success/cancel URLs if test mode is enabled
    const testParam = finalTestMode && req.query?.test ? `&test=${req.query.test}` : '';
    
    // Prepare checkout session data
    const sessionData = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      allow_promotion_codes: true, // Enable promo code input on Stripe checkout page
      success_url: `${req.headers.origin}/?payment_success=true&session_id={CHECKOUT_SESSION_ID}&app_id=${applicationId}${testParam}`,
      cancel_url: `${req.headers.origin}/?payment_cancelled=true&app_id=${applicationId}${testParam}`,
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
    };

    // Add Stripe Connect transfer for transactions >= $200
    // Transfer $21 to connected account, platform keeps the rest
    const TRANSFER_THRESHOLD_CENTS = 20000; // $200.00
    const TRANSFER_AMOUNT_CENTS = 2100; // $21.00
    
    if (totalAmountCents >= TRANSFER_THRESHOLD_CENTS) {
      const connectedAccountId = getConnectedAccountId(finalTestMode);
      
      if (connectedAccountId) {
        // Add transfer_data to payment_intent_data
        sessionData.payment_intent_data = {
          transfer_data: {
            destination: connectedAccountId,
            amount: TRANSFER_AMOUNT_CENTS, // $21 to connected account
          },
        };
        
        console.log(`[Stripe Connect] Transfer enabled: $${(TRANSFER_AMOUNT_CENTS / 100).toFixed(2)} to connected account ${connectedAccountId}`);
        console.log(`[Stripe Connect] Total amount: $${(totalAmountCents / 100).toFixed(2)}, Platform keeps: $${((totalAmountCents - TRANSFER_AMOUNT_CENTS) / 100).toFixed(2)}`);
      } else {
        console.warn(`[Stripe Connect] Transfer threshold met ($${(totalAmountCents / 100).toFixed(2)} >= $${(TRANSFER_THRESHOLD_CENTS / 100).toFixed(2)}), but connected account ID not configured`);
      }
    } else {
      console.log(`[Stripe Connect] Transfer not needed: $${(totalAmountCents / 100).toFixed(2)} < $${(TRANSFER_THRESHOLD_CENTS / 100).toFixed(2)}`);
    }
    
    // Create checkout session - redirect back to application flow instead of success page
    const session = await stripe.checkout.sessions.create(sessionData);

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
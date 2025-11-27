/**
 * Test Script for Stripe Connect $21 Transfer
 * 
 * This script tests the $21 transfer to connected account functionality
 * Run with: node scripts/test-stripe-connect-transfer.js
 * 
 * Make sure you have:
 * 1. STRIPE_SECRET_KEY_TEST in your .env.local
 * 2. STRIPE_CONNECTED_ACCOUNT_ID_TEST in your .env.local
 */

require('dotenv').config({ path: '.env.local' });
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY);

async function testConnectTransfer() {
  try {
    // Get connected account ID from environment
    const connectedAccountId = process.env.STRIPE_CONNECTED_ACCOUNT_ID_TEST;
    
    if (!connectedAccountId) {
      console.error('❌ Error: STRIPE_CONNECTED_ACCOUNT_ID_TEST not found in environment variables');
      console.log('Please add STRIPE_CONNECTED_ACCOUNT_ID_TEST=acct_xxxxx to your .env.local');
      process.exit(1);
    }

    console.log('🧪 Testing Stripe Connect Transfer');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Connected Account ID: ${connectedAccountId}`);
    console.log('');

    // Test amounts
    const testAmounts = [
      { name: 'Standard Resale ($317.95)', amount: 31795, shouldTransfer: true },
      { name: 'Rush Processing ($388.61)', amount: 38861, shouldTransfer: true },
      { name: 'Below $200 ($199.00)', amount: 19900, shouldTransfer: false },
      { name: 'Exactly $200', amount: 20000, shouldTransfer: true },
    ];

    for (const test of testAmounts) {
      console.log(`\n📦 Testing: ${test.name}`);
      console.log(`   Amount: $${(test.amount / 100).toFixed(2)}`);
      
      if (test.shouldTransfer && test.amount >= 20000) {
        const transferAmount = 2100; // $21 in cents
        const platformKeeps = test.amount - transferAmount;
        
        console.log(`   ✅ Amount ≥ $200 - Will transfer $21.00`);
        console.log(`   💰 Connected account receives: $${(transferAmount / 100).toFixed(2)}`);
        console.log(`   💰 Platform keeps: $${(platformKeeps / 100).toFixed(2)}`);
        
        // Create a test PaymentIntent (without confirming - just to test structure)
        try {
          const paymentIntent = await stripe.paymentIntents.create({
            amount: test.amount,
            currency: 'usd',
            payment_method_types: ['card'],
            transfer_data: {
              destination: connectedAccountId,
              amount: transferAmount,
            },
            // Don't confirm - just create to test
            confirm: false,
          }, {
            idempotencyKey: `test-${test.amount}-${Date.now()}`, // Prevent duplicate charges
          });

          console.log(`   ✅ PaymentIntent created successfully: ${paymentIntent.id}`);
          console.log(`   📋 Status: ${paymentIntent.status}`);
          
          // Cancel it immediately to avoid actual charge
          await stripe.paymentIntents.cancel(paymentIntent.id);
          console.log(`   🗑️  PaymentIntent cancelled (test only)`);
          
        } catch (error) {
          console.error(`   ❌ Error creating PaymentIntent: ${error.message}`);
          if (error.code === 'account_invalid') {
            console.error(`   ⚠️  Connected account ID is invalid. Please check STRIPE_CONNECTED_ACCOUNT_ID_TEST`);
          }
        }
      } else {
        console.log(`   ⏭️  Amount < $200 - No transfer needed`);
      }
    }

    // Test checkout session creation
    console.log('\n\n🧪 Testing Checkout Session Creation');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const testAmount = 31795; // $317.95
    const transferAmount = 2100; // $21
    
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Test Product - Resale Certificate',
              description: 'Standard Processing (10-15 business days)',
            },
            unit_amount: testAmount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        payment_intent_data: {
          transfer_data: {
            destination: connectedAccountId,
            amount: transferAmount, // $21 to connected account
          },
        },
        success_url: 'https://example.com/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'https://example.com/cancel',
        metadata: {
          test: 'true',
          amount: testAmount.toString(),
          transfer_amount: transferAmount.toString(),
        },
      });

      console.log(`✅ Checkout Session created: ${session.id}`);
      console.log(`📋 Session URL: ${session.url}`);
      console.log(`💰 Total amount: $${(testAmount / 100).toFixed(2)}`);
      console.log(`💸 Transfer to connected account: $${(transferAmount / 100).toFixed(2)}`);
      console.log(`💵 Platform keeps: $${((testAmount - transferAmount) / 100).toFixed(2)}`);
      console.log('\n⚠️  Note: This is a test session. Use test card 4242 4242 4242 4242 to complete payment.');
      
    } catch (error) {
      console.error(`❌ Error creating Checkout Session: ${error.message}`);
      if (error.code === 'account_invalid') {
        console.error(`⚠️  Connected account ID is invalid. Please check STRIPE_CONNECTED_ACCOUNT_ID_TEST`);
      }
      console.error(`Full error:`, error);
    }

    console.log('\n\n✅ Test completed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nNext steps:');
    console.log('1. Verify the connected account ID is correct');
    console.log('2. Check Stripe Dashboard → Connect → Accounts');
    console.log('3. Use the checkout session URL with test card: 4242 4242 4242 4242');
    console.log('4. Verify $21 appears in connected account after payment');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the test
testConnectTransfer();












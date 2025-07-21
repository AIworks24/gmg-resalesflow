const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch all active prices
    const prices = await stripe.prices.list({
      active: true,
      limit: 100, // Adjust as needed
    });

    // Filter and organize prices by product
    const standardPrice = prices.data.find(price => 
      price.metadata?.product_type === 'standard_processing' || 
      price.nickname?.toLowerCase().includes('standard')
    );

    const rushPrice = prices.data.find(price => 
      price.metadata?.product_type === 'rush_processing' || 
      price.nickname?.toLowerCase().includes('rush')
    );

    // If no prices found with metadata, get the most recent ones
    // You might need to adjust this logic based on your Stripe setup
    const fallbackStandardPrice = prices.data.find(price => 
      price.unit_amount === 32790 // $327.90 in cents (317.95 + 9.95)
    );

    const fallbackRushPrice = prices.data.find(price => 
      price.unit_amount === 39856 // $398.56 in cents (317.95 + 70.66 + 9.95)
    );

    const result = {
      standard: {
        price: standardPrice || fallbackStandardPrice,
        baseAmount: standardPrice ? standardPrice.unit_amount - 995 : 31795, // Subtract convenience fee
        displayAmount: standardPrice ? (standardPrice.unit_amount - 995) / 100 : 317.95
      },
      rush: {
        price: rushPrice || fallbackRushPrice,
        baseAmount: rushPrice ? rushPrice.unit_amount - 995 - 7066 : 31795, // Subtract convenience fee and rush fee
        rushFeeAmount: 7066, // $70.66 in cents
        displayAmount: rushPrice ? (rushPrice.unit_amount - 995 - 7066) / 100 : 317.95,
        rushFeeDisplay: 70.66
      },
      convenienceFee: {
        amount: 995, // $9.95 in cents
        display: 9.95
      }
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    // Return fallback prices if Stripe fails
    res.status(200).json({
      standard: {
        baseAmount: 31795,
        displayAmount: 317.95
      },
      rush: {
        baseAmount: 31795,
        rushFeeAmount: 7066,
        displayAmount: 317.95,
        rushFeeDisplay: 70.66
      },
      convenienceFee: {
        amount: 995,
        display: 9.95
      }
    });
  }
} 
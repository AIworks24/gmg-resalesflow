# Environment Variable Pricing Configuration

## Required Environment Variables

Add these environment variables to your `.env.local` file:

```bash
# Single Property Pricing (in cents)
SINGLE_PROPERTY_BASE_PRICE=31795
SINGLE_PROPERTY_RUSH_FEE=7066

# Multi-Community Pricing (in cents)
MULTI_COMMUNITY_BASE_PRICE=45000
MULTI_COMMUNITY_RUSH_FEE=10000

# Settlement Agent Pricing (in cents)
SETTLEMENT_VA_PRICE=0
SETTLEMENT_NC_PRICE=45000
SETTLEMENT_NC_RUSH_FEE=10000

# Public Offering Pricing (in cents)
PUBLIC_OFFERING_PRICE=20000
```

## Pricing Breakdown

### Single Property
- **Standard**: $317.95 (31795 cents)
- **Rush**: $388.61 (31795 + 7066 cents)

### Multi-Community
- **Standard**: $450.00 (45000 cents)
- **Rush**: $550.00 (45000 + 10000 cents)

### Settlement VA
- **Standard**: FREE (0 cents)
- **Rush**: FREE (0 cents)

### Settlement NC
- **Standard**: $450.00 (45000 cents)
- **Rush**: $550.00 (45000 + 10000 cents)

### Public Offering
- **Standard**: $200.00 (20000 cents)
- **Rush**: $200.00 (no rush processing)

## Deployment

### Vercel
Add these environment variables in your Vercel dashboard under Settings > Environment Variables.

### Other Platforms
Set these environment variables in your deployment platform's configuration.

## Benefits

- ✅ **Instant Updates**: Change prices without code deployments
- ✅ **Environment-Specific**: Different prices for dev/staging/prod
- ✅ **A/B Testing**: Easy to test different pricing strategies
- ✅ **Rollback**: Quick rollback by changing env vars
- ✅ **Security**: Sensitive pricing data not in code
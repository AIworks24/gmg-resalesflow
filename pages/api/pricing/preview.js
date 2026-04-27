/**
 * GET /api/pricing/preview
 * Returns server-calculated pricing for the authenticated user given a property + options.
 * Used by the front-end payment step to display an accurate total (including per-user overrides)
 * before creating a Stripe Checkout Session.
 *
 * Query params:
 *   propertyId    (number)
 *   submitterType (string)  builder | realtor | homeowner | settlement | ...
 *   packageType   (string)  standard | rush
 *   paymentMethod (string)  credit_card | ach
 *   publicOffering (boolean string)
 *   infoPacket     (boolean string)
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getUserOverride } from '../../../lib/userPricingUtils';
import { shouldApplyForcedPrice } from '../../../lib/applicationTypes';
import { getForcedPriceValue } from '../../../lib/propertyPricingUtils';
import { getPricing } from '../../../lib/pricingConfig';

const SUBMITTER_TYPES = ['builder', 'realtor', 'homeowner', 'settlement', 'lender', 'title'];

const QuerySchema = z.object({
  propertyId:    z.number().int().positive(),
  submitterType: z.string().refine(v => SUBMITTER_TYPES.includes(v), {
    message: `submitterType must be one of: ${SUBMITTER_TYPES.join(', ')}`,
  }),
  packageType:   z.enum(['standard', 'rush']).default('standard'),
  paymentMethod: z.enum(['credit_card', 'ach']).default('ach'),
  publicOffering: z.boolean().default(false),
  infoPacket:     z.boolean().default(false),
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse and validate query params
  const rawQuery = {
    propertyId:    Number(req.query.propertyId),
    submitterType: req.query.submitterType,
    packageType:   req.query.packageType,
    paymentMethod: req.query.paymentMethod,
    publicOffering: req.query.publicOffering === 'true',
    infoPacket:     req.query.infoPacket === 'true',
  };

  const parsed = QuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors[0].message });
  }

  const { propertyId, submitterType, packageType, paymentMethod, publicOffering, infoPacket } = parsed.data;

  // Use anon key to verify the user JWT, service key for DB reads
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Resolve authenticated user from Authorization header
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  let userId = null;
  if (token) {
    const { data: { user } } = await anonClient.auth.getUser(token);
    userId = user?.id || null;
  }

  let basePrice = null;
  let hasUserOverride = false;
  let overrideValidUntil = null;
  let applicantMessage = null;
  let hasForcedPrice = false;

  try {
    if (shouldApplyForcedPrice(submitterType, publicOffering, infoPacket)) {
      // 1. Per-user override (queries through junction table)
      if (userId) {
        const userOverride = await getUserOverride(propertyId, userId, serviceClient);
        if (userOverride) {
          basePrice          = userOverride.overridePrice;
          hasUserOverride    = true;
          overrideValidUntil = userOverride.validUntil;
          applicantMessage   = userOverride.applicantMessage;
          hasForcedPrice     = true;
        }
      }

      // 2. Property-wide force price
      if (!hasUserOverride) {
        const forcedPrice = await getForcedPriceValue(propertyId, serviceClient);
        if (forcedPrice !== null) {
          basePrice      = forcedPrice;
          hasForcedPrice = true;
        }
      }
    }

    // 3. Catalog fallback
    if (basePrice === null) {
      const pricing = getPricing('single_property', false);
      basePrice = pricing.base / 100;
    }

    // Rush add-on
    let rushFee = 0;
    if (packageType === 'rush') {
      const rushPricing = getPricing('single_property', true);
      rushFee = rushPricing.rushFee / 100;
    }

    const ccFee  = paymentMethod === 'credit_card' ? 9.95 : 0;
    const total  = basePrice + rushFee + ccFee;

    return res.status(200).json({
      basePrice,
      rushFee,
      ccFee,
      total,
      hasForcedPrice,
      hasUserOverride,
      overrideValidUntil,
      applicantMessage,
    });
  } catch (err) {
    console.error('[pricing/preview]', err);
    return res.status(500).json({ error: 'Failed to calculate pricing preview' });
  }
}

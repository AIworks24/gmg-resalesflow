import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getServerStripe } from '../../../../lib/stripe';
import { getCache, setCache } from '../../../../lib/redis';
import { format, startOfMonth } from 'date-fns';

const ALLOWED_ROLES = ['admin', 'staff', 'accounting'];

// Cap auto-pagination at 10 000 balance transactions (~10 years of typical HOA volume)
const MAX_TRANSACTIONS = 10_000;

// Redis cache TTL: 1 hour — Stripe data is the source of truth and rate-limited
const CACHE_TTL = 60 * 60;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    const { dateStart, dateEnd } = req.query;

    // Redis key scoped to date range (not per-user — Stripe data is global)
    const cacheKey = `reports:stripe-revenue:${dateStart || 'all'}:${dateEnd || 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Always use LIVE mode for reports — pass no req so getServerStripe defaults to live.
    // This ensures we always report on real transactions regardless of any test-mode
    // cookie that might be present on the admin's browser session.
    const stripe = getServerStripe();

    // Build Stripe date filter (Unix timestamps)
    const createdFilter = {};
    if (dateStart) createdFilter.gte = Math.floor(new Date(dateStart).getTime() / 1000);
    if (dateEnd)   createdFilter.lte = Math.floor(new Date(dateEnd).getTime()   / 1000);

    // Fetch balance transactions in parallel:
    //   charges  = money in (positive)
    //   refunds  = money returned (shown as positive amount, type = 'refund')
    const fetchCharges = stripe.balanceTransactions.list({
      type:    'charge',
      limit:   100,
      ...(Object.keys(createdFilter).length ? { created: createdFilter } : {}),
      expand:  ['data.source'],
    }).autoPagingToArray({ limit: MAX_TRANSACTIONS });

    const fetchRefunds = stripe.balanceTransactions.list({
      type:  'refund',
      limit: 100,
      ...(Object.keys(createdFilter).length ? { created: createdFilter } : {}),
    }).autoPagingToArray({ limit: MAX_TRANSACTIONS });

    const [charges, refunds] = await Promise.all([fetchCharges, fetchRefunds]);

    // ── Aggregate totals ──────────────────────────────────────────────────
    let grossRevenue  = 0; // sum of charge amounts (cents)
    let stripeFees    = 0; // sum of Stripe's own fees (cents)
    let refundedTotal = 0; // sum of refunded amounts (cents)

    for (const txn of charges) {
      grossRevenue += txn.amount;    // cents
      stripeFees   += txn.fee;       // cents (Stripe processing fee)
    }
    for (const txn of refunds) {
      refundedTotal += txn.amount;   // cents (positive value)
    }

    const netRevenue = grossRevenue - refundedTotal; // what actually stayed in your account

    // ── Monthly breakdown (last 12 calendar months) ───────────────────────
    const monthlyMap = {};
    for (let i = 11; i >= 0; i--) {
      const d   = startOfMonth(new Date());
      d.setMonth(d.getMonth() - i);
      const key = format(d, 'yyyy-MM');
      monthlyMap[key] = { month: key, gross: 0, refunded: 0, stripeFees: 0, count: 0 };
    }

    for (const txn of charges) {
      const key = format(new Date(txn.created * 1000), 'yyyy-MM');
      if (monthlyMap[key]) {
        monthlyMap[key].gross      += txn.amount;
        monthlyMap[key].stripeFees += txn.fee;
        monthlyMap[key].count      += 1;
      }
    }
    for (const txn of refunds) {
      const key = format(new Date(txn.created * 1000), 'yyyy-MM');
      if (monthlyMap[key]) {
        monthlyMap[key].refunded += txn.amount;
      }
    }

    // Convert cents → dollars in the final payload
    const toCurrency = (cents) => Math.round(cents) / 100;

    const byMonth = Object.values(monthlyMap).map((m) => ({
      month:      m.month,
      gross:      toCurrency(m.gross),
      refunded:   toCurrency(m.refunded),
      net:        toCurrency(m.gross - m.refunded),
      stripeFees: toCurrency(m.stripeFees),
      count:      m.count,
    }));

    const payload = {
      source:         'stripe_live',
      transactionCount: charges.length,
      refundCount:    refunds.length,
      grossRevenue:   toCurrency(grossRevenue),
      refundedTotal:  toCurrency(refundedTotal),
      stripeFees:     toCurrency(stripeFees),
      netRevenue:     toCurrency(netRevenue),
      byMonth,
    };

    // Cache for 1 hour — Stripe is rate-limited, and historical data doesn't change
    await setCache(cacheKey, payload, CACHE_TTL);

    res.setHeader('X-Cache', 'MISS');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
    return res.status(200).json(payload);

  } catch (error) {
    console.error('Stripe revenue report error:', error);

    // Surface Stripe-specific errors clearly
    if (error?.type?.startsWith('Stripe')) {
      return res.status(502).json({ error: 'Stripe API error', detail: error.message });
    }
    return res.status(500).json({ error: 'Failed to load Stripe revenue data' });
  }
}

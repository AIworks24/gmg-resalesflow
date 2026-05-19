import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../../lib/redis';

const ALLOWED_ROLES = ['admin', 'staff', 'accounting'];
const CACHE_TTL = 5 * 60; // 5 minutes

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function fetchWindowStats(supabase, start, end) {
  const { data, error } = await supabase
    .from('applications')
    .select('total_amount, payment_status')
    .is('deleted_at', null)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (error) throw error;

  let count   = data.length;
  let revenue = 0;
  for (const app of data) {
    if (app.payment_status === 'completed' && app.total_amount) {
      revenue += parseFloat(app.total_amount);
    }
  }
  return { count, revenue: Math.round(revenue * 100) / 100 };
}

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

    const cacheKey = `reports:comparison:${new Date().toISOString().slice(0, 13)}`; // hourly cache
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    const now = new Date();

    // ── Week windows ──────────────────────────────────────────────────────────
    const thisWeekStart  = startOfWeek(now);
    const thisWeekEnd    = endOfDay(now);

    const lastWeekStart  = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd    = new Date(thisWeekStart);
    lastWeekEnd.setMilliseconds(-1);

    // ── Month windows ─────────────────────────────────────────────────────────
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd   = endOfDay(now);

    const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd   = new Date(thisMonthStart);
    lastMonthEnd.setMilliseconds(-1);

    // Run all four queries in parallel
    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      fetchWindowStats(supabase, thisWeekStart,  thisWeekEnd),
      fetchWindowStats(supabase, lastWeekStart,  lastWeekEnd),
      fetchWindowStats(supabase, thisMonthStart, thisMonthEnd),
      fetchWindowStats(supabase, lastMonthStart, lastMonthEnd),
    ]);

    const formatMonthLabel = (d) =>
      d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const deltaCount   = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
    const deltaRevenue = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    const payload = {
      week: {
        label:        { current: 'This Week',  previous: 'Last Week' },
        current:      thisWeek,
        previous:     lastWeek,
        deltaCount:   deltaCount(thisWeek.count,   lastWeek.count),
        deltaRevenue: deltaRevenue(thisWeek.revenue, lastWeek.revenue),
      },
      month: {
        label:        { current: formatMonthLabel(now), previous: formatMonthLabel(lastMonthStart) },
        current:      thisMonth,
        previous:     lastMonth,
        deltaCount:   deltaCount(thisMonth.count,   lastMonth.count),
        deltaRevenue: deltaRevenue(thisMonth.revenue, lastMonth.revenue),
      },
    };

    await setCache(cacheKey, payload, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[reports/comparison] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

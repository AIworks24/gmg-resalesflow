import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../../lib/redis';

const ALLOWED_ROLES = ['admin', 'staff', 'accounting'];
const CACHE_TTL = 5 * 60; // 5 minutes

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

    const cacheKey = `reports:summary:${dateStart || 'all'}:${dateEnd || 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Fetch all non-deleted applications with property and profile data
    let query = supabase
      .from('applications')
      .select(`
        id,
        total_amount,
        payment_status,
        package_type,
        rush_fee,
        created_at,
        submitted_at,
        completed_at,
        user_id,
        hoa_property_id,
        hoa_properties(name)
      `)
      .is('deleted_at', null);

    if (dateStart) query = query.gte('created_at', dateStart);
    if (dateEnd)   query = query.lte('created_at', dateEnd);

    const { data: apps, error: appsError } = await query;
    if (appsError) throw appsError;

    // ── Totals ────────────────────────────────────────────────────────────────
    let totalRevenue = 0;
    for (const app of apps) {
      if (app.payment_status === 'completed' && app.total_amount) {
        totalRevenue += parseFloat(app.total_amount);
      }
    }
    const totals = {
      count:   apps.length,
      revenue: Math.round(totalRevenue * 100) / 100,
    };

    // ── By Month (last 12 calendar months) ───────────────────────────────────
    const monthlyMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = { month: key, count: 0, revenue: 0 };
    }

    for (const app of apps) {
      const d   = new Date(app.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyMap[key]) {
        monthlyMap[key].count += 1;
        if (app.payment_status === 'completed' && app.total_amount) {
          monthlyMap[key].revenue = Math.round((monthlyMap[key].revenue + parseFloat(app.total_amount)) * 100) / 100;
        }
      }
    }
    const byMonth = Object.values(monthlyMap);

    // ── By Property (top 10) ──────────────────────────────────────────────────
    const propertyMap = {};
    for (const app of apps) {
      const name = app.hoa_properties?.name || 'Unknown';
      if (!propertyMap[name]) {
        propertyMap[name] = { name, count: 0, revenue: 0 };
      }
      propertyMap[name].count += 1;
      if (app.payment_status === 'completed' && app.total_amount) {
        propertyMap[name].revenue = Math.round((propertyMap[name].revenue + parseFloat(app.total_amount)) * 100) / 100;
      }
    }
    const byProperty = Object.values(propertyMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Top Power Users (top 10 by Stripe spend) ─────────────────────────────
    // Fetch profiles for users who have completed-payment applications
    const paidApps = apps.filter((a) => a.payment_status === 'completed' && a.user_id);
    const userIds  = [...new Set(paidApps.map((a) => a.user_id))];

    let profileMap = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', userIds);

      for (const p of profiles || []) {
        profileMap[p.id] = p;
      }
    }

    const userSpendMap = {};
    for (const app of paidApps) {
      if (!app.user_id) continue;
      if (!userSpendMap[app.user_id]) {
        const p = profileMap[app.user_id] || {};
        userSpendMap[app.user_id] = {
          name:       [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || 'Unknown',
          email:      p.email || '',
          totalSpend: 0,
          count:      0,
        };
      }
      userSpendMap[app.user_id].totalSpend = Math.round((userSpendMap[app.user_id].totalSpend + parseFloat(app.total_amount || 0)) * 100) / 100;
      userSpendMap[app.user_id].count += 1;
    }

    const topPowerUsers = Object.values(userSpendMap)
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 10);

    // ── By Package (standard vs rush) ────────────────────────────────────────
    const packageMap = { standard: { type: 'standard', count: 0, rushFeeTotal: 0 }, rush: { type: 'rush', count: 0, rushFeeTotal: 0 } };
    for (const app of apps) {
      const type = app.package_type === 'rush' ? 'rush' : 'standard';
      packageMap[type].count += 1;
      if (type === 'rush' && app.rush_fee) {
        packageMap[type].rushFeeTotal = Math.round((packageMap[type].rushFeeTotal + parseFloat(app.rush_fee)) * 100) / 100;
      }
    }
    const byPackage = Object.values(packageMap);

    // ── Avg Turnaround (submitted_at → completed_at, completed apps only) ────
    const turnaroundMs = [];
    for (const app of apps) {
      if (app.submitted_at && app.completed_at) {
        const diff = new Date(app.completed_at) - new Date(app.submitted_at);
        if (diff > 0) turnaroundMs.push(diff);
      }
    }
    const avgTurnaroundDays = turnaroundMs.length > 0
      ? Math.round((turnaroundMs.reduce((a, b) => a + b, 0) / turnaroundMs.length) / (1000 * 60 * 60 * 24) * 10) / 10
      : null;

    const payload = { totals, byMonth, byProperty, topPowerUsers, byPackage, avgTurnaroundDays };

    await setCache(cacheKey, payload, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[reports/summary] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

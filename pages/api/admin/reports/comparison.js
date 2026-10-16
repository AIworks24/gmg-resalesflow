import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../../lib/redis';
import { applyPropertyScope, parsePropertyId, resolvePropertyScope } from '../../../../lib/reports/propertyFilter';
import { excludeDrafts, REPORT_SCOPE_VERSION } from '../../../../lib/reports/reportFilters';

const ALLOWED_ROLES = ['admin', 'staff', 'accounting'];
const CACHE_TTL = 5 * 60; // 5 minutes

const MAX_WINDOWS = 2;

/**
 * Parse the `windows` query param: a JSON array of { key, cs, ce, ps, pe } ISO timestamps
 * (current/previous start + end), built by lib/reports/comparisonWindows.js in the browser so
 * the periods match the KPI date range. Returns null when anything is malformed.
 */
function parseWindows(raw) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_WINDOWS) return null;

  const windows = [];
  for (const w of list) {
    if (!w || typeof w.key !== 'string') return null;
    const [cs, ce, ps, pe] = [w.cs, w.ce, w.ps, w.pe].map((v) => new Date(v));
    if ([cs, ce, ps, pe].some((d) => Number.isNaN(d.getTime()))) return null;
    if (cs > ce || ps > pe) return null;
    windows.push({ key: w.key, current: { start: cs, end: ce }, previous: { start: ps, end: pe } });
  }
  return windows;
}

async function fetchWindowStats(supabase, start, end, propertyScope = null) {
  let query = supabase
    .from('applications')
    .select('total_amount, payment_status')
    .is('deleted_at', null)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  query = excludeDrafts(query);
  query = applyPropertyScope(query, propertyScope);

  const { data, error } = await query;

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

    const propertyId = parsePropertyId(req.query.propertyId);
    const windowsParam = typeof req.query.windows === 'string' ? req.query.windows : '';
    const windows = parseWindows(windowsParam);
    if (!windows) {
      return res.status(400).json({ error: 'windows must be a JSON array of 1-2 { key, cs, ce, ps, pe } date ranges' });
    }

    const cacheKey = `reports:comparison:${REPORT_SCOPE_VERSION}:${windowsParam}:prop:${propertyId ?? 'all'}`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Resolve the property scope once — every window reuses it
    const propertyScope = await resolvePropertyScope(supabase, propertyId);

    const deltaCount   = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);
    const deltaRevenue = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

    // Current + previous stats for every window, all in parallel
    const comparisons = await Promise.all(windows.map(async (w) => {
      const [current, previous] = await Promise.all([
        fetchWindowStats(supabase, w.current.start,  w.current.end,  propertyScope),
        fetchWindowStats(supabase, w.previous.start, w.previous.end, propertyScope),
      ]);
      return {
        key:          w.key,
        current,
        previous,
        deltaCount:   deltaCount(current.count, previous.count),
        deltaRevenue: deltaRevenue(current.revenue, previous.revenue),
      };
    }));

    const payload = { comparisons };

    await setCache(cacheKey, payload, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[reports/comparison] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

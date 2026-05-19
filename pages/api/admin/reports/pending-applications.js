import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getCache, setCache } from '../../../../lib/redis';

const ALLOWED_ROLES = ['admin', 'staff', 'accounting'];
const CACHE_TTL = 2 * 60; // 2 minutes — short TTL since this is an action list

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

    const cacheKey = `reports:pending-applications`;
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // Applications where Stripe payment is confirmed but the form was never submitted
    const { data: apps, error: appsError } = await supabase
      .from('applications')
      .select(`
        id,
        created_at,
        total_amount,
        payment_status,
        package_type,
        stripe_payment_intent_id,
        stripe_session_id,
        property_address,
        unit_number,
        submitter_name,
        submitter_email,
        user_id,
        hoa_properties(name)
      `)
      .eq('payment_status', 'completed')
      .is('submitted_at', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (appsError) throw appsError;

    const payload = {
      count: apps.length,
      applications: apps.map((a) => ({
        id: a.id,
        created_at: a.created_at,
        total_amount: a.total_amount,
        payment_status: a.payment_status,
        package_type: a.package_type,
        stripe_payment_intent_id: a.stripe_payment_intent_id,
        stripe_session_id: a.stripe_session_id,
        property_address: a.property_address,
        unit_number: a.unit_number,
        submitter_name: a.submitter_name,
        submitter_email: a.submitter_email,
        property_name: a.hoa_properties?.name || null,
      })),
    };

    await setCache(cacheKey, payload, CACHE_TTL);
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);

  } catch (err) {
    console.error('[reports/pending-applications] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

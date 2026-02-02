/**
 * GET /api/my-applications
 * Returns applications for the "acting" user (supports impersonation via X-Impersonate-User-ID).
 * Used by applicant portal; when impersonating, returns target user's applications.
 */

import { resolveActingUser } from '../../lib/impersonation';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const identity = await resolveActingUser(req, res);

    if (!identity.authenticated || !identity.actingUserId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from('applications')
      .select('*, hoa_properties(name, is_multi_community), application_property_groups(*)')
      .eq('user_id', identity.actingUserId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[my-applications]', error);
      return res.status(500).json({ error: error.message });
    }

    let applications = data || [];

    for (const app of applications) {
      if (
        app.hoa_properties?.is_multi_community &&
        (!app.application_property_groups || app.application_property_groups.length === 0) &&
        app.hoa_property_id
      ) {
        try {
          const { data: linkedProps } = await supabase.rpc('get_linked_properties', {
            property_id: app.hoa_property_id,
          });
          app._linked_properties_count = 1 + (linkedProps?.length || 0);
        } catch {
          app._linked_properties_count = 1;
        }
      }
    }

    return res.status(200).json(applications);
  } catch (err) {
    console.error('[my-applications]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

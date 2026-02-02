/**
 * POST /api/admin/impersonation-start
 * Called when admin clicks "Impersonate" on a requester. Validates and logs to audit.
 */

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { logImpersonationStart } from '../../../lib/auditLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: adminProfile } = await serviceSupabase
      .from('profiles')
      .select('role, email')
      .eq('id', session.user.id)
      .single();

    if (!adminProfile || adminProfile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { targetUserId } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId required' });
    }

    const { data: targetProfile } = await serviceSupabase
      .from('profiles')
      .select('id, email, role')
      .eq('id', targetUserId)
      .single();

    if (!targetProfile) {
      return res.status(404).json({ error: 'User not found' });
    }

    const allowedRoles = ['requester', null];
    if (!allowedRoles.includes(targetProfile.role ?? null)) {
      return res.status(403).json({ error: 'Can only impersonate requester users' });
    }

    await logImpersonationStart({
      adminUserId: session.user.id,
      targetUserId: targetProfile.id,
      adminEmail: adminProfile.email,
      targetEmail: targetProfile.email,
      req,
    });

    return res.status(200).json({
      success: true,
      targetUser: {
        id: targetProfile.id,
        email: targetProfile.email,
      },
    });
  } catch (err) {
    console.error('[impersonation-start]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

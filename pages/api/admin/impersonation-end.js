/**
 * POST /api/admin/impersonation-end
 * Called when admin clicks "Exit impersonation". Logs to audit.
 */

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { logImpersonationEnd } from '../../../lib/auditLog';

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { targetUserId, durationSeconds } = req.body || {};
    if (!targetUserId) {
      return res.status(400).json({ error: 'targetUserId required' });
    }

    await logImpersonationEnd({
      adminUserId: session.user.id,
      targetUserId,
      durationSeconds: durationSeconds ?? 0,
      req,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[impersonation-end]', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

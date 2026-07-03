import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = ['admin'];

/**
 * Admin-only: re-queue a failed / dead-lettered processing job. Resets the job to pending
 * (fresh attempts + immediate next_run_at), flips its failed steps back to pending (leaving
 * succeeded steps untouched, since each step is idempotent), then best-effort kicks the
 * worker so it runs immediately.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authClient = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing job id' });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: job, error: jobErr } = await supabase
      .from('application_jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (jobErr || !job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const { error: updateErr } = await supabase
      .from('application_jobs')
      .update({
        status: 'pending',
        attempts: 0,
        next_run_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateErr) throw updateErr;

    // Reset only the non-succeeded steps so idempotent already-done work isn't repeated.
    await supabase
      .from('application_job_steps')
      .update({ status: 'pending', error: null, updated_at: new Date().toISOString() })
      .eq('job_id', id)
      .neq('status', 'succeeded');

    // Best-effort immediate kick.
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
      const secret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET;
      if (secret) {
        fetch(`${baseUrl}/api/jobs/run`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
              'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            }),
          },
        }).catch(() => {});
      }
    } catch (_) { /* ignore */ }

    return res.status(200).json({ success: true, jobId: id });
  } catch (err) {
    console.error('[admin/jobs/retry] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

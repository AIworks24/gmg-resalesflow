import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

const ALLOWED_ROLES = ['admin'];

/**
 * Admin-only "Processing Jobs" report. Surfaces the durable application_jobs queue + its
 * per-step tracking so staff can see, per application, whether every post-payment process
 * (receipt, forms, notifications, auto-submit, document delivery) succeeded, is pending,
 * or failed — and retry dead-lettered jobs.
 *
 * Auth: the caller's admin role is verified with the user-scoped Supabase client; the job
 * tables are RLS-locked, so the actual reads use a service-role client.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { status, applicationId, dateStart, dateEnd } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    let jobQuery = supabase
      .from('application_jobs')
      .select('id, application_id, job_type, status, idempotency_key, attempts, max_attempts, next_run_at, last_error, created_at, updated_at, completed_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status) jobQuery = jobQuery.eq('status', status);
    if (applicationId) jobQuery = jobQuery.eq('application_id', parseInt(applicationId, 10));
    if (dateStart) jobQuery = jobQuery.gte('created_at', dateStart);
    if (dateEnd) jobQuery = jobQuery.lte('created_at', dateEnd);

    const { data: jobs, error: jobsError } = await jobQuery;
    if (jobsError) throw jobsError;

    const jobIds = (jobs || []).map((j) => j.id);
    const appIds = [...new Set((jobs || []).map((j) => j.application_id))];

    // Steps for these jobs
    let stepsByJob = {};
    if (jobIds.length > 0) {
      const { data: steps } = await supabase
        .from('application_job_steps')
        .select('id, job_id, step_key, step_order, status, attempts, error, started_at, completed_at')
        .in('job_id', jobIds)
        .order('step_order', { ascending: true });
      for (const s of steps || []) {
        (stepsByJob[s.job_id] ||= []).push(s);
      }
    }

    // Lightweight application context
    let appsById = {};
    if (appIds.length > 0) {
      const { data: apps } = await supabase
        .from('applications')
        .select('id, application_type, status, submitter_email, property_address')
        .in('id', appIds);
      for (const a of apps || []) appsById[a.id] = a;
    }

    const enriched = (jobs || []).map((j) => ({
      ...j,
      application: appsById[j.application_id] || null,
      steps: stepsByJob[j.id] || [],
    }));

    // Status counts across the whole table (not just this page) for the tab badge.
    const { data: allStatuses } = await supabase
      .from('application_jobs')
      .select('status');
    const summary = { pending: 0, processing: 0, succeeded: 0, failed: 0, dead_letter: 0 };
    for (const row of allStatuses || []) {
      if (summary[row.status] != null) summary[row.status] += 1;
    }

    return res.status(200).json({ jobs: enriched, summary });
  } catch (err) {
    console.error('[reports/jobs] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

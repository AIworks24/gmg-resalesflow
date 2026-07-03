/**
 * Application processing job worker.
 *
 * Drains the application_jobs queue. Invoked two ways:
 *   1. Immediate self-kick (fire-and-forget POST) from the Stripe webhook / free-submission
 *      endpoint → near-instant processing.
 *   2. Vercel Cron (GET, every minute) → safety net + retry/backoff driver.
 *
 * Atomicity: jobs are claimed via the claim_application_jobs() RPC (UPDATE ... FOR UPDATE
 * SKIP LOCKED), so concurrent invocations never double-process a job. Each step is
 * idempotent and independently tracked; a failing step is retried with exponential backoff
 * up to MAX_ATTEMPTS, then dead-lettered.
 */

import { createClient } from '@supabase/supabase-js';
import { STEP_HANDLERS, nextRunAt, MAX_ATTEMPTS } from '../../../lib/processing/pipeline';

export const config = {
  // Matches the old inline webhook budget — multi-community document generation
  // (per-property PDFs) can legitimately take minutes. Concurrent cron/self-kick
  // invocations are safe: claim_application_jobs uses FOR UPDATE SKIP LOCKED.
  maxDuration: 300,
};

const BATCH_SIZE = 5;
const TIME_BUDGET_MS = 280_000; // leave headroom under maxDuration

const APP_FIELDS =
  'id, application_type, submitter_email, submitter_name, property_address, package_type, ' +
  'total_amount, status, submitted_at, receipt_sent_at, property_owner_notified_at, ' +
  'email_completed_at, impersonation_metadata, stripe_session_id, stripe_payment_intent_id';

function authorized(req) {
  const authHeader = req.headers['authorization'] || '';
  const cronSecret = process.env.CRON_SECRET;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (internalSecret && authHeader === `Bearer ${internalSecret}`) return true;
  return false;
}

async function markStep(supabase, stepId, patch) {
  await supabase
    .from('application_job_steps')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', stepId);
}

async function processJob(supabase, job) {
  // Fresh application snapshot for this run — step guards read from it.
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select(APP_FIELDS)
    .eq('id', job.application_id)
    .single();

  if (appErr || !app) {
    await supabase
      .from('application_jobs')
      .update({
        status: 'dead_letter',
        last_error: `Application ${job.application_id} not found: ${appErr?.message || 'missing'}`,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    return { jobId: job.id, outcome: 'dead_letter_no_app' };
  }

  const { data: steps } = await supabase
    .from('application_job_steps')
    .select('*')
    .eq('job_id', job.id)
    .order('step_order', { ascending: true });

  for (const step of steps || []) {
    if (step.status === 'succeeded' || step.status === 'skipped') continue;

    const handler = STEP_HANDLERS[step.step_key];
    if (!handler) {
      await markStep(supabase, step.id, { status: 'failed', error: `No handler for step "${step.step_key}"` });
      await failJob(supabase, job, `No handler for step "${step.step_key}"`);
      return { jobId: job.id, outcome: 'failed_no_handler' };
    }

    await markStep(supabase, step.id, {
      status: 'pending',
      attempts: step.attempts + 1,
      started_at: step.started_at || new Date().toISOString(),
      error: null,
    });

    try {
      const output = await handler({ app, supabase, payload: job.payload || {} });
      await markStep(supabase, step.id, {
        status: 'succeeded',
        output: output || {},
        completed_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err?.message || String(err);
      await markStep(supabase, step.id, { status: 'failed', error: message });
      await failJob(supabase, job, `Step "${step.step_key}": ${message}`);
      return { jobId: job.id, outcome: 'step_failed', step: step.step_key };
    }
  }

  await supabase
    .from('application_jobs')
    .update({
      status: 'succeeded',
      last_error: null,
      locked_at: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  return { jobId: job.id, outcome: 'succeeded' };
}

// Decide retry vs dead-letter. `job.attempts` already includes the current attempt
// (incremented by claim_application_jobs on claim).
async function failJob(supabase, job, lastError) {
  const deadLetter = job.attempts >= MAX_ATTEMPTS;
  await supabase
    .from('application_jobs')
    .update({
      status: deadLetter ? 'dead_letter' : 'pending',
      last_error: lastError,
      next_run_at: deadLetter ? job.next_run_at : nextRunAt(job.attempts),
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_API_SECRET) {
    return res.status(500).json({ error: 'Worker secrets not configured' });
  }
  if (!authorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const workerId = `worker-${Math.random().toString(36).slice(2, 10)}`;
  const started = Date.now();
  const results = [];

  try {
    while (Date.now() - started < TIME_BUDGET_MS) {
      const { data: jobs, error: claimErr } = await supabase.rpc('claim_application_jobs', {
        p_worker_id: workerId,
        p_batch_size: BATCH_SIZE,
      });

      if (claimErr) {
        console.error('[JobWorker] claim error:', claimErr.message);
        return res.status(500).json({ error: 'claim failed', detail: claimErr.message });
      }
      if (!jobs || jobs.length === 0) break;

      for (const job of jobs) {
        try {
          results.push(await processJob(supabase, job));
        } catch (err) {
          console.error(`[JobWorker] Unexpected error processing job ${job.id}:`, err);
          await failJob(supabase, job, `Unexpected: ${err?.message || err}`);
          results.push({ jobId: job.id, outcome: 'unexpected_error' });
        }
        if (Date.now() - started >= TIME_BUDGET_MS) break;
      }
    }

    return res.status(200).json({ worker: workerId, processed: results.length, results });
  } catch (err) {
    console.error('[JobWorker] Fatal error:', err);
    return res.status(500).json({ error: 'Worker failed', detail: err?.message });
  }
}

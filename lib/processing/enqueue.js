/**
 * Transactional-outbox enqueue helper.
 *
 * Called from the thin Stripe webhook (and the free-submission endpoint) to durably
 * enqueue one processing job per payment event. The job's idempotency_key (Stripe event
 * id, or a deterministic key for free submissions) makes enqueue safe under Stripe
 * webhook redeliveries: a duplicate insert is ignored and the existing job is returned.
 */

import { resolvePipeline } from './pipeline';

/**
 * Idempotently create an application_jobs row and seed its step rows.
 * @returns {Promise<{ job: object|null, created: boolean }>}
 */
export async function enqueueJob({
  supabase,
  applicationId,
  idempotencyKey,
  jobType = 'process_payment',
  payload = {},
  applicationType,
  isMultiCommunity = false,
  isFree = false,
}) {
  // Insert the job, ignoring duplicates on idempotency_key.
  const { data: inserted, error: insertErr } = await supabase
    .from('application_jobs')
    .upsert(
      {
        application_id: applicationId,
        job_type: jobType,
        idempotency_key: idempotencyKey,
        payload,
        status: 'pending',
        next_run_at: new Date().toISOString(),
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true }
    )
    .select('*')
    .maybeSingle();

  if (insertErr) {
    throw new Error(`enqueueJob: failed to insert job (${idempotencyKey}): ${insertErr.message}`);
  }

  // ignoreDuplicates → no row returned means the job already existed. That's fine.
  if (!inserted) {
    const { data: existing } = await supabase
      .from('application_jobs')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    return { job: existing || null, created: false };
  }

  // Seed step rows from the pipeline.
  const steps = resolvePipeline({ applicationType, isMultiCommunity, isFree });
  const stepRows = steps.map((step_key, idx) => ({
    job_id: inserted.id,
    application_id: applicationId,
    step_key,
    step_order: idx,
    status: 'pending',
  }));

  if (stepRows.length > 0) {
    const { error: stepErr } = await supabase
      .from('application_job_steps')
      .upsert(stepRows, { onConflict: 'job_id,step_key', ignoreDuplicates: true });
    if (stepErr) {
      throw new Error(`enqueueJob: failed to seed steps for job ${inserted.id}: ${stepErr.message}`);
    }
  }

  return { job: inserted, created: true };
}

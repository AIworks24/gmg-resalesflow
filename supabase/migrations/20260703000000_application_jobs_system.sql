-- Atomic application processing system: durable job queue + per-step tracking.
--
-- Replaces the fragile inline post-payment processing in the Stripe webhook with a
-- transactional-outbox job queue. The Stripe webhook enqueues one job per payment
-- event (idempotency_key = Stripe event id); a worker (/api/jobs/run, driven by an
-- immediate self-kick + a per-minute Vercel Cron) claims jobs with FOR UPDATE SKIP
-- LOCKED and runs ordered, idempotent step handlers, retrying with exponential
-- backoff and dead-lettering after max_attempts.

-- ── applications: exactly-once receipt guard ────────────────────────────────
-- (email_completed_at and property_owner_notified_at already exist and guard the
--  document-delivery and notification steps respectively.)
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;

-- ── application_jobs: the outbox / queue ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.application_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   integer NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  job_type         text NOT NULL DEFAULT 'process_payment',
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','succeeded','failed','dead_letter')),
  idempotency_key  text NOT NULL UNIQUE,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts         integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 5,
  next_run_at      timestamptz NOT NULL DEFAULT now(),
  locked_at        timestamptz,
  locked_by        text,
  last_error       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_application_jobs_claim
  ON public.application_jobs (status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_application_jobs_application_id
  ON public.application_jobs (application_id);
CREATE INDEX IF NOT EXISTS idx_application_jobs_created_at
  ON public.application_jobs (created_at DESC);

-- ── application_job_steps: granular per-step tracking ───────────────────────
CREATE TABLE IF NOT EXISTS public.application_job_steps (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES public.application_jobs(id) ON DELETE CASCADE,
  application_id integer NOT NULL,
  step_key       text NOT NULL,
  step_order     integer NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','succeeded','failed','skipped')),
  attempts       integer NOT NULL DEFAULT 0,
  error          text,
  output         jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_application_job_steps_job_id
  ON public.application_job_steps (job_id);
CREATE INDEX IF NOT EXISTS idx_application_job_steps_application_id
  ON public.application_job_steps (application_id);

-- ── RLS: locked down. Only the service role (which bypasses RLS) touches these.
-- Reports reads go through an admin API route that uses the service-role client and
-- enforces the admin role itself. No anon/authenticated policies = deny by default.
ALTER TABLE public.application_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_job_steps ENABLE ROW LEVEL SECURITY;

-- ── claim_application_jobs: atomic batch claim with stale-lock reclaim ───────
-- Claims up to p_batch_size runnable jobs: pending & due, OR processing but whose
-- lock has gone stale (worker crashed). Increments attempts on claim so each
-- execution counts as an attempt. FOR UPDATE SKIP LOCKED lets multiple worker
-- invocations run concurrently without double-processing a job.
CREATE OR REPLACE FUNCTION public.claim_application_jobs(
  p_worker_id   text,
  p_batch_size  integer DEFAULT 10
)
RETURNS SETOF public.application_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.application_jobs j
  SET status    = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      attempts  = j.attempts + 1,
      updated_at = now()
  WHERE j.id IN (
    SELECT c.id
    FROM public.application_jobs c
    WHERE (
      (c.status = 'pending' AND c.next_run_at <= now())
      OR (c.status = 'processing' AND c.locked_at < now() - interval '5 minutes')
    )
    ORDER BY c.next_run_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_application_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_application_jobs(text, integer) TO service_role;

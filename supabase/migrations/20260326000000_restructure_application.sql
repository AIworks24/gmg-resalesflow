-- Migration: restructure_application
-- Adds columns needed for the "Restructure Application" feature:
--   - processing_locked: locks application tasks while a correction payment is pending
--   - correction_stripe_session_id: tracks the Stripe session for a correction payment (separate from original)
--   - rush_upgraded_at: records when an admin upgraded the package from standard to rush

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS processing_locked         BOOLEAN        DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS processing_locked_at      TIMESTAMPTZ    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS processing_locked_reason  TEXT           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS rush_upgraded_at          TIMESTAMPTZ    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS correction_stripe_session_id VARCHAR(255) DEFAULT NULL;

-- Index for fast webhook lookup by correction session id
CREATE INDEX IF NOT EXISTS idx_applications_correction_stripe_session_id
  ON public.applications (correction_stripe_session_id)
  WHERE correction_stripe_session_id IS NOT NULL;

COMMENT ON COLUMN public.applications.processing_locked IS
  'When true, staff cannot process tasks on this application. Set when a correction payment (property change or rush upgrade) is pending. Cleared by webhook on successful payment.';

COMMENT ON COLUMN public.applications.processing_locked_at IS
  'Timestamp when processing_locked was set to true.';

COMMENT ON COLUMN public.applications.processing_locked_reason IS
  'Human-readable reason for the lock, e.g. ''pending_property_correction_payment'' or ''pending_rush_upgrade_payment''.';

COMMENT ON COLUMN public.applications.rush_upgraded_at IS
  'Timestamp when the application package was upgraded from standard to rush by an admin.';

COMMENT ON COLUMN public.applications.correction_stripe_session_id IS
  'Stripe checkout session ID for a correction payment (additional property or rush upgrade). Separate from the original stripe_session_id. Used by the webhook to route correction payment events correctly.';

-- Migration: Per-user Builder pricing (multi-requester edition)
-- One offer covers a group of users via builder_pricing_offer_users junction table.
-- Precedence: per-user offer > property-wide Builder Force Price > catalog pricing.

-- =====================================================
-- TABLE: builder_user_property_pricing (the "offer")
-- =====================================================
CREATE TABLE IF NOT EXISTS public.builder_user_property_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which property this deal applies to
  hoa_property_id INTEGER NOT NULL REFERENCES public.hoa_properties(id) ON DELETE CASCADE,

  -- Price: absolute dollars for the base processing line (before rush add-ons)
  override_price NUMERIC(10, 2) NOT NULL
    CHECK (override_price >= 0 AND override_price <= 50000),

  -- Validity window (NULL = no bound in that direction)
  valid_from  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ DEFAULT NULL,

  CONSTRAINT bupp_valid_dates CHECK (valid_until IS NULL OR valid_until > valid_from),

  -- Toggle without deleting the row
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Optional one-line message shown to the applicant (separate from internal notes)
  applicant_message TEXT DEFAULT NULL,

  -- Internal ops
  notes       TEXT DEFAULT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast look-ups
CREATE INDEX IF NOT EXISTS idx_bupp_property ON public.builder_user_property_pricing (hoa_property_id);
CREATE INDEX IF NOT EXISTS idx_bupp_active    ON public.builder_user_property_pricing (active) WHERE active = TRUE;

COMMENT ON TABLE  public.builder_user_property_pricing IS 'Per-user Builder price override for a specific HOA property. Replaces property-wide Builder Force Price for all listed users while valid.';
COMMENT ON COLUMN public.builder_user_property_pricing.override_price    IS 'Base processing price in dollars (before rush add-ons), overriding both catalog and property force price.';
COMMENT ON COLUMN public.builder_user_property_pricing.valid_until        IS 'NULL means the deal never expires; set by admin to bound usage.';
COMMENT ON COLUMN public.builder_user_property_pricing.active             IS 'Set to FALSE to instantly revoke without deleting the row.';
COMMENT ON COLUMN public.builder_user_property_pricing.applicant_message  IS 'Optional one-liner shown to the applicant (e.g. "Promotional rate — valid through Q2").';

-- =====================================================
-- TABLE: builder_pricing_offer_users (junction)
-- Created before RLS policies on builder_user_property_pricing
-- because those policies reference this table.
-- Maps one offer to the set of users who benefit from it.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.builder_pricing_offer_users (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id  UUID NOT NULL REFERENCES public.builder_user_property_pricing(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A user appears at most once on a given offer
CREATE UNIQUE INDEX IF NOT EXISTS idx_bpou_offer_user ON public.builder_pricing_offer_users (offer_id, user_id);

-- Fast lookup: given userId, find all offer memberships (used at checkout / preview)
CREATE INDEX IF NOT EXISTS idx_bpou_user  ON public.builder_pricing_offer_users (user_id);
-- Fast lookup: list all members of an offer (used by admin UI)
CREATE INDEX IF NOT EXISTS idx_bpou_offer ON public.builder_pricing_offer_users (offer_id);

COMMENT ON TABLE  public.builder_pricing_offer_users IS 'Junction table mapping builder pricing offers to the specific users who benefit from them.';

-- =====================================================
-- RLS: builder_pricing_offer_users
-- =====================================================
ALTER TABLE public.builder_pricing_offer_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own offer memberships" ON public.builder_pricing_offer_users;
CREATE POLICY "Users can view their own offer memberships"
ON public.builder_pricing_offer_users
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins and accounting can manage offer memberships" ON public.builder_pricing_offer_users;
CREATE POLICY "Admins and accounting can manage offer memberships"
ON public.builder_pricing_offer_users
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'accounting')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'accounting')
  )
);

DROP POLICY IF EXISTS "Staff can view offer memberships" ON public.builder_pricing_offer_users;
CREATE POLICY "Staff can view offer memberships"
ON public.builder_pricing_offer_users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

DROP POLICY IF EXISTS "Service role can manage offer memberships" ON public.builder_pricing_offer_users;
CREATE POLICY "Service role can manage offer memberships"
ON public.builder_pricing_offer_users
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- =====================================================
-- RLS: builder_user_property_pricing
-- (defined after builder_pricing_offer_users exists)
-- =====================================================
ALTER TABLE public.builder_user_property_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own builder pricing offers" ON public.builder_user_property_pricing;
CREATE POLICY "Users can view their own builder pricing offers"
ON public.builder_user_property_pricing
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.builder_pricing_offer_users
    WHERE offer_id = builder_user_property_pricing.id
      AND user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins and accounting can manage builder pricing offers" ON public.builder_user_property_pricing;
CREATE POLICY "Admins and accounting can manage builder pricing offers"
ON public.builder_user_property_pricing
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'accounting')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'accounting')
  )
);

DROP POLICY IF EXISTS "Staff can view all builder pricing offers" ON public.builder_user_property_pricing;
CREATE POLICY "Staff can view all builder pricing offers"
ON public.builder_user_property_pricing
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'staff'
  )
);

DROP POLICY IF EXISTS "Service role can manage builder pricing offers" ON public.builder_user_property_pricing;
CREATE POLICY "Service role can manage builder pricing offers"
ON public.builder_user_property_pricing
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);


-- =====================================================
-- TABLE: builder_pricing_redemptions (audit log)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.builder_pricing_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which offer was used
  pricing_id UUID NOT NULL REFERENCES public.builder_user_property_pricing(id) ON DELETE RESTRICT,

  -- Context
  application_id   INTEGER NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hoa_property_id  INTEGER REFERENCES public.hoa_properties(id) ON DELETE SET NULL,

  -- Payment snapshot
  stripe_checkout_session_id VARCHAR(255) NOT NULL,
  amount_paid      NUMERIC(10, 2) NOT NULL,
  override_price_snapshot NUMERIC(10, 2) NOT NULL,

  -- Optional extra context
  metadata JSONB DEFAULT '{}'::jsonb,

  paid_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: one row per Stripe checkout session
CREATE UNIQUE INDEX IF NOT EXISTS idx_bpr_session    ON public.builder_pricing_redemptions (stripe_checkout_session_id);

-- Admin look-ups
CREATE INDEX IF NOT EXISTS idx_bpr_pricing_id ON public.builder_pricing_redemptions (pricing_id);
CREATE INDEX IF NOT EXISTS idx_bpr_user_id    ON public.builder_pricing_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_bpr_paid_at    ON public.builder_pricing_redemptions (paid_at DESC);

COMMENT ON TABLE  public.builder_pricing_redemptions IS 'Audit log of every completed Stripe checkout that used a per-user Builder price. Not used for capping—only for visibility and support.';
COMMENT ON COLUMN public.builder_pricing_redemptions.stripe_checkout_session_id IS 'Unique per Stripe session; prevents double-counting on webhook retries.';
COMMENT ON COLUMN public.builder_pricing_redemptions.amount_paid               IS 'Total amount actually charged (snapshot at payment time).';
COMMENT ON COLUMN public.builder_pricing_redemptions.override_price_snapshot   IS 'Base override price at time of payment (in case the offer row is later edited).';

-- =====================================================
-- RLS: builder_pricing_redemptions
-- =====================================================
ALTER TABLE public.builder_pricing_redemptions ENABLE ROW LEVEL SECURITY;

-- Applicants can see their own redemption history
DROP POLICY IF EXISTS "Users can view their own builder pricing redemptions" ON public.builder_pricing_redemptions;
CREATE POLICY "Users can view their own builder pricing redemptions"
ON public.builder_pricing_redemptions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Admin / staff / accounting can view all
DROP POLICY IF EXISTS "Admins and staff can view all builder pricing redemptions" ON public.builder_pricing_redemptions;
CREATE POLICY "Admins and staff can view all builder pricing redemptions"
ON public.builder_pricing_redemptions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role IN ('admin', 'staff', 'accounting')
  )
);

-- Service role inserts from webhooks; no user-side insert
DROP POLICY IF EXISTS "Service role can insert builder pricing redemptions" ON public.builder_pricing_redemptions;
CREATE POLICY "Service role can insert builder pricing redemptions"
ON public.builder_pricing_redemptions
FOR INSERT
TO service_role
WITH CHECK (true);

-- Immutable audit trail: no UPDATE or DELETE for non-service roles

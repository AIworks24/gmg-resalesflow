-- Records what Stripe actually charged, so receipts and refunds stop deriving the
-- customer-facing total from applications.total_amount.
--
-- total_amount cannot serve that purpose: for multi_community applications it
-- deliberately holds refundable service fees only (base + rush), while checkout adds a
-- $9.95 credit-card processing fee line item PER association. Receipts read total_amount,
-- so every MC receipt understated the charge by $9.95 x N while the Stripe line items
-- printed right below it listed each fee -- the receipt visibly failed to add up.
--
-- This column is additive and nullable. Existing rows stay NULL and every reader falls
-- back to its previous behaviour; new payments get the authoritative figure from the
-- Stripe webhook. total_amount keeps its current meaning so refund math, MC pricing, and
-- revenue reports are unaffected.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS stripe_amount_total numeric(10,2);

COMMENT ON COLUMN public.applications.stripe_amount_total IS
  'Actual amount charged by Stripe in dollars (base + rush + per-property CC fees, net of promo codes). Authoritative for receipts and refunds. Distinct from total_amount, which for multi_community holds refundable service fees only.';

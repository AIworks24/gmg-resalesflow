-- Fix broken RLS policy on builder_user_property_pricing.
--
-- Root cause: the original migration wrote `bpou.offer_id = id` inside a
-- subquery with `FROM public.builder_pricing_offer_users bpou`.  PostgreSQL
-- resolved the unqualified `id` as `bpou.id` (the nearest in-scope column
-- from the subquery alias), NOT as `builder_user_property_pricing.id` (the
-- outer table being protected).  The result was a perpetual self-comparison
-- (bpou.offer_id = bpou.id) that is always false, so regular authenticated
-- users could never see their own pricing offers.
--
-- Fix: fully-qualify the outer-table reference as `builder_user_property_pricing.id`.

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

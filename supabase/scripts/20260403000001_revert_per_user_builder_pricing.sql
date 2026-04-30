-- Revert: Per-user Builder pricing
-- Drops all tables created by 20260403000000_add_per_user_builder_pricing.sql
-- in reverse dependency order. CASCADE removes indexes and RLS policies automatically.

DROP TABLE IF EXISTS public.builder_pricing_redemptions CASCADE;
DROP TABLE IF EXISTS public.builder_pricing_offer_users CASCADE;
DROP TABLE IF EXISTS public.builder_user_property_pricing CASCADE;

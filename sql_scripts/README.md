# Database Migration Scripts

This directory contains SQL migration scripts for the GMG ResaleFlow application.

## Running Migrations

### Prerequisites
- Access to your Supabase database
- Either the Supabase CLI or direct database access via the Supabase dashboard

### Method 1: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy and paste the migration script content
4. Execute the script

### Method 2: Using Supabase CLI
```bash
# If you have the Supabase CLI installed
supabase db push --include-all

# Or run individual migration files
psql -h your-db-host -U your-username -d your-database -f migration_001_add_payment_columns.sql
```

## Migration Files

### migration_001_add_payment_columns.sql
**Purpose**: Adds missing payment-related columns to the applications table

**Changes**:
- Adds `payment_status` column with CHECK constraint
- Adds `stripe_session_id` column for Stripe Checkout sessions
- Adds `stripe_payment_intent_id` column for Payment Intents
- Adds payment timestamp columns (`payment_completed_at`, `payment_failed_at`, `payment_canceled_at`)
- Adds `payment_failure_reason` column for debugging
- Creates indexes for better query performance
- Updates existing records to have consistent payment status

**Required**: Yes - This fixes the "Could not find the 'payment_status' column" error

## Current Error Fix

The migration script `migration_001_add_payment_columns.sql` specifically addresses this error:
```
Error updating application with session ID: {
  code: 'PGRST204',
  details: null,
  hint: null,
  message: "Could not find the 'payment_status' column of 'applications' in the schema cache"
}
```

After running this migration, the Stripe webhook and checkout session creation will work properly.

## Verification

After running the migration, verify the columns were added:

```sql
-- Check if columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'applications' 
AND column_name IN ('payment_status', 'stripe_session_id', 'stripe_payment_intent_id');

-- Check the constraint
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%payment_status%';
```

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- Remove the added columns (be careful with this in production!)
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_status;
ALTER TABLE public.applications DROP COLUMN IF EXISTS stripe_session_id;
ALTER TABLE public.applications DROP COLUMN IF EXISTS stripe_payment_intent_id;
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_completed_at;
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_failed_at;
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_canceled_at;
ALTER TABLE public.applications DROP COLUMN IF EXISTS payment_failure_reason;

-- Drop the indexes
DROP INDEX IF EXISTS idx_applications_payment_status;
DROP INDEX IF EXISTS idx_applications_stripe_session_id;
DROP INDEX IF EXISTS idx_applications_stripe_payment_intent_id;
``` 
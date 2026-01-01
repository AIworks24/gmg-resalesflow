# Supabase Migration Management

## ✅ Setup Complete

Your Supabase migrations are now properly configured with version control and rollback support.

## 📁 Current State

```
supabase/migrations/
├── 20251109044515_remote_baseline.sql  (historical)
└── 20260101155726_remote_schema.sql     (current baseline - 81KB)
```

---

## 🚀 Creating New Migrations

### 1. Create a New Migration

```bash
supabase migration new <migration_name>
```

**Example:**
```bash
supabase migration new add_ai_processing_jobs_table
```

This creates: `supabase/migrations/20260101160000_add_ai_processing_jobs_table.sql`

### 2. Write Your Migration SQL

Edit the generated file and add your SQL changes:

```sql
-- supabase/migrations/20260101160000_add_ai_processing_jobs_table.sql

-- Add the new table
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(user_id),
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  input_data JSONB,
  results JSONB,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_jobs_user_status ON ai_processing_jobs(user_id, status);
CREATE INDEX idx_jobs_created ON ai_processing_jobs(created_at DESC);

-- Add RLS policies
ALTER TABLE ai_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jobs" 
  ON ai_processing_jobs FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs" 
  ON ai_processing_jobs FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
```

### 3. Test Migration Locally (Optional - requires local Supabase)

```bash
supabase start  # Start local Supabase
supabase db reset  # Apply all migrations from scratch
```

### 4. Apply Migration to Remote Database

```bash
supabase db push
```

This will:
- ✅ Apply the migration to your remote Supabase database
- ✅ Update the migration history
- ✅ Version control the change

---

## ⏮️ Rolling Back Migrations

### Check Migration Status

```bash
supabase migration list
```

Output:
```
 Local          | Remote         | Time (UTC)          
----------------|----------------|---------------------
 20260101155726 | 20260101155726 | 2026-01-01 15:57:26 
 20260101160000 | 20260101160000 | 2026-01-01 16:00:00  ← Latest
```

### Rollback a Migration

**Option 1: Mark as Reverted (keeps in history)**
```bash
supabase migration repair --status reverted <migration_id>
```

**Option 2: Manual Rollback (write reversal SQL)**

Create a new migration that undoes the changes:

```bash
supabase migration new rollback_add_ai_jobs
```

Then write the reversal SQL:
```sql
-- Undo the changes
DROP TABLE IF EXISTS ai_processing_jobs;
```

Apply it:
```bash
supabase db push
```

---

## 📝 Best Practices

### 1. **Always Include Rollback Logic in Comments**

```sql
-- Migration: Add ai_processing_jobs table
-- Rollback: DROP TABLE ai_processing_jobs;

CREATE TABLE ai_processing_jobs (...);
```

### 2. **Use Idempotent Operations**

```sql
-- ✅ Good: Can run multiple times safely
CREATE TABLE IF NOT EXISTS my_table (...);
ALTER TABLE IF EXISTS my_table ADD COLUMN IF NOT EXISTS new_col TEXT;

-- ❌ Bad: Will fail if already exists
CREATE TABLE my_table (...);
ALTER TABLE my_table ADD COLUMN new_col TEXT;
```

### 3. **Test Migrations**

```bash
# Local testing
supabase start
supabase db reset  # Runs all migrations from scratch
```

### 4. **Migration Naming Convention**

```bash
# Use descriptive snake_case names
supabase migration new add_email_verification_table
supabase migration new fix_user_profile_rls
supabase migration new update_pricing_logic
```

### 5. **Never Edit Applied Migrations**

Once a migration is applied to remote (`supabase db push`), **never edit it**.

Instead, create a new migration to fix issues:
```bash
supabase migration new fix_previous_migration
```

---

## 🔧 Common Commands

| Command | Description |
|---------|-------------|
| `supabase migration list` | Show migration status (local vs remote) |
| `supabase migration new <name>` | Create new migration file |
| `supabase db push` | Apply local migrations to remote |
| `supabase db pull` | Pull remote schema changes to local |
| `supabase db diff` | Show differences between local and remote |
| `supabase migration repair --status <status> <id>` | Fix migration history |

---

## 🎯 Your Old Workflow vs New Workflow

### ❌ Old Workflow (Manual SQL Runner)
1. Write SQL in `database/my_migration.sql`
2. Copy/paste into Supabase dashboard SQL editor
3. Run manually
4. ⚠️ **No version control**
5. ⚠️ **No rollback capability**
6. ⚠️ **Hard to track what's been applied**

### ✅ New Workflow (Proper Migrations)
1. `supabase migration new my_feature`
2. Write SQL in generated file
3. `supabase db push`
4. ✅ **Automatically versioned**
5. ✅ **Can rollback**
6. ✅ **Migration history tracked**
7. ✅ **Synced with git**

---

## 📦 Moving Your Old SQL Files

Your existing SQL files in `/database` folder are now historical.

You have two options:

### Option 1: Keep as Reference (Recommended)
- Leave them in `/database` folder
- They document what was applied
- Use as reference when creating new migrations

### Option 2: Clean Up (After Verification)
```bash
# After confirming everything works
mkdir database/archive
mv database/*.sql database/archive/
```

---

## 🚨 Emergency Rollback

If a migration breaks production:

1. **Identify the problematic migration:**
```bash
supabase migration list
```

2. **Mark it as reverted:**
```bash
supabase migration repair --status reverted <migration_id>
```

3. **Write and apply a fix migration:**
```bash
supabase migration new emergency_fix
# Edit the file with fix SQL
supabase db push
```

---

## 🎓 Example: Complete Migration Workflow

```bash
# 1. Create migration
supabase migration new add_user_preferences

# 2. Edit the file
# supabase/migrations/20260101160000_add_user_preferences.sql
# Add your SQL here

# 3. Review changes
git diff

# 4. Test locally (optional)
supabase db reset

# 5. Apply to remote
supabase db push

# 6. Verify it worked
supabase migration list

# 7. Commit to git
git add supabase/migrations/
git commit -m "feat: add user preferences table"
git push
```

---

## 📚 Learn More

- [Supabase CLI Docs](https://supabase.com/docs/reference/cli)
- [Database Migrations Guide](https://supabase.com/docs/guides/cli/managing-environments)

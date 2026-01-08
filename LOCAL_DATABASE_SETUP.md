# Local Supabase Database Setup Guide

This guide will help you set up a local Supabase database for development.

## Quick Start

### 1. Start Local Supabase

```bash
supabase start
```

This command will:
- Download and start Docker containers for PostgreSQL, PostgREST, GoTrue, and other Supabase services
- Apply all migrations from `supabase/migrations/`
- Display your local credentials

**First time setup may take a few minutes** as it downloads Docker images.

### 2. Get Your Local Credentials

After `supabase start` completes, you'll see output like this:

```
         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Copy the `anon key` and `service_role key`** - you'll need these for your `.env.local` file.

### 3. Configure Environment Variables

Create or update `.env.local` in the project root:

```env
# Local Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-anon-key-here>
SUPABASE_SERVICE_ROLE_KEY=<paste-service-role-key-here>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Start Your Development Server

```bash
npm run dev
```

Your app will now connect to the local Supabase instance!

## Accessing Local Services

### Supabase Studio (Database UI)
**URL**: http://127.0.0.1:54323

Use this to:
- Browse tables and data
- Run SQL queries
- Manage database schema
- View authentication users

### Inbucket (Email Testing)
**URL**: http://127.0.0.1:54324

All emails sent by your local app (password resets, confirmations, etc.) will appear here instead of being actually sent.

### Direct Database Access

```bash
# Connect via psql
supabase db psql

# Or use the connection string from `supabase status`
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## Common Commands

```bash
# Start Supabase (if not running)
supabase start

# Check status
supabase status

# View logs
supabase logs

# Stop Supabase
supabase stop

# Reset database (drops all data, reapplies migrations)
supabase db reset

# Apply new migrations
supabase db reset  # or migrations are auto-applied on start

# Pull remote schema changes
supabase db pull

# Push local migrations to remote
supabase db push
```

## Troubleshooting

### Docker Not Running
If you see errors about Docker, make sure Docker Desktop is running.

### Port Already in Use
If ports 54321-54324 are already in use:
1. Stop the conflicting service
2. Or modify ports in `supabase/config.toml`

### Database Reset Issues
If migrations fail:
```bash
supabase stop
supabase start
```

### Getting Credentials Again
If you need to see your credentials again:
```bash
supabase status
```

## Switching Between Local and Remote

### Use Local Database
Set in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
```

### Use Remote Database
Set in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
```

**Remember**: Always restart your Next.js dev server after changing environment variables!

## Database Migrations

All migrations are in `supabase/migrations/`. They are automatically applied when you:
- Run `supabase start` (first time or after changes)
- Run `supabase db reset`

To create a new migration:
```bash
supabase migration new <migration_name>
```

See `supabase/MIGRATIONS.md` for more details.

## Seed Data

If you have seed data in `supabase/seed.sql`, it will be automatically loaded when you run `supabase db reset`.

## Next Steps

1. ✅ Start Supabase: `supabase start`
2. ✅ Copy credentials to `.env.local`
3. ✅ Start dev server: `npm run dev`
4. ✅ Access Studio: http://127.0.0.1:54323
5. ✅ Start developing!

## Additional Resources

- [Supabase CLI Docs](https://supabase.com/docs/reference/cli)
- [Local Development Guide](https://supabase.com/docs/guides/cli/local-development)
- [Database Migrations](https://supabase.com/docs/guides/cli/managing-environments)



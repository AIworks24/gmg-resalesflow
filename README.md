# gmg-resalesflow 
Goodman Management Group - Resale Certificate System
# GMG ResaleFlow - Resale Certificate Management System

## Overview
Professional resale certificate processing system for Goodman Management Group, built with Next.js and Supabase.

## Features
- Multi-step application form
- Role-based user management  
- Real-time application tracking
- Admin dashboard
- Email automation integration
- Stripe payment processing (coming soon)

## Getting Started

### Prerequisites
- Node.js 18+ 
- Docker Desktop (for local Supabase)
- Supabase CLI (`npm install -g supabase` or via Homebrew)
- Supabase account (for production)
- Vercel account (for deployment)

### Local Development

#### Option 1: Using Local Supabase Database (Recommended for Development)

1. **Install Supabase CLI** (if not already installed):
   ```bash
   npm install -g supabase
   # OR via Homebrew on macOS:
   brew install supabase/tap/supabase
   ```

2. **Start Local Supabase**:
   ```bash
   supabase start
   ```
   This will:
   - Start a local PostgreSQL database
   - Start Supabase API, Auth, Storage, and Studio
   - Apply all migrations from `supabase/migrations/`
   - Display your local credentials

3. **Get Local Credentials**:
   After running `supabase start`, you'll see output like:
   ```
   API URL: http://127.0.0.1:54321
   GraphQL URL: http://127.0.0.1:54321/graphql/v1
   DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
   Studio URL: http://127.0.0.1:54323
   Inbucket URL: http://127.0.0.1:54324
   JWT secret: your-jwt-secret
   anon key: your-anon-key
   service_role key: your-service-role-key
   ```

4. **Create `.env.local` file**:
   ```bash
   cp .env.local.example .env.local  # if example exists
   # OR create manually
   ```

5. **Set Local Environment Variables** in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key-from-step-3>
   SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key-from-step-3>
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```

6. **Install dependencies**:
   ```bash
   npm install
   ```

7. **Run development server**:
   ```bash
   npm run dev
   ```

8. **Access Local Services**:
   - **Next.js App**: http://localhost:3000
   - **Supabase Studio**: http://127.0.0.1:54323 (database management UI)
   - **Inbucket** (Email Testing): http://127.0.0.1:54324 (view test emails)

#### Option 2: Using Remote Supabase Database

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local`
4. Set environment variables to your remote Supabase project:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
5. Run development server: `npm run dev`

### Useful Local Supabase Commands

```bash
# Start local Supabase
supabase start

# Stop local Supabase
supabase stop

# Reset local database (applies all migrations from scratch)
supabase db reset

# View local database status
supabase status

# View logs
supabase logs

# Access database directly via psql
supabase db psql
```

### Environment Variables

**For Local Development:**
- `NEXT_PUBLIC_SUPABASE_URL`: `http://127.0.0.1:54321` (local)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Get from `supabase start` output
- `SUPABASE_SERVICE_ROLE_KEY`: Get from `supabase start` output
- `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000`

**For Production:**
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `NEXT_PUBLIC_SITE_URL`: Your production domain

### Deployment
1. Connect repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy automatically on commit

## Admin Access
- Admin users can access `/admin` for application management
- Set user role to 'admin' in Supabase profiles table

## Support
Contact: resales@gmgva.com

## License
Private - Goodman Management Group 
 
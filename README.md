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
- Supabase account
- Vercel account (for deployment)

### Local Development
1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.local.example` to `.env.local`
4. Update environment variables
5. Run development server: `npm run dev`

### Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anonymous key
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

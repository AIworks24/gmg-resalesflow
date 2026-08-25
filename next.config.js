/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    // `npm run lint` is the gate; the build is not. Adding .eslintrc.json made
    // `next build` start running ESLint, and 58 pre-existing errors across the
    // repo would fail every build and block Vercel deploys. This restores the
    // prior build behaviour (ESLint was skipped entirely when no config existed)
    // while keeping lint runnable on demand. Flip to false once the backlog in
    // `npm run lint` is cleared.
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['dnivljiyahzxpyxjjifi.supabase.co'],
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
};

module.exports = nextConfig

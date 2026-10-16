const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

// Security headers (ClickUp 14ypaj0jnh0). Origins come from env so test and live, which use
// different Supabase projects and realtime workers, each get their own policy.

// Roll-out switch: send the CSP as Report-Only while checking flows for violations, then enforce.
// The audit scanner only accepts the enforcing header.
const CSP_REPORT_ONLY = true;

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

function buildCsp({ isDev }) {
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabase && supabase.replace(/^http/, 'ws');

  // Realtime worker (party/). Local dev runs it over plain ws on localhost:1999.
  const realtimeHost = process.env.NEXT_PUBLIC_REALTIME_HOST;
  const realtimeIsLocal = realtimeHost && /^(localhost|127\.0\.0\.1)(:|$)/.test(realtimeHost);
  const realtime = realtimeHost
    ? realtimeIsLocal
      ? [`http://${realtimeHost}`, `ws://${realtimeHost}`]
      : [`https://${realtimeHost}`, `wss://${realtimeHost}`]
    : [];

  // Vercel's preview toolbar (vercel.live) is injected on preview deployments only.
  const vercelLive = process.env.VERCEL_ENV === 'preview';

  const directives = {
    'default-src': ["'self'"],
    // Stripe.js, and unpkg for the SimplePDF embed script (components/admin/AdminApplications.js).
    // Production has no inline scripts because `npm run build` uses webpack: Turbopack adds an
    // inline chunk-loader <script> to every Pages Router page, which this policy would block.
    // The dev server still runs Turbopack, so 'unsafe-eval' and 'unsafe-inline' are dev-only.
    'script-src': [
      "'self'",
      'https://js.stripe.com',
      'https://*.js.stripe.com',
      'https://unpkg.com',
      isDev && "'unsafe-eval'",
      isDev && "'unsafe-inline'",
      vercelLive && 'https://vercel.live',
    ],
    'style-src': ["'self'", "'unsafe-inline'", vercelLive && 'https://vercel.live'],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      supabase,
      vercelLive && 'https://vercel.live',
      vercelLive && 'https://vercel.com',
    ],
    'font-src': [
      "'self'",
      'data:',
      vercelLive && 'https://vercel.live',
      vercelLive && 'https://assets.vercel.com',
    ],
    // PostHog needs no entry: it is proxied through /ingest (same origin).
    'connect-src': [
      "'self'",
      supabase,
      supabaseWs,
      'https://api.stripe.com',
      ...realtime,
      vercelLive && 'https://vercel.live',
      vercelLive && 'wss://ws-us3.pusher.com',
    ],
    // Stripe.js frames, and the SimplePDF editor iframe (<companyIdentifier>.simplepdf.com;
    // we use the default "embed" identifier).
    'frame-src': [
      'https://js.stripe.com',
      'https://*.js.stripe.com',
      'https://hooks.stripe.com',
      'https://embed.simplepdf.com',
      vercelLive && 'https://vercel.live',
    ],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };

  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources.filter(Boolean)].join(' '))
    .join('; ');
}

function securityHeaders({ isDev }) {
  const siteOrigin = originOf(process.env.NEXT_PUBLIC_SITE_URL) || 'https://resales.gmgva.com';

  return [
    {
      key: CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
      value: buildCsp({ isDev }),
    },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    },
    // Our own origin instead of Vercel's default "*". No Allow-Credentials: nothing calls the API
    // cross-origin from a browser; Stripe webhooks and crons are server-to-server.
    { key: 'Access-Control-Allow-Origin', value: siteOrigin },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ];
}

/** @type {(phase: string) => import('next').NextConfig} */
module.exports = (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
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
    async headers() {
      return [{ source: '/(.*)', headers: securityHeaders({ isDev }) }];
    },
    webpack(config, { isServer }) {
      if (!isServer) {
        // Server-only packages reached from shared lib files (require('stripe') in
        // lib/stripe.js getServerStripe, require('dotenv') in lib/pricingConfig.js). Bundling them
        // for the browser pulls in Node's util polyfill, whose Function() probe is a CSP
        // unsafe-eval violation. Neither is ever used client-side.
        config.resolve.alias = { ...config.resolve.alias, stripe: false, dotenv: false };
      }
      return config;
    },
    // `npm run dev` stays on Turbopack. It needs no alias (the dev CSP allows 'unsafe-eval'), but
    // Next 16 refuses to start Turbopack when only a webpack config is present.
    turbopack: {},
    reactStrictMode: true,
    images: {
      remotePatterns: [{ protocol: 'https', hostname: 'dnivljiyahzxpyxjjifi.supabase.co' }],
    },
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
  };
};

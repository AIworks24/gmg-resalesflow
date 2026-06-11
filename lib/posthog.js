import posthog from 'posthog-js';

// Comma-separated. Domains take priority over individual emails.
// Example: NEXT_PUBLIC_POSTHOG_EXCLUDED_DOMAINS=gmg.com,goodmanmgmt.com
// Example: NEXT_PUBLIC_POSTHOG_EXCLUDED_EMAILS=tester@gmail.com,qa@example.com
const EXCLUDED_DOMAINS = (process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_DOMAINS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const EXCLUDED_EMAILS = (process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function isExcluded(email) {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (EXCLUDED_EMAILS.includes(lower)) return true;
  const domain = lower.split('@')[1];
  return domain ? EXCLUDED_DOMAINS.includes(domain) : false;
}

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (posthog.__loaded) return;

  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    console.warn('[PostHog] NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set — skipping init');
    return;
  }

  try {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN, {
      api_host: '/ingest',
      ui_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.posthog.com',
      session_recording: {
        maskAllInputs: false,
        maskInputOptions: { password: true },
      },
      capture_pageview: false,
    });
  } catch (e) {
    console.warn('[PostHog] init failed:', e);
  }
}

export function identifyUser(email) {
  if (typeof window === 'undefined' || !posthog.__loaded) return;
  try {
    if (isExcluded(email)) {
      posthog.opt_out_capturing();
      return;
    }
    posthog.opt_in_capturing();
    posthog.identify(email, { email });
  } catch (e) {
    console.warn('[PostHog] identify failed:', e);
  }
}

export function resetPostHog() {
  if (typeof window === 'undefined' || !posthog.__loaded) return;
  try {
    posthog.reset();
  } catch (e) {
    console.warn('[PostHog] reset failed:', e);
  }
}

export default posthog;

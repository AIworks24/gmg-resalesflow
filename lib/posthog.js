import posthog from 'posthog-js';

export function initPostHog() {
  if (typeof window === 'undefined') return;
  if (posthog.__loaded) return;

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

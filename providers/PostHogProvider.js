import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { initPostHog, identifyUser, resetPostHog } from '../lib/posthog';
import posthog from 'posthog-js';
import useApplicantAuthStore from '../stores/applicantAuthStore';

export default function PostHogProvider({ children }) {
  const router = useRouter();
  const user = useApplicantAuthStore((s) => s.user);

  // Initialize once on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views on route change
  useEffect(() => {
    const handleRouteChange = () => posthog.capture('$pageview');
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router.events]);

  // Identify / reset based on auth state
  useEffect(() => {
    if (user?.email) {
      identifyUser(user.email);
    } else {
      resetPostHog();
    }
  }, [user?.email]);

  return children;
}

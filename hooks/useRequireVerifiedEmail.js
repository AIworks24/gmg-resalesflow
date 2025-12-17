/**
 * Custom Hook: useRequireVerifiedEmail
 * 
 * This hook enforces email verification for protected features.
 * It allows unverified users to log in and browse, but blocks them
 * from accessing protected features like application creation.
 * 
 * Usage:
 * ```javascript
 * const { checkVerification } = useRequireVerifiedEmail();
 * 
 * const handleCreateApplication = () => {
 *   if (!checkVerification()) return; // Blocks unverified users
 *   // Continue with application creation
 * };
 * ```
 * 
 * Features:
 * - Non-blocking: Returns false but allows page to load
 * - Redirects to verification pending page with return URL
 * - Automatically redirects back after verification
 * - Works with Realtime subscriptions
 */

import { useRouter } from 'next/router';
import useApplicantAuthStore from '../stores/applicantAuthStore';

export const useRequireVerifiedEmail = () => {
  const router = useRouter();
  const { profile, isAuthenticated } = useApplicantAuthStore();

  /**
   * Check if user is verified and redirect if not
   * @param {string} featureName - Name of the feature being accessed (for logging)
   * @returns {boolean} - True if verified, false if not
   */
  const checkVerification = (featureName = 'this feature') => {
    // Not authenticated at all - don't block (auth provider will handle)
    if (!isAuthenticated()) {
      return false;
    }

    // Check if email is verified
    const isVerified = profile?.email_confirmed_at !== null && profile?.email_confirmed_at !== undefined;

    if (!isVerified) {
      console.log(`[useRequireVerifiedEmail] Blocking access to ${featureName} - email not verified`);
      
      // Store the current URL as the intended destination
      const returnUrl = router.asPath;
      
      // Redirect to verification pending page with return URL
      router.push({
        pathname: '/auth/verification-pending',
        query: { returnUrl },
      });
      
      return false;
    }

    return true;
  };

  /**
   * Get verification status without redirecting
   * @returns {boolean} - True if verified, false if not
   */
  const isVerified = () => {
    if (!isAuthenticated()) return false;
    return profile?.email_confirmed_at !== null && profile?.email_confirmed_at !== undefined;
  };

  /**
   * Require verification before executing a callback
   * @param {Function} callback - Function to execute if verified
   * @param {string} featureName - Name of the feature (for logging)
   */
  const requireVerification = (callback, featureName = 'this feature') => {
    return (...args) => {
      if (checkVerification(featureName)) {
        return callback(...args);
      }
    };
  };

  return {
    checkVerification,
    isVerified,
    requireVerification,
  };
};

export default useRequireVerifiedEmail;




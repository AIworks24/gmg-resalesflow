import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import useApplicantAuthStore from '../stores/applicantAuthStore';

const ApplicantAuthContext = createContext({});

export function ApplicantAuthProvider({ children }) {
  const router = useRouter();
  const { 
    initialize, 
    isLoading, 
    isInitialized, 
    isAuthenticated, 
    user, 
    applications 
  } = useApplicantAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  useEffect(() => {
    // Only run auth checks after initialization
    if (!isInitialized || isLoading) return;

    const currentPath = router.pathname;
    const isPublicRoute = ['/', '/login', '/signup', '/about', '/contact', '/reset-password', '/auth/callback'].includes(currentPath);
    const isAdminRoute = currentPath.startsWith('/admin');
    
    // Don't handle auth for admin routes (handled by AdminAuthProvider)
    if (isAdminRoute) return;

    // Don't redirect from auth callback - it handles its own flow
    if (currentPath === '/auth/callback') return;

    // For protected applicant routes, redirect to login if not authenticated
    if (!isPublicRoute && !isAuthenticated()) {
      router.push('/login');
    }
  }, [router, isInitialized, isLoading, isAuthenticated]);

  // Show loading spinner while initializing (only for non-admin routes)
  if ((!isInitialized || isLoading) && !router.pathname.startsWith('/admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const value = {
    user,
    applications,
    isAuthenticated: isAuthenticated(),
    isLoading,
  };

  return (
    <ApplicantAuthContext.Provider value={value}>
      {children}
    </ApplicantAuthContext.Provider>
  );
}

export function useApplicantAuth() {
  const context = useContext(ApplicantAuthContext);
  if (!context) {
    throw new Error('useApplicantAuth must be used within ApplicantAuthProvider');
  }
  return context;
}

// HOC for protecting applicant routes
export function withApplicantAuth(Component) {
  return function ProtectedComponent(props) {
    const { isAuthenticated, isLoading } = useApplicantAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push('/login');
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return null; // Will redirect in useEffect
    }

    return <Component {...props} />;
  };
}
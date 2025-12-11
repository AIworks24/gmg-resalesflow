import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/router';
import useAdminAuthStore from '../stores/adminAuthStore';

const AdminAuthContext = createContext({});

export function AdminAuthProvider({ children }) {
  const router = useRouter();
  const { 
    initialize, 
    isLoading, 
    isInitialized, 
    isAuthenticated, 
    user, 
    role 
  } = useAdminAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  useEffect(() => {
    // Only run auth checks after initialization
    if (!isInitialized || isLoading) return;

    const currentPath = router.pathname;
    const isAdminRoute = currentPath.startsWith('/admin');
    const isLoginPage = currentPath === '/admin/login';

    if (isAdminRoute && !isLoginPage && !isAuthenticated()) {
      // Redirect to admin login if accessing admin routes without auth
      // Preserve redirect URL, applicationId, or default to login
      const redirect = encodeURIComponent(router.asPath); // Full path with query params
      const applicationId = router.query.applicationId;
      
      if (applicationId) {
        // Legacy support for applicationId
        router.push(`/admin/login?applicationId=${applicationId}`);
      } else if (redirect && redirect !== '/admin/login') {
        // Preserve the full URL (including query params) for redirect after login
        router.push(`/admin/login?redirect=${redirect}`);
      } else {
        router.push('/admin/login');
      }
    } else if (isLoginPage && isAuthenticated()) {
      // Redirect if already authenticated and on login page
      // Check for redirect param first, then applicationId, then default
      const redirect = router.query.redirect;
      const applicationId = router.query.applicationId;
      
      if (redirect) {
        // Decode and redirect to the preserved URL
        router.push(decodeURIComponent(redirect));
      } else if (applicationId) {
        // Legacy support for applicationId
        router.push(`/admin/applications?applicationId=${applicationId}`);
      } else {
        // Default redirect to dashboard
        router.push('/admin/dashboard');
      }
    }
  }, [router, isInitialized, isLoading, isAuthenticated]);

  // Show loading spinner while initializing
  if (!isInitialized || isLoading) {
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
    role,
    isAuthenticated: isAuthenticated(),
    isLoading,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider');
  }
  return context;
}

// HOC for protecting admin routes
export function withAdminAuth(Component) {
  return function ProtectedComponent(props) {
    const { isAuthenticated, isLoading, role } = useAdminAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.push('/admin/login');
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

    // Check if user has admin, staff, or accounting role
    if (role && !['admin', 'staff', 'accounting'].includes(role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
            <p className="text-gray-600 mb-6">You don't have permission to access this page.</p>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
}
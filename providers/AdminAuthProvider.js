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
      router.push('/admin/login');
    } else if (isLoginPage && isAuthenticated()) {
      // Redirect to dashboard if already authenticated and on login page
      router.push('/admin/dashboard');
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
    const { isAuthenticated, isLoading } = useAdminAuth();
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

    return <Component {...props} />;
  };
}
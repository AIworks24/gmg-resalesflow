import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const useAdminAuthStore = create(
  subscribeWithSelector((set, get) => ({
  // State
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  role: null, // 'admin', 'staff', 'accounting', or null

  // Actions
  initialize: async () => {
    const supabase = createClientComponentClient();
    
    try {
      // Get current session (better for refresh scenarios)
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      
      if (user) {
        // Get user profile to check role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        
        // Only allow admin, staff, and accounting users
        if (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'accounting') {
          set({
            user,
            profile,
            role: profile.role,
            isLoading: false,
            isInitialized: true,
          });
        } else {
          // User exists but not admin/staff
          set({
            user: null,
            profile: null,
            role: null,
            isLoading: false,
            isInitialized: true,
          });
        }
      } else {
        set({
          user: null,
          profile: null,
          role: null,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Admin auth initialization error:', error);
      set({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
        isInitialized: true,
      });
    }

    // Set up auth state listener
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.email || 'no user');
      
      if (event === 'SIGNED_OUT' || !session?.user) {
        set({
          user: null,
          profile: null,
          role: null,
          isLoading: false,
          isInitialized: true,
        });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        // Re-validate user role on sign in or token refresh
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
          
          if (profile?.role === 'admin' || profile?.role === 'staff') {
            set({
              user: session.user,
              profile,
              role: profile.role,
              isLoading: false,
              isInitialized: true,
            });
          } else {
            // User exists but not admin/staff
            await supabase.auth.signOut();
          }
        } catch (error) {
          console.error('Error checking user role:', error);
          await supabase.auth.signOut();
        }
      }
    });
  },

  signIn: async (email, password) => {
    const supabase = createClientComponentClient();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Check if user has admin/staff role
      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'accounting') {
          set({
            user: data.user,
            profile,
            role: profile.role,
            isLoading: false,
          });
          return { success: true };
        } else {
          // Sign out if not admin/staff/accounting
          await supabase.auth.signOut();
          throw new Error('Access denied. Admin, staff, or accounting role required.');
        }
      }
    } catch (error) {
      set({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
      });
      return { success: false, error: error.message };
    }
  },

  signOut: async () => {
    const supabase = createClientComponentClient();
    
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      set({
        user: null,
        profile: null,
        role: null,
        isLoading: false,
      });
      
      return { success: true };
    } catch (error) {
      console.error('Admin sign out error:', error);
      return { success: false, error: error.message };
    }
  },

  // Computed getters
  isAuthenticated: () => {
    const { user, role } = get();
    return !!user && (role === 'admin' || role === 'staff' || role === 'accounting');
  },

  isAdmin: () => {
    const { role } = get();
    return role === 'admin';
  },

  isStaff: () => {
    const { role } = get();
    return role === 'staff';
  },

  isAccounting: () => {
    const { role } = get();
    return role === 'accounting';
  },

  hasRole: (requiredRole) => {
    const { role } = get();
    if (requiredRole === 'admin') {
      return role === 'admin';
    }
    if (requiredRole === 'staff') {
      return role === 'admin' || role === 'staff';
    }
    if (requiredRole === 'accounting') {
      return role === 'admin' || role === 'accounting';
    }
    return false;
  },
  }))
);

// Add development-only debugging
if (process.env.NODE_ENV === 'development') {
  useAdminAuthStore.subscribe(
    (state) => state.user,
    (user) => console.log('Admin auth user changed:', user?.email || 'logged out')
  );
}

export default useAdminAuthStore;
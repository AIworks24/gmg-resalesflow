import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import useNotificationStore from './notificationStore';

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

    // Set up auth state listener with debouncing to prevent rapid-fire updates
    let lastEventTime = 0;
    let debounceTimeout = null;
    const DEBOUNCE_DELAY = 1000; // 1 second debounce
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentTime = Date.now();
      const timeSinceLastEvent = currentTime - lastEventTime;
      
      // Skip TOKEN_REFRESHED events if we just handled an event recently
      // TOKEN_REFRESHED happens automatically and shouldn't trigger full re-initialization
      if (event === 'TOKEN_REFRESHED' && timeSinceLastEvent < 5000) {
        console.log('Auth state changed: TOKEN_REFRESHED (ignored - too soon after last event)');
        return; // Skip token refresh if recent event
      }
      
      // Clear any pending debounce
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      
      // Debounce rapid-fire events
      debounceTimeout = setTimeout(async () => {
        lastEventTime = Date.now();
        console.log('Auth state changed:', event, session?.user?.email || 'no user');
        
        const currentState = get();
        
        if (event === 'SIGNED_OUT' || !session?.user) {
          set({
            user: null,
            profile: null,
            role: null,
            isLoading: false,
            isInitialized: true,
          });
        } else if (event === 'SIGNED_IN') {
          // Only on actual sign-in: re-validate user role
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', session.user.id)
              .single();
            
            if (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'accounting') {
              set({
                user: session.user,
                profile,
                role: profile.role,
                isLoading: false,
                isInitialized: true,
              });
            } else {
              // User exists but not admin/staff/accounting
              await supabase.auth.signOut();
            }
          } catch (error) {
            console.error('Error checking user role:', error);
            await supabase.auth.signOut();
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // For TOKEN_REFRESHED: Only update user object if it changed, don't query database
          // Only update if user ID actually changed (shouldn't happen, but safety check)
          if (currentState.user?.id !== session.user?.id) {
            console.log('Token refreshed with different user - updating state');
            try {
              const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .single();
              
              if (profile?.role === 'admin' || profile?.role === 'staff' || profile?.role === 'accounting') {
                set({
                  user: session.user,
                  profile,
                  role: profile.role,
                  isLoading: false,
                  isInitialized: true,
                });
              }
            } catch (error) {
              console.warn('Token refresh: Error getting profile (non-critical):', error);
              // Don't sign out on token refresh errors - just log
            }
          } else {
            // User hasn't changed, just update the user object silently
            // Don't query database or trigger state updates
            console.log('Token refreshed - user unchanged, skipping updates');
          }
        }
      }, DEBOUNCE_DELAY);
    });
    
    // Store subscription for cleanup (though Zustand store doesn't typically cleanup)
    // This listener persists for the app lifetime
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
    // Reset notification store on logout
    try {
      useNotificationStore.getState().reset();
    } catch (error) {
      console.warn('Failed to reset notification store on logout:', error);
    }
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
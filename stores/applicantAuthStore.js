import { create } from 'zustand';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Helper function to determine user role based on email domain
const determineUserRole = (email) => {
  if (!email) return 'requester';
  // All users are now 'requester' regardless of email domain
  return 'requester';
};

const useApplicantAuthStore = create((set, get) => ({
  // State
  user: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  applications: [], // User's applications

  // Actions
  initialize: async () => {
    const supabase = createClientComponentClient();
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // Get user profile
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, email_confirmed_at, created_at, updated_at')
          .eq('id', user.id)
          .single();
        
        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
          const userRole = determineUserRole(user.email);
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              role: userRole,
              email_confirmed_at: null, // New users need to confirm email
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select('id, email, first_name, last_name, role, email_confirmed_at, created_at, updated_at')
            .single();
          
          if (createError) {
            console.error('Error creating profile:', createError);
          } else {
            profile = newProfile;
          }
        } else if (profileError) {
          console.error('Error loading profile:', profileError);
        }
        
        // Check if email is confirmed (for custom confirmation process)
        // Handle existing users: auto-confirm if created > 1 day ago (backward compatibility)
        if (profile && profile.email_confirmed_at === null) {
          // Check if this is an existing account (created before confirmation system was implemented)
          const createdAt = profile.created_at ? new Date(profile.created_at) : null;
          const oneDayAgo = new Date();
          oneDayAgo.setDate(oneDayAgo.getDate() - 1);
          
          if (createdAt && createdAt < oneDayAgo) {
            // Existing user - auto-confirm their email with their creation date
            const { error: confirmError } = await supabase
              .from('profiles')
              .update({ email_confirmed_at: profile.created_at })
              .eq('id', profile.id);
            
            if (!confirmError) {
              // Update profile in state
              profile.email_confirmed_at = profile.created_at;
            }
          } else {
            // New user without email confirmation - redirect to verification pending
            // Don't sign out - just let the provider redirect them
            set({
              user,
              profile,
              isLoading: false,
              isInitialized: true,
            });
            return;
          }
        }
        // If email_confirmed_at is not null, allow access
        
        // Allow applicant roles: requester, realtor, or no role
        if (!profile?.role || ['requester', 'realtor'].includes(profile.role)) {
          set({
            user,
            profile,
            isLoading: false,
            isInitialized: true,
          });
          
          // Load user's applications
          await get().loadApplications();
        } else {
          // User is admin/staff, not allowed in applicant section
          set({
            user: null,
            profile: null,
            isLoading: false,
            isInitialized: true,
          });
        }
      } else {
        set({
          user: null,
          profile: null,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Applicant auth initialization error:', error);
      set({
        user: null,
        profile: null,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  signUp: async (email, password, userData) => {
    try {
      // Use our custom signup API endpoint that prevents Supabase from sending emails
      // and uses our own custom email template instead
      const response = await fetch('/api/auth/custom-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
        email,
        password,
          first_name: userData?.first_name || '',
          last_name: userData?.last_name || '',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Improve error messages
        let errorMessage = data.error || 'Sign up failed. Please try again.';
        if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
          errorMessage = 'This email is already registered. Please sign in instead.';
        } else if (errorMessage.includes('invalid email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (errorMessage.includes('Password')) {
          errorMessage = 'Password must be at least 6 characters long.';
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
        return { success: false, error: errorMessage };
      }

      if (data.success) {
        // User is created and logged in, but needs to verify email to access full features
        if (data.session) {
          // Set the session in Supabase client
          const supabase = createClientComponentClient();
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          
          // Set user and profile in store
        set({
            user: data.session.user,
            profile: {
              id: data.user.id,
              email: data.user.email,
              email_confirmed_at: null, // Not confirmed yet
            },
          isLoading: false,
        });
        }
        
        return { 
          success: true, 
          user: data.session?.user || null,
          userId: data.user?.id, 
          requiresEmailVerification: data.requiresEmailVerification,
          message: data.message 
        };
      }

      return { success: false, error: data.error || 'Sign up failed. Please try again.' };
    } catch (error) {
      // Handle network errors
      let errorMessage = error.message || 'An unexpected error occurred. Please try again.';
      if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your connection and try again.';
      }
      return { success: false, error: errorMessage };
    }
  },

  signIn: async (email, password) => {
    const supabase = createClientComponentClient();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Improve error messages
        let errorMessage = error.message;
        if (error.message.includes('Invalid login credentials') || error.message.includes('Invalid credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        } else if (error.message.includes('Email not confirmed')) {
          errorMessage = 'Please verify your email address before signing in. Check your inbox for the verification link.';
        } else if (error.message.includes('Too many requests')) {
          errorMessage = 'Too many login attempts. Please wait a few minutes and try again.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
        throw new Error(errorMessage);
      }

      if (data.user) {
        // Check if user is not admin/staff
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, email_confirmed_at, created_at, updated_at')
          .eq('id', data.user.id)
          .single();
        
        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
          const userRole = determineUserRole(data.user.email);
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: data.user.id,
              email: data.user.email,
              role: userRole,
              email_confirmed_at: null, // New users need to confirm email
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select('id, email, first_name, last_name, role, email_confirmed_at, created_at, updated_at')
            .single();
          
          if (createError) {
            console.error('Error creating profile during sign in:', createError);
          } else {
            profile = newProfile;
          }
        } else if (profileError) {
          console.error('Error loading profile during sign in:', profileError);
        }

        // Check if email is confirmed (for custom confirmation process)
        // Handle existing users: auto-confirm if created > 1 day ago (backward compatibility)
        if (profile) {
          if (profile.email_confirmed_at === null) {
            // Check if this is an existing account (created before confirmation system was implemented)
            // If created_at is more than 1 day ago, treat as existing user and auto-confirm
            const createdAt = profile.created_at ? new Date(profile.created_at) : null;
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            
            if (createdAt && createdAt < oneDayAgo) {
              // Existing user - auto-confirm their email with their creation date
              const { error: confirmError } = await supabase
                .from('profiles')
                .update({ email_confirmed_at: profile.created_at })
                .eq('id', profile.id);
              
              if (!confirmError) {
                // Update profile in state
                profile.email_confirmed_at = profile.created_at;
              }
            } else {
              // New user - require email confirmation
              await supabase.auth.signOut();
              throw new Error('Please verify your email address before signing in. Check your inbox for the verification link, or request a new confirmation email.');
            }
          }
          // If email_confirmed_at is not null, allow sign-in
        }

        if (profile?.role === 'admin' || profile?.role === 'staff') {
          // Admin/staff users should use admin portal
          await supabase.auth.signOut();
          throw new Error('Please use the admin portal to sign in.');
        }

        // Allow all applicant types: requester, realtor, or no role
        if (profile?.role && !['requester', 'realtor'].includes(profile.role)) {
          await supabase.auth.signOut();
          throw new Error('Invalid user role for applicant portal.');
        }

        set({
          user: data.user,
          profile,
          isLoading: false,
        });
        
        // Load user's applications
        await get().loadApplications();
        
        return { success: true };
      }
    } catch (error) {
      set({
        user: null,
        profile: null,
        isLoading: false,
      });
      return { success: false, error: error.message };
    }
  },

  signOut: async () => {
    const supabase = createClientComponentClient();
    
    try {
      // Try to sign out, but ignore if there's no session
      const { error } = await supabase.auth.signOut();
      if (error && error.message !== 'Auth session missing!') {
        throw error;
      }
    } catch (error) {
      // If it's not a session missing error, log it
      if (error.message !== 'Auth session missing!' && error.message !== 'AuthSessionMissingError: Auth session missing!') {
        console.error('Applicant sign out error:', error);
      }
    } finally {
      // Always clear local state regardless of signOut result
      set({
        user: null,
        profile: null,
        applications: [],
        isLoading: false,
      });
    }
    
    return { success: true };
  },

  resetPassword: async (email) => {
    try {
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true, message: data.message };
      } else {
        return { success: false, error: data.error || data.message || 'Failed to send password reset email' };
      }
    } catch (error) {
      console.error('Error requesting password reset:', error);
      return { success: false, error: error.message || 'Failed to send password reset email' };
    }
  },

  loadApplications: async () => {
    const { user } = get();
    if (!user) return;

    const supabase = createClientComponentClient();
    
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name),
          property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
          notifications(id, notification_type, status, sent_at)
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null) // Only get non-deleted applications
        .order('created_at', { ascending: false });

      if (error) throw error;

      set({ applications: data || [] });
    } catch (error) {
      console.error('Load applications error:', error);
      set({ applications: [] });
    }
  },

  updateProfile: async (updates) => {
    const { user } = get();
    if (!user) return { success: false, error: 'Not authenticated' };

    const supabase = createClientComponentClient();
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      set({ profile: data });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Set profile directly (for Realtime updates)
  setProfile: (profileData) => {
    set({ profile: profileData });
  },

  // Computed getters
  isAuthenticated: () => {
    const { user } = get();
    return !!user;
  },

  getApplicationById: (id) => {
    const { applications } = get();
    return applications.find(app => app.id === id);
  },

  getApplicationsByStatus: (status) => {
    const { applications } = get();
    return applications.filter(app => app.status === status);
  },
}));

export default useApplicantAuthStore;
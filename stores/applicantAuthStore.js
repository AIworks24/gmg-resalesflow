import { create } from 'zustand';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Helper function to determine user role based on email domain
const determineUserRole = (email) => {
  if (!email) return 'user';
  const emailLower = email.toLowerCase();
  if (emailLower.endsWith('@resales.gmgva.com') || emailLower.endsWith('@gmgva.com')) {
    return 'external';
  }
  return 'user';
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
          .select('id, email, first_name, last_name, role, created_at, updated_at')
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select('id, email, first_name, last_name, role, created_at, updated_at')
            .single();
          
          if (createError) {
            console.error('Error creating profile:', createError);
          } else {
            profile = newProfile;
          }
        } else if (profileError) {
          console.error('Error loading profile:', profileError);
        }
        
        // Allow applicant roles: external, realtor, user, or no role
        if (!profile?.role || ['user', 'external', 'realtor'].includes(profile.role)) {
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
    const supabase = createClientComponentClient();
    
    try {
      // Get the base URL for email confirmation redirect
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';
      
      // Add timeout wrapper (30 seconds for signup with email sending)
      const signUpPromise = supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: `${baseUrl}/auth/callback`,
        },
      });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout - The signup request took too long. This may be due to email service delays. Please try again in a moment.')), 30000)
      );

      const { data, error } = await Promise.race([signUpPromise, timeoutPromise]);

      if (error) {
        // Improve error messages
        let errorMessage = error.message;
        if (error.message.includes('already registered') || error.message.includes('already exists') || error.message.includes('User already registered')) {
          errorMessage = 'This email is already registered. Please sign in instead.';
        } else if (error.message.includes('invalid email') || error.message.includes('Invalid email')) {
          errorMessage = 'Please enter a valid email address.';
        } else if (error.message.includes('Password')) {
          errorMessage = 'Password must be at least 6 characters long.';
        } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('timeout') || error.message.includes('upstream')) {
          errorMessage = 'The signup request timed out. This may be due to email service delays. Please wait a moment and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('over_email_send_rate_limit')) {
          errorMessage = 'Email sending rate limit exceeded. Please wait a few minutes and try again, or contact support if this persists.';
        }
        throw new Error(errorMessage);
      }

      if (data.user) {
        // Determine role based on email domain
        const userRole = determineUserRole(data.user.email);
        // Create profile for applicant
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email,
            role: userRole,
            ...userData,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
          // Don't fail signup if profile creation fails - user can still sign in
        }

        set({
          user: data.user,
          isLoading: false,
        });
        
        return { success: true, user: data.user };
      }
    } catch (error) {
      // Handle timeout and network errors specifically
      let errorMessage = error.message;
      if (error.message.includes('timeout') || error.message.includes('upstream') || error.message.includes('Request timeout')) {
        errorMessage = 'The signup request timed out. This may be due to email service delays. Please wait a moment and try again.';
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
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
          .select('id, email, first_name, last_name, role, created_at, updated_at')
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
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select('id, email, first_name, last_name, role, created_at, updated_at')
            .single();
          
          if (createError) {
            console.error('Error creating profile during sign in:', createError);
          } else {
            profile = newProfile;
          }
        } else if (profileError) {
          console.error('Error loading profile during sign in:', profileError);
        }

        if (profile?.role === 'admin' || profile?.role === 'staff') {
          // Admin/staff users should use admin portal
          await supabase.auth.signOut();
          throw new Error('Please use the admin portal to sign in.');
        }

        // Allow all applicant types: external, realtor, user, or no role
        if (profile?.role && !['user', 'external', 'realtor'].includes(profile.role)) {
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
    const supabase = createClientComponentClient();
    
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
        captchaToken: undefined
      });
      
      if (error) throw error;
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
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
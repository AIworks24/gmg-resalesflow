import { create } from 'zustand';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              role: 'external',
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create profile for applicant (role: 'user' or null)
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email,
            role: 'user',
            ...userData,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        set({
          user: data.user,
          isLoading: false,
        });
        
        return { success: true, user: data.user };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  signIn: async (email, password) => {
    const supabase = createClientComponentClient();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Check if user is not admin/staff
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, first_name, last_name, role, created_at, updated_at')
          .eq('id', data.user.id)
          .single();
        
        // If profile doesn't exist, create it
        if (profileError && profileError.code === 'PGRST116') {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: data.user.id,
              email: data.user.email,
              role: 'external',
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
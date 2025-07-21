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
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        // Only allow regular users (not admin/staff) or users without roles
        if (!profile?.role || profile.role === 'user') {
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
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profile?.role === 'admin' || profile?.role === 'staff') {
          // Admin/staff users should use admin portal
          await supabase.auth.signOut();
          throw new Error('Please use the admin portal to sign in.');
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
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      set({
        user: null,
        profile: null,
        applications: [],
        isLoading: false,
      });
      
      return { success: true };
    } catch (error) {
      console.error('Applicant sign out error:', error);
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
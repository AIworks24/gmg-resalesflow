import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load user profile to get role and additional data
  const loadUserProfile = async (userId) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userEmail = session?.user?.email;

      if (!userEmail) {
        console.error('❌ No user email found in session');
        return null;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Profile doesn't exist, create one
          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert([
              {
                id: userId,
                email: userEmail,
                role: 'external',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ])
            .select()
            .single();

          if (insertError) {
            console.error('❌ Insert error:', insertError);
            setUserRole('external');
            return null;
          } else {
            setUserRole(newProfile?.role || 'external');
            return newProfile;
          }
        } else {
          console.error('❌ Profile error:', error);
          setUserRole('external');
        }
        return null;
      }

      setUserRole(data?.role || 'external');
      return data;
    } catch (error) {
      console.error('💥 Exception in loadUserProfile:', error);
      setUserRole('external');
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('external');
        } else if (session?.user) {
          setUser(session.user);
          setIsAuthenticated(true);
          await loadUserProfile(session.user.id);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('external');
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        setUser(null);
        setIsAuthenticated(false);
        setUserRole('external');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        setIsAuthenticated(true);
        await loadUserProfile(session.user.id);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setUserRole('external');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Auth methods
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (email, password, userData = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: userData,
      },
    });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Clear state
    setUser(null);
    setIsAuthenticated(false);
    setUserRole(null);
  };

  // Get user profile data for form auto-fill
  const getUserProfileData = async () => {
    if (!user) return null;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('❌ Error fetching profile data:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('❌ Exception fetching profile data:', error);
      return null;
    }
  };

  const value = {
    user,
    userRole,
    isAuthenticated,
    isLoading,
    signIn,
    signUp,
    signOut,
    loadUserProfile,
    getUserProfileData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
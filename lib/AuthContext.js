import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';
import { 
  cacheSession, 
  getCachedSession, 
  clearCachedSession,
  cacheProfile,
  getCachedProfile,
  hasValidCachedSession
} from './sessionCache';
import { 
  getConnectionMonitor, 
  retrySupabaseOperation, 
  isConnectionError 
} from './connectionStatus';

// Helper function to determine user role based on email domain
const determineUserRole = (email) => {
  if (!email) return 'requester';
  // All users are now 'requester' regardless of email domain
  return 'requester';
};

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
  const [isConnected, setIsConnected] = useState(true);
  const [isUsingCachedSession, setIsUsingCachedSession] = useState(false);

  // Load user profile to get role and additional data
  const loadUserProfile = async (userId, useCache = true) => {
    try {
      // Try to load from Supabase first
      const result = await retrySupabaseOperation(async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const userEmail = session?.user?.email;

        if (!userEmail) {
          throw new Error('No user email found in session');
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            // Profile doesn't exist, create one
            const userRole = determineUserRole(userEmail);
            const { data: newProfile, error: insertError } = await supabase
              .from('profiles')
              .insert([
                {
                  id: userId,
                  email: userEmail,
                  role: userRole,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ])
              .select()
              .single();

            if (insertError) {
              throw insertError;
            }
            
            // Cache the new profile
            cacheProfile(newProfile);
            setUserRole(newProfile?.role || userRole);
            return newProfile;
          } else {
            throw error;
          }
        }

        // Cache the profile for offline use
        if (data) {
          cacheProfile(data);
        }
        
        // Determine role if not set, based on email domain
        const userRole = data?.role || determineUserRole(userEmail);
        setUserRole(userRole);
        return data;
      });

      if (result.success) {
        return result.data;
      }

      // If Supabase is down, try to use cached profile
      if (useCache && isConnectionError(result.error)) {
        console.warn('[AuthContext] Using cached profile due to connection error');
        const cachedProfile = getCachedProfile();
        if (cachedProfile) {
          setUserRole(cachedProfile?.role || 'requester');
          return cachedProfile;
        }
      }

      // Fallback to default role
      setUserRole('requester');
      return null;
    } catch (error) {
      console.error('💥 Exception in loadUserProfile:', error);
      
      // Try cached profile as last resort
      if (useCache) {
        const cachedProfile = getCachedProfile();
        if (cachedProfile) {
          setUserRole(cachedProfile?.role || 'requester');
          return cachedProfile;
        }
      }
      
      setUserRole('requester');
      return null;
    }
  };

  // Initialize auth state
  useEffect(() => {
    const connectionMonitor = getConnectionMonitor();
    
    // Subscribe to connection status changes
    const unsubscribeConnection = connectionMonitor.subscribe((connected) => {
      setIsConnected(connected);
    });

    // Start monitoring connection
    connectionMonitor.startMonitoring(supabase);

    const initializeAuth = async () => {
      try {
        // Try to get session from Supabase with retry
        const result = await retrySupabaseOperation(async () => {
          const {
            data: { session },
            error: sessionError,
          } = await supabase.auth.getSession();

          if (sessionError) {
            throw sessionError;
          }

          return session;
        });

        if (result.success && result.data?.user) {
          // Successfully got session from Supabase
          const session = result.data;
          setUser(session.user);
          setIsAuthenticated(true);
          setIsUsingCachedSession(false);
          
          // Cache the session for offline use
          cacheSession(session);
          
          await loadUserProfile(session.user.id);
        } else {
          // Supabase is down, try to use cached session
          console.warn('[AuthContext] Supabase unavailable, checking cached session');
          const cachedSession = getCachedSession();
          
          if (cachedSession?.user) {
            console.log('[AuthContext] Using cached session');
            setUser(cachedSession.user);
            setIsAuthenticated(true);
            setIsUsingCachedSession(true);
            await loadUserProfile(cachedSession.user.id, true);
          } else {
            // No cached session available
            setUser(null);
            setIsAuthenticated(false);
            setUserRole('requester');
            setIsUsingCachedSession(false);
          }
        }
      } catch (error) {
        console.error('❌ Auth initialization error:', error);
        
        // Last resort: try cached session
        const cachedSession = getCachedSession();
        if (cachedSession?.user) {
          console.log('[AuthContext] Using cached session after error');
          setUser(cachedSession.user);
          setIsAuthenticated(true);
          setIsUsingCachedSession(true);
          await loadUserProfile(cachedSession.user.id, true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('requester');
          setIsUsingCachedSession(false);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Set up auth state listener
    let subscription;
    try {
      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          setIsAuthenticated(true);
          setIsUsingCachedSession(false);
          
          // Cache the session
          cacheSession(session);
          
          await loadUserProfile(session.user.id);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setUserRole('requester');
          setIsUsingCachedSession(false);
          clearCachedSession();
        }
      });
      subscription = authSubscription;
    } catch (error) {
      console.warn('[AuthContext] Failed to set up auth state listener:', error);
    }

    return () => {
      unsubscribeConnection();
      connectionMonitor.stopMonitoring();
      subscription?.unsubscribe();
    };
  }, []);

  // Auth methods
  const signIn = async (email, password) => {
    const result = await retrySupabaseOperation(async () => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      
      // Cache the session on successful login
      if (data?.session) {
        cacheSession(data.session);
      }
      
      return data;
    });

    if (!result.success) {
      if (isConnectionError(result.error)) {
        throw new Error('Unable to connect to authentication service. Please check your internet connection and try again.');
      }
      throw result.error;
    }

    return result.data;
  };

  const signUp = async (email, password, userData = {}) => {
    const result = await retrySupabaseOperation(async () => {
      // Get the base URL for email confirmation redirect
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: `${baseUrl}/auth/callback`,
        },
      });
      if (error) throw error;
      
      // Cache the session if available
      if (data?.session) {
        cacheSession(data.session);
      }
      
      return data;
    });

    if (!result.success) {
      if (isConnectionError(result.error)) {
        throw new Error('Unable to connect to authentication service. Please check your internet connection and try again.');
      }
      throw result.error;
    }

    return result.data;
  };

  const signOut = async () => {
    try {
      const result = await retrySupabaseOperation(async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        return true;
      });

      // Clear state and cache regardless of Supabase connection
      setUser(null);
      setIsAuthenticated(false);
      setUserRole(null);
      clearCachedSession();
      
      if (!result.success && !isConnectionError(result.error)) {
        throw result.error;
      }
    } catch (error) {
      // Even if sign out fails, clear local state
      setUser(null);
      setIsAuthenticated(false);
      setUserRole(null);
      clearCachedSession();
      
      if (!isConnectionError(error)) {
        throw error;
      }
    }
  };

  const resetPassword = async (email) => {
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
        return; // Success
      } else {
        throw new Error(data.error || data.message || 'Failed to send password reset email');
      }
    } catch (error) {
      console.error('Error requesting password reset:', error);
      throw error;
    }
  };

  // Get user profile data for form auto-fill
  const getUserProfileData = async () => {
    if (!user) return null;
    
    try {
      const result = await retrySupabaseOperation(async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        return data;
      });

      if (result.success) {
        // Cache the profile
        if (result.data) {
          cacheProfile(result.data);
        }
        return result.data;
      }

      // If connection error, try cached profile
      if (isConnectionError(result.error)) {
        const cachedProfile = getCachedProfile();
        if (cachedProfile) {
          return cachedProfile;
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Exception fetching profile data:', error);
      
      // Try cached profile as fallback
      const cachedProfile = getCachedProfile();
      return cachedProfile || null;
    }
  };

  const value = {
    user,
    userRole,
    isAuthenticated,
    isLoading,
    isConnected,
    isUsingCachedSession,
    signIn,
    signUp,
    signOut,
    resetPassword,
    loadUserProfile,
    getUserProfileData,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
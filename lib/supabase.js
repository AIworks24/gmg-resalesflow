import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// Get environment-specific Supabase URL and key
const isDevelopment = process.env.NODE_ENV === 'development'

// Add clear environment indicator
console.log('🌟 CURRENT ENVIRONMENT:', isDevelopment ? 'DEVELOPMENT' : 'PRODUCTION')
console.log('====================================')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Debug logging
console.log('Supabase Config Debug:')
console.log('Environment:', process.env.NODE_ENV);
console.log('URL:', supabaseUrl)
console.log('Key exists:', !!supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('URL:', supabaseUrl)
  console.error('Key:', supabaseAnonKey ? 'EXISTS' : 'MISSING')
}

// Add environment warning if in production
if (!isDevelopment) {
  console.warn('⚠️ WARNING: Running in PRODUCTION mode locally!')
  console.warn('Make sure to run with `npm run dev` for local development')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey,
    },
  },
})

// Test connection immediately
const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('hoa_properties')
      .select('id, name')
      .limit(1)
    
    if (error) {
      console.error('Supabase connection test failed:', error)
    } else {
      console.log('Supabase connection successful')
    }
  } catch (err) {
    console.error('Supabase connection error:', err)
  }
}

// Run test on load
if (typeof window !== 'undefined') {
  testConnection()
}

// Auth helpers
export const signUp = async (email, password, userData) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: userData
    }
  })
  return { data, error }
}

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user
}

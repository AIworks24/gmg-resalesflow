import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Supabase client singleton
// createClientComponentClient() already returns a singleton per browser context
// We just need to call it once to get the instance
let supabaseInstance = null

export const getSupabaseClient = () => {
  // createClientComponentClient() is already a singleton, but we'll cache it
  // Only create in browser context to avoid SSR issues
  if (typeof window !== 'undefined' && !supabaseInstance) {
    supabaseInstance = createClientComponentClient()
  }
  return supabaseInstance
}

// Export a getter for backward compatibility (lazy initialization)
export const supabase = new Proxy({}, {
  get(target, prop) {
    const client = getSupabaseClient()
    if (!client) {
      throw new Error('Supabase client can only be accessed in browser context')
    }
    return client[prop]
  }
})

// Auth helpers - these will only work in browser context
export const signUp = async (email, password, userData) => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase client not available')
  
  // Get the base URL for email confirmation redirect
  const baseUrl = typeof window !== 'undefined' 
    ? window.location.origin 
    : process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      data: userData,
      emailRedirectTo: `${baseUrl}/auth/callback`,
    }
  })
  return { data, error }
}

export const signIn = async (email, password) => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase client not available')
  
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  })
  return { data, error }
}

export const signOut = async () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase client not available')
  
  const { error } = await client.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase client not available')
  
  const { data: { session } } = await client.auth.getSession()
  return session?.user
}

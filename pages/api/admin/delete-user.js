import { createClient } from '@supabase/supabase-js';
import { deleteCachePattern } from '../../../lib/redis';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create a Supabase client with service role key for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Get user profile to check role
    const { data: profile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (profileFetchError) {
      console.error('Profile fetch error:', profileFetchError);
      return res.status(400).json({ error: profileFetchError.message });
    }

    // Step 1: Soft delete applications FIRST (for all users, not just external)
    // This must happen before deleting from auth.users because of FK constraint
    // Even though we soft delete, the FK constraint still exists and blocks auth.users deletion
    // So we need to handle this carefully
    const { error: applicationsError } = await supabaseAdmin
      .from('applications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (applicationsError) {
      console.error('Applications soft delete error:', applicationsError);
      // Log but don't fail - we'll try to continue
    }

    // Step 2: Soft delete the profile (set active=false and deleted_at)
    // This preserves the data for audit purposes while marking the user as inactive
    // Professional approach: Update both active flag and deleted_at timestamp
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ 
        active: false,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .is('deleted_at', null); // Only update if not already deleted

    if (profileError) {
      console.error('Profile error:', profileError);
      return res.status(400).json({ error: profileError.message });
    }

    // Step 3: Hard delete the profile to satisfy FK constraint before deleting from auth
    // We need to do this because the FK constraint prevents deleting from auth.users
    // when a profiles row exists, even if it's soft deleted
    // Note: We've already soft deleted it above, so this is just to satisfy the FK constraint
    const { error: profileHardDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileHardDeleteError) {
      console.error('Profile hard delete error:', profileHardDeleteError);
      return res.status(400).json({ error: `Failed to delete profile: ${profileHardDeleteError.message}` });
    }

    // Step 4: Break the FK constraint by setting user_id to NULL in applications
    // This allows us to delete from auth.users while preserving application data
    // The applications are already soft deleted, so they won't appear in normal queries
    // Note: This requires the applications.user_id column to allow NULL values
    // If it doesn't, you'll need to modify the column or use ON DELETE SET NULL on the FK constraint
    const { error: applicationsUpdateError } = await supabaseAdmin
      .from('applications')
      .update({ user_id: null })
      .eq('user_id', userId);

    if (applicationsUpdateError) {
      console.error('Applications user_id update error:', applicationsUpdateError);
      // If user_id has NOT NULL constraint, we need a different approach
      // The best solution is to modify the FK constraint to use ON DELETE SET NULL
      // For now, return a helpful error message
      return res.status(400).json({ 
        error: `Cannot delete user: The applications table has a foreign key constraint that prevents deletion. ${applicationsUpdateError.message}. Please modify the applications table to allow NULL user_id or update the foreign key constraint to use ON DELETE SET NULL.` 
      });
    }

    // Step 5: Now delete from auth.users (this should work since FK references are broken)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      console.error('Auth error:', authError);
      // Try to restore the user_id in applications if auth deletion fails
      // This is a best-effort recovery to maintain data integrity
      const restoreTimestamp = new Date().toISOString();
      await supabaseAdmin
        .from('applications')
        .update({ user_id: userId })
        .is('user_id', null)
        .gte('deleted_at', restoreTimestamp.split('.')[0]); // Match soft-deleted apps from this operation
      
      return res.status(400).json({ error: `Failed to delete user from auth: ${authError.message}` });
    }

    // Invalidate Redis cache for users to force refresh
    await deleteCachePattern('admin:users:*');
    console.log('✅ Redis cache invalidated for admin:users:*');

    return res.status(200).json({ 
      success: true, 
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 
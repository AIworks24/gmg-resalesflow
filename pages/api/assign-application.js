import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and is admin/staff
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId, assignedTo } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Update the application's assigned_to field
    const { error } = await supabase
      .from('applications')
      .update({ 
        assigned_to: assignedTo || null, // null to unassign
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (error) {
      throw error;
    }

    return res.status(200).json({ 
      success: true, 
      message: assignedTo ? `Application assigned to ${assignedTo}` : 'Application unassigned'
    });

  } catch (error) {
    console.error('Failed to assign application:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to assign application' 
    });
  }
}
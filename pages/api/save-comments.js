import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Check authentication
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

    const { applicationId, comments } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Update the application with comments
    const { error } = await supabase
      .from('applications')
      .update({
        comments: comments || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', applicationId);

    if (error) {
      throw error;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Comments saved successfully'
    });

  } catch (error) {
    console.error('Failed to save comments:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to save comments' 
    });
  }
}
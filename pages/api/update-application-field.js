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

    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId, field, value } = req.body;

    if (!applicationId || !field) {
      return res.status(400).json({ error: 'Application ID and field are required' });
    }

    // Validate field name to prevent SQL injection
    const allowedFields = ['include_property_documents'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ error: 'Invalid field name' });
    }

    // Update the application field
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        [field]: value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({
      success: true,
      message: 'Field updated successfully',
    });
  } catch (error) {
    console.error('Error updating application field:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
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

    const { propertyGroupId, assignedTo } = req.body;

    if (!propertyGroupId) {
      return res.status(400).json({ error: 'Property group ID is required' });
    }

    const { error } = await supabase
      .from('application_property_groups')
      .update({
        assigned_to: assignedTo || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', propertyGroupId);

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: assignedTo ? `Property assigned to ${assignedTo}` : 'Property unassigned'
    });
  } catch (error) {
    console.error('Failed to assign property group:', error);
    return res.status(500).json({
      error: error.message || 'Failed to assign property group'
    });
  }
}

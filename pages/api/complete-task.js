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

    // Use email lookup to match other admin endpoints and avoid profile id mismatches
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId, taskName, propertyGroupId } = req.body;

    if (!applicationId || !taskName) {
      return res.status(400).json({ error: 'Application ID and task name are required' });
    }

    // Validate task name
    const validTasks = ['inspection_form', 'resale_certificate', 'pdf', 'email', 'settlement_form'];
    if (!validTasks.includes(taskName)) {
      return res.status(400).json({ error: 'Invalid task name' });
    }

    // For settlement_form with property_group_id, update the form in property_owner_forms
    if (taskName === 'settlement_form' && propertyGroupId) {
      // Update the settlement form status in property_owner_forms
      let query = supabase
        .from('property_owner_forms')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('application_id', applicationId)
        .eq('form_type', 'settlement_form')
        .eq('property_group_id', propertyGroupId);
      
      const { error: formError } = await query;
      
      if (formError) {
        throw formError;
      }
      
      // Also update application updated_at
      await supabase
        .from('applications')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', applicationId);
      
      return res.status(200).json({ 
        success: true, 
        message: `${taskName} task marked as completed for property group`
      });
    }

    // Prepare update object
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Set the appropriate completion field
    const completionField = `${taskName}_completed_at`;
    updateData[completionField] = new Date().toISOString();

    // Update the application
    const { error } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', applicationId);

    if (error) {
      throw error;
    }

    return res.status(200).json({ 
      success: true, 
      message: `${taskName} task marked as completed`
    });

  } catch (error) {
    console.error('Failed to complete task:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to complete task' 
    });
  }
}
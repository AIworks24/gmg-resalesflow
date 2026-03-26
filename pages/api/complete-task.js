import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { applicationId, taskName, propertyGroupId } = req.body;
  console.log(`[complete-task] Called: appId=${applicationId}, task=${taskName}, groupId=${propertyGroupId || 'none'}`);

  try {
    // --- Auth check ---
    const supabaseAuth = createPagesServerClient({ req, res });
    const { data: { session }, error: sessionError } = await supabaseAuth.auth.getSession();

    if (sessionError) {
      console.error('[complete-task] Session error:', sessionError);
    }

    if (!session) {
      console.error('[complete-task] No session found');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log(`[complete-task] Session OK: user=${session.user.id}`);

    const { data: profile, error: profileError } = await supabaseAuth
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', session.user.id)
      .single();

    if (profileError) {
      console.error('[complete-task] Profile error:', profileError);
    }

    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      console.error(`[complete-task] Forbidden: role=${profile?.role}`);
      return res.status(403).json({ error: 'Forbidden' });
    }

    console.log(`[complete-task] Auth OK: role=${profile.role}`);

    // --- Service role client ---
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.error('[complete-task] SUPABASE_SERVICE_ROLE_KEY is not set!');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey
    );

    if (!applicationId || !taskName) {
      return res.status(400).json({ error: 'Application ID and task name are required' });
    }

    const validTasks = ['inspection_form', 'resale_certificate', 'pdf', 'email', 'settlement_form'];
    if (!validTasks.includes(taskName)) {
      return res.status(400).json({ error: 'Invalid task name' });
    }

    const now = new Date().toISOString();

    // --- Audit trail setup ---
    const adminName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin';
    const taskLabels = {
      inspection_form: 'Property Inspection Form',
      resale_certificate: 'Resale Certificate',
      pdf: 'PDF',
      email: 'Email',
      settlement_form: 'Settlement Form',
    };
    const taskLabel = taskLabels[taskName] || taskName;

    const [appNotesResult, groupResult] = await Promise.all([
      supabase.from('applications').select('notes').eq('id', applicationId).single(),
      propertyGroupId
        ? supabase.from('application_property_groups').select('property_name').eq('id', propertyGroupId).single()
        : Promise.resolve({ data: null }),
    ]);

    const currentNotes   = appNotesResult.data?.notes || '';
    const propertyName   = groupResult.data?.property_name || null;
    const propertySuffix = propertyName ? ` for ${propertyName}` : '';
    const auditNote      = `[${now}] ${taskLabel}${propertySuffix} completed by ${adminName}.`;
    const notesWithAudit = currentNotes ? `${currentNotes}\n\n${auditNote}` : auditNote;

    // --- Per-property-group updates (MC applications) ---

    if (taskName === 'inspection_form' && propertyGroupId) {
      console.log(`[complete-task] Updating inspection for group ${propertyGroupId}`);
      const { error: groupError } = await supabase
        .from('application_property_groups')
        .update({ inspection_status: 'completed', inspection_completed_at: now, updated_at: now })
        .eq('id', propertyGroupId);

      if (groupError) throw groupError;

      await supabase.from('applications').update({ updated_at: now, notes: notesWithAudit }).eq('id', applicationId);
      const application = await fetchFullApplication(supabase, applicationId);
      console.log(`[complete-task] Done (group inspection). inspection_form_completed_at=${application?.inspection_form_completed_at}`);
      return res.status(200).json({ success: true, completedAt: now, application });
    }

    if (taskName === 'resale_certificate' && propertyGroupId) {
      console.log(`[complete-task] Updating resale for group ${propertyGroupId}`);
      const { error: groupError } = await supabase
        .from('application_property_groups')
        .update({ status: 'completed', updated_at: now })
        .eq('id', propertyGroupId);

      if (groupError) throw groupError;

      await supabase.from('applications').update({ updated_at: now, notes: notesWithAudit }).eq('id', applicationId);
      const application = await fetchFullApplication(supabase, applicationId);
      console.log(`[complete-task] Done (group resale). resale_certificate_completed_at=${application?.resale_certificate_completed_at}`);
      return res.status(200).json({ success: true, completedAt: now, application });
    }

    if (taskName === 'settlement_form' && propertyGroupId) {
      console.log(`[complete-task] Updating settlement form for group ${propertyGroupId}`);
      const { error: formError } = await supabase
        .from('property_owner_forms')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('application_id', applicationId)
        .eq('form_type', 'settlement_form')
        .eq('property_group_id', propertyGroupId);

      if (formError) throw formError;

      await supabase.from('applications').update({ updated_at: now, notes: notesWithAudit }).eq('id', applicationId);
      const application = await fetchFullApplication(supabase, applicationId);
      console.log(`[complete-task] Done (group settlement).`);
      return res.status(200).json({ success: true, completedAt: now, application });
    }

    // --- Standard (non-group) updates ---

    const completionField = `${taskName}_completed_at`;
    console.log(`[complete-task] Standard update: field=${completionField}, appId=${applicationId}`);

    // 1. Update the application
    const { data: updatedApp, error: updateError } = await supabase
      .from('applications')
      .update({ [completionField]: now, updated_at: now, notes: notesWithAudit })
      .eq('id', applicationId)
      .select(`id, ${completionField}, updated_at`)
      .single();

    if (updateError) {
      console.error(`[complete-task] DB UPDATE failed:`, updateError);
      throw updateError;
    }

    if (!updatedApp) {
      console.error(`[complete-task] No rows returned after update — app ${applicationId} not found?`);
      return res.status(404).json({ error: 'Application not found' });
    }

    console.log(`[complete-task] DB UPDATE success:`, JSON.stringify(updatedApp));

    // 2. Also update property_owner_forms
    const formTypeMap = { 'inspection_form': 'inspection_form', 'resale_certificate': 'resale_certificate' };
    const formType = formTypeMap[taskName];
    if (formType) {
      const { data: matched, error: formErr } = await supabase
        .from('property_owner_forms')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('application_id', applicationId)
        .eq('form_type', formType)
        .is('property_group_id', null)
        .select('id');

      console.log(`[complete-task] Forms update (IS NULL): matched=${matched?.length || 0}, error=${formErr?.message || 'none'}`);

      if (!matched || matched.length === 0) {
        const { data: fallbackMatched, error: fallbackErr } = await supabase
          .from('property_owner_forms')
          .update({ status: 'completed', completed_at: now, updated_at: now })
          .eq('application_id', applicationId)
          .eq('form_type', formType)
          .select('id');

        console.log(`[complete-task] Forms update (fallback): matched=${fallbackMatched?.length || 0}, error=${fallbackErr?.message || 'none'}`);
      }
    }

    // 3. Re-fetch the full application (same service role connection = guaranteed consistent read)
    const application = await fetchFullApplication(supabase, applicationId);
    console.log(`[complete-task] Final read: ${completionField}=${application?.[completionField]}, forms=${application?.property_owner_forms?.map(f => f.form_type + ':' + f.status).join(', ')}`);

    return res.status(200).json({ success: true, completedAt: now, application });

  } catch (error) {
    console.error('[complete-task] CAUGHT ERROR:', error);
    return res.status(500).json({ error: error.message || 'Failed to complete task' });
  }
}

async function fetchFullApplication(supabase, applicationId) {
  const { data, error } = await supabase
    .from('applications')
    .select(`
      *,
      hoa_properties(name, property_owner_email, property_owner_name, is_multi_community),
      property_owner_forms(id, form_type, status, completed_at, form_data, response_data, property_group_id),
      notifications(id, notification_type, status, sent_at),
      application_property_groups(id, property_id, property_name, property_location, property_owner_email, assigned_to, is_primary, status, inspection_status, inspection_completed_at,
        pdf_url, pdf_status, pdf_completed_at, email_status, email_completed_at, updated_at,
        hoa_properties(id, name, location, property_owner_email, property_owner_name, default_assignee_email)
      )
    `)
    .eq('id', applicationId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.warn('[complete-task] fetchFullApplication error:', error);
    return null;
  }
  return data;
}

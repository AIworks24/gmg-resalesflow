import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and has proper role
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

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application data with settlement form (including pdf_url from applications table)
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(
        `
        *,
        pdf_url,
        hoa_properties(name, property_owner_email, property_owner_name, location),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data, pdf_url)
      `
      )
      .eq('id', applicationId)
      .single();

    if (appError) {
      throw appError;
    }

    // Get settlement form
    const settlementForm = application.property_owner_forms?.find(
      (f) => f.form_type === 'settlement_form'
    );

    if (!settlementForm || settlementForm.status !== 'completed') {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }

    // Check if PDF has already been generated
    // Try property_owner_forms.pdf_url first, then fallback to applications.pdf_url
    // This handles cases where PDF was generated before the migration ran
    let publicUrl = settlementForm.pdf_url || application.pdf_url;
    
    if (!publicUrl) {
      return res.status(400).json({ error: 'PDF has not been generated yet. Please generate the PDF first.' });
    }

    // If PDF URL exists in applications but not in property_owner_forms, update it for future use
    if (!settlementForm.pdf_url && application.pdf_url && settlementForm.id) {
      try {
        await supabase
          .from('property_owner_forms')
          .update({ pdf_url: application.pdf_url })
          .eq('id', settlementForm.id);
      } catch (updateError) {
        // If column doesn't exist yet (migration not run), that's okay - we'll use application.pdf_url
        console.warn('Could not update property_owner_forms.pdf_url (migration may not be run yet):', updateError);
      }
    }

    const formData = settlementForm.response_data || settlementForm.form_data;
    
    // Determine document type based on property state
    const propertyState = application.hoa_properties?.location?.toUpperCase().includes('VA') ? 'VA' : 'NC';
    const documentType = propertyState === 'VA' 
      ? 'Dues Request - Escrow Instructions' 
      : 'Statement of Unpaid Assessments';
    
    // Extract filename from URL and clean it up (remove timestamp prefix)
    const urlParts = publicUrl.split('/');
    let existingFilename = urlParts[urlParts.length - 1] || `${documentType.replace(/[^a-zA-Z0-9]/g, '_')}_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    // Remove leading timestamp pattern (e.g., "1762187746441-" from filename)
    // Pattern: digits followed by hyphen at the start
    existingFilename = existingFilename.replace(/^\d+-/, '');
    
    // Prepare download links using existing PDF
    const downloadLinks = [{
      filename: existingFilename,
      downloadUrl: publicUrl,
      type: 'pdf',
      description: documentType
    }];

    // Send email with PDF - use custom subject and content for settlement
    const { sendApprovalEmail } = await import('../../lib/emailService');
    
    await sendApprovalEmail({
      to: application.submitter_email,
      applicationId: applicationId,
      propertyAddress: application.property_address,
      pdfUrl: publicUrl,
      submitterName: application.submitter_name || 'Valued Customer',
      hoaName: application.hoa_properties?.name || 'HOA',
      downloadLinks: downloadLinks,
      // Custom settlement-specific email content
      isSettlement: true,
      customSubject: `Thank You Submitting Your Request For ${application.property_address}`,
      customTitle: 'Thank you for submitting in your request',
      customMessage: `Your document(s) for <strong>${application.property_address}</strong> in <strong>${application.hoa_properties?.name || 'HOA'}</strong> are now ready for download.`,
      comments: application.comments || null
    });

    // Notification creation removed - no longer needed

    // Mark email task as completed
    const timestamp = new Date().toISOString();
    const { error: emailTaskError } = await supabase
      .from('applications')
      .update({
        email_completed_at: timestamp,
        updated_at: timestamp
      })
      .eq('id', applicationId);

    if (emailTaskError) {
      console.error('Failed to mark email task as completed:', emailTaskError);
      // Don't throw - email was sent successfully
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in send-settlement-approval-email:', error);
    return res.status(500).json({ error: error.message });
  }
}

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

// Helper function to format property address with unit number
const formatPropertyAddress = (address, unitNumber) => {
  if (!address) return '';
  if (!unitNumber || unitNumber === 'N/A' || unitNumber.trim() === '') return address;
  return `${address} ${unitNumber}`;
};

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

    const { applicationId, propertyGroupId } = req.body;
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
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data, pdf_url, property_group_id)
      `
      )
      .eq('id', applicationId)
      .single();

    if (appError) {
      throw appError;
    }

    // Get settlement form - filter by property_group_id for multi-community
    let settlementForm;
    if (propertyGroupId) {
      // Multi-community: find settlement form for this specific property group
      settlementForm = application.property_owner_forms?.find(
        (f) => f.form_type === 'settlement_form' && f.property_group_id === propertyGroupId
      );
    } else {
      // Single property: find settlement form without property_group_id
      settlementForm = application.property_owner_forms?.find(
        (f) => f.form_type === 'settlement_form' && !f.property_group_id
      );
    }

    if (!settlementForm || settlementForm.status !== 'completed') {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }

    // Check if PDF has already been generated
    // For multi-community, check property group PDF URL first, then form PDF URL, then application PDF URL
    let publicUrl;
    if (propertyGroupId) {
      // Get the property group to check its PDF URL
      const { data: propertyGroup } = await supabase
        .from('application_property_groups')
        .select('pdf_url')
        .eq('id', propertyGroupId)
        .eq('application_id', applicationId)
        .single();
      
      publicUrl = propertyGroup?.pdf_url || settlementForm.pdf_url || application.pdf_url;
    } else {
      // Single property: try form PDF URL first, then application PDF URL
      publicUrl = settlementForm.pdf_url || application.pdf_url;
    }
    
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
    
    // Get property group information if this is a multi-community application
    let propertyGroupData = null;
    let propertyAddress = formatPropertyAddress(application.property_address, application.unit_number);
    let hoaName = application.hoa_properties?.name || 'HOA';
    let propertyLocation = application.hoa_properties?.location;
    
    if (propertyGroupId) {
      // Load property group data to get the specific property's information
      const { data: propertyGroup, error: groupError } = await supabase
        .from('application_property_groups')
        .select(`
          *,
          hoa_properties(id, name, location)
        `)
        .eq('id', propertyGroupId)
        .eq('application_id', applicationId)
        .single();
      
      if (!groupError && propertyGroup) {
        propertyGroupData = propertyGroup;
        // Use property group's property name and HOA name
        propertyAddress = propertyGroup.property_name || propertyGroup.hoa_properties?.name || application.property_address;
        hoaName = propertyGroup.hoa_properties?.name || propertyGroup.property_name || application.hoa_properties?.name || 'HOA';
        propertyLocation = propertyGroup.property_location || propertyGroup.hoa_properties?.location || application.hoa_properties?.location;
      }
    }
    
    // Determine document type based on property state (use property group location if available)
    // Check property group location first, then fallback to application location
    // For multi-community, use the specific property group's location
    const locationToCheck = propertyLocation || propertyGroupData?.property_location || propertyGroupData?.hoa_properties?.location || application.hoa_properties?.location;
    const isVA = locationToCheck?.toUpperCase().includes('VA') || locationToCheck?.toUpperCase().includes('VIRGINIA');
    const propertyState = isVA ? 'VA' : 'NC';
    const documentType = propertyState === 'VA' 
      ? 'Dues Request - Escrow Instructions' 
      : 'Statement of Unpaid Assessments';
    
    // Extract filename from URL and clean it up (remove timestamp prefix and query parameters)
    const urlParts = publicUrl.split('/');
    let existingFilename = urlParts[urlParts.length - 1] || `${documentType.replace(/[^a-zA-Z0-9]/g, '_')}_${propertyAddress.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    // Remove query parameters (everything after ?)
    existingFilename = existingFilename.split('?')[0];
    // Remove URL fragments (everything after #)
    existingFilename = existingFilename.split('#')[0];
    
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

    // For Settlement - NC applications ONLY, automatically include all property documents (excluding Public Offering Statement)
    // VA settlements are FREE and should NOT include property documents
    // Use property group's property_id if available, otherwise fallback to application's hoa_property_id
    let propertyIdForDocs = application.hoa_property_id;
    if (propertyGroupData?.property_id) {
      propertyIdForDocs = propertyGroupData.property_id;
    }
    
    // Only include property documents for NC settlements, NOT for VA
    // VA settlements are FREE by law and should NEVER include property documents
    // Explicitly check that property state is NC and NOT VA before including documents
    // This ensures VA properties (including in multi-community) never get property documents
    // Double-check location to prevent any edge cases
    const isDefinitelyVA = locationToCheck?.toUpperCase().includes('VA') || locationToCheck?.toUpperCase().includes('VIRGINIA');
    if (propertyState === 'NC' && propertyIdForDocs && !isDefinitelyVA) {
      try {
        console.log('Including property documents for NC settlement, property ID:', propertyIdForDocs, 'Location:', locationToCheck);
        
        // Get property documents from property_documents table (excluding Public Offering Statement)
        const { data: propertyDocuments, error: docsError } = await supabase
          .from('property_documents')
          .select('*')
          .eq('property_id', propertyIdForDocs)
          .neq('document_key', 'public_offering_statement') // Exclude Public Offering Statement
          .not('file_path', 'is', null); // Only documents with files

        if (docsError) {
          console.error('Error fetching property documents:', docsError);
        } else if (propertyDocuments && propertyDocuments.length > 0) {
          // Sort documents by email order (default order, ignores property-specific order)
          const { sortDocumentsByEmailOrder } = await import('../../lib/documentOrder');
          const sortedDocuments = sortDocumentsByEmailOrder(propertyDocuments);
          
          console.log('Found', sortedDocuments.length, 'property documents to include');
          
          const EXPIRY_30_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
          
          for (const doc of sortedDocuments) {
            try {
              // Create 30-day signed URL for each document
              const { data: urlData, error: docUrlError } = await supabase.storage
                .from('bucket0')
                .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);

              if (docUrlError) {
                console.error(`Error creating signed URL for ${doc.document_name}:`, docUrlError);
                continue;
              }

              // Use display_name if available, otherwise use document_name
              const displayName = doc.display_name || doc.document_name || doc.file_name || 'Property Document';
              
              downloadLinks.push({
                filename: displayName,
                downloadUrl: urlData.signedUrl,
                type: 'document',
                description: doc.document_name || 'Property Supporting Document',
                size: 'Unknown' // Size not stored in property_documents table
              });
              
              console.log('Added property document:', displayName);
            } catch (error) {
              console.error(`Failed to create download link for ${doc.document_name}:`, error);
            }
          }
        } else {
          console.log('No property documents found (excluding Public Offering Statement)');
        }
      } catch (error) {
        console.error('Error adding property documents for NC settlement:', error);
        // Don't fail the email if property documents can't be added
      }
    }

    // Send email with PDF - use custom subject and content for settlement
    // Use property group data if available (already loaded above)
    const { sendApprovalEmail } = await import('../../lib/emailService');
    
    // Parse buyer emails from comma-separated string or single email
    const parseBuyerEmails = (buyerEmail) => {
      if (!buyerEmail) return [];
      // Check if it's already a comma-separated string
      if (buyerEmail.includes(',')) {
        return buyerEmail.split(',').map(email => email.trim()).filter(email => email);
      }
      return [buyerEmail.trim()].filter(email => email);
    };

    const buyerEmails = parseBuyerEmails(application.buyer_email);

    // Wrap email sending in try-catch so errors don't interrupt the process
    try {
      await sendApprovalEmail({
        to: application.submitter_email,
        applicationId: applicationId,
        propertyAddress: propertyAddress,
        pdfUrl: publicUrl,
        submitterName: application.submitter_name || 'Valued Customer',
        hoaName: hoaName,
        downloadLinks: downloadLinks,
        // Custom settlement-specific email content
        isSettlement: true,
        customSubject: `Your Settlement Documents for ${propertyAddress} are Ready`,
        customTitle: 'Your Settlement Documents are Ready!',
        customMessage: `Your settlement documents for <strong>${propertyAddress}</strong> in <strong>${hoaName}</strong> have been processed and are ready for download.`,
        comments: application.comments || null,
        cc: buyerEmails // Include buyer emails as CC recipients
      });
      if (buyerEmails.length > 0) {
        console.log(`Settlement approval email sent successfully to submitter: ${application.submitter_email} (CC: ${buyerEmails.join(', ')})`);
      } else {
        console.log('Settlement approval email sent successfully to submitter');
      }
    } catch (emailError) {
      console.error('Failed to send settlement approval email:', emailError);
      // Don't throw - continue with status updates even if email fails
      // The process should complete successfully even if email delivery fails
    }

    // Notification creation removed - no longer needed

    // Mark email task as completed
    const timestamp = new Date().toISOString();
    
    // For multi-community, update the property group instead of application-level
    if (propertyGroupId) {
      // Update the specific property group with email status
      const { error: groupUpdateError } = await supabase
        .from('application_property_groups')
        .update({
          email_status: 'completed',
          email_completed_at: timestamp,
          updated_at: timestamp
        })
        .eq('id', propertyGroupId)
        .eq('application_id', applicationId);

      if (groupUpdateError) {
        console.error('Failed to mark email task as completed for property group:', groupUpdateError);
        // Don't throw - email was sent successfully
      }
    } else {
      // Single property: update application with email completion
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
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error in send-settlement-approval-email:', error);
    return res.status(500).json({ error: error.message });
  }
}

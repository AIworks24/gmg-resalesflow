import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application details with property information
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Use edited file if available, otherwise use completed file
    const filePath = application.lender_questionnaire_edited_file_path || application.lender_questionnaire_completed_file_path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'Completed or edited lender questionnaire form must be uploaded first' });
    }

    // Get signed URL for the file (edited or completed)
    const EXPIRY_30_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('bucket0')
      .createSignedUrl(filePath, EXPIRY_30_DAYS); // 30 days expiry

    if (urlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({ error: 'Failed to generate download link for form' });
    }

    // Prepare download links - start with the completed lender questionnaire
    let downloadLinks = [{
      filename: `Lender_Questionnaire_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      downloadUrl: signedUrlData.signedUrl,
      type: 'pdf',
      description: 'Completed Lender Questionnaire'
    }];

    // If include_property_documents is checked, add property documents (excluding Public Offering Statement)
    if (application.include_property_documents && application.hoa_property_id) {
      try {
        console.log('Including property documents for property ID:', application.hoa_property_id);
        
        // Get property documents from property_documents table (excluding Public Offering Statement)
        const { data: propertyDocuments, error: docsError } = await supabase
          .from('property_documents')
          .select('*')
          .eq('property_id', application.hoa_property_id)
          .neq('document_key', 'public_offering_statement') // Exclude Public Offering Statement
          .not('file_path', 'is', null); // Only documents with files

        if (docsError) {
          console.error('Error fetching property documents:', docsError);
        } else if (propertyDocuments && propertyDocuments.length > 0) {
          // Sort documents by email order (default order, ignores property-specific order)
          const { sortDocumentsByEmailOrder } = await import('../../lib/documentOrder');
          const sortedDocuments = sortDocumentsByEmailOrder(propertyDocuments);
          
          console.log('Found', sortedDocuments.length, 'property documents to include');
          
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
        console.error('Error creating property document download links:', error);
        // Don't fail the email if property documents can't be added
      }
    }

    // Use sendApprovalEmail from emailService for consistent email formatting
    const { sendApprovalEmail } = await import('../../lib/emailService');
    
    // Wrap email sending in try-catch so errors don't interrupt the process
    try {
      await sendApprovalEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name || 'Valued Customer',
        propertyAddress: application.property_address,
        hoaName: application.hoa_properties?.name || 'HOA',
        pdfUrl: signedUrlData.signedUrl,
        applicationId: applicationId,
        downloadLinks: downloadLinks,
        customSubject: `Lender Questionnaire Ready - ${application.property_address}`,
        customTitle: 'Lender Questionnaire Ready',
        customMessage: `Your lender questionnaire for <strong>${application.property_address}</strong> has been completed and is ready for download.`,
        comments: application.comments || null
      });
      console.log('Lender questionnaire email sent successfully');
    } catch (emailError) {
      console.error('Failed to send lender questionnaire email:', emailError);
      // Don't throw - continue with status updates even if email fails
      // The process should complete successfully even if email delivery fails
    }

    // Notification creation removed - no longer needed

    // Update application status
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        status: 'approved',
        email_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Failed to update application status:', updateError);
      // Don't fail the request if status update fails
    }

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Error in send-lender-questionnaire-email:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


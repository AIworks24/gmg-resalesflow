import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendApprovalEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and is admin
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

    const { applicationId, propertyGroupId, propertyName, pdfUrl } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Check if this is a property-specific email
    const isPropertySpecific = propertyGroupId && propertyName && pdfUrl;

    // Get application data with forms
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(
        `
        *,
        hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data)
      `
      )
      .eq('id', applicationId)
      .single();

    if (appError) {
      throw appError;
    }

    // Check if this is a settlement application
    const isSettlementApp = application.submitter_type === 'settlement' || 
                            application.application_type?.startsWith('settlement');

    // If it's a settlement application, route to settlement email API
    if (isSettlementApp) {
      // Import and call the settlement email handler directly
      const { default: sendSettlementEmailHandler } = await import('./send-settlement-approval-email');
      return await sendSettlementEmailHandler(req, res);
    }

    // Check if PDF exists (either from application or property-specific)
    const pdfToUse = isPropertySpecific ? pdfUrl : application.pdf_url;
    if (!pdfToUse) {
      return res.status(400).json({ error: 'PDF has not been generated yet' });
    }

    const publicUrl = pdfToUse;

    // Notification creation removed - no longer needed

    // Prepare download links (PDF + property files)
    const EXPIRY_30_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
    let downloadLinks = [];
    
    // Add the resale certificate PDF as a download link
    if (publicUrl) {
      try {
        console.log('Creating download link for PDF:', publicUrl);
        
        // Extract filename from URL and clean it up (remove timestamp prefix and query parameters)
        // This matches the logic used for property owner forms (settlement forms)
        const urlParts = publicUrl.split('/');
        let existingFilename = urlParts[urlParts.length - 1] || 
          (isPropertySpecific 
            ? `Resale_Certificate_${propertyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
            : `Resale_Certificate_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
        
        // Remove query parameters (everything after ?)
        existingFilename = existingFilename.split('?')[0];
        // Remove URL fragments (everything after #)
        existingFilename = existingFilename.split('#')[0];
        
        // Remove leading timestamp pattern (e.g., "1762187746441-" from filename)
        // Pattern: digits followed by hyphen at the start
        existingFilename = existingFilename.replace(/^\d+-/, '');
        
        downloadLinks.push({
          filename: existingFilename,
          downloadUrl: publicUrl, // PDF is already publicly accessible
          type: 'pdf',
          description: 'Virginia Resale Certificate'
        });
        
        console.log('Added PDF download link:', existingFilename);
      } catch (error) {
        console.error('Failed to create PDF download link:', error);
      }
    } else {
      console.log('No PDF URL found');
    }
    
    // Add the inspection form as a separate document
    const inspectionForm = application.property_owner_forms?.find(f => f.form_type === 'inspection_form');
    if (inspectionForm && inspectionForm.response_data) {
      try {
        console.log('Creating inspection form PDF');
        const filename = `Property_Inspection_Form_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        
        // Use dedicated React PDF component for inspection form
        const formData = inspectionForm.response_data;
        const React = await import('react');
        const ReactPDF = await import('@react-pdf/renderer');
        const { InspectionFormPdfDocument } = await import('../../lib/components/InspectionFormPdfDocument.js');
        
        // Load and encode company logo
        let logoBase64 = '';
        try {
          const fs = require('fs');
          const path = require('path');
          const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
          if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
          }
        } catch (error) {
          console.warn('Could not load company logo:', error);
        }
        
        // Get user's timezone
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        
        const pdfElement = React.createElement(InspectionFormPdfDocument, {
          propertyAddress: application.property_address,
          hoaName: application.hoa_properties.name,
          generatedDate: null, // Let component format with timezone
          formStatus: inspectionForm.status,
          completedAt: inspectionForm.completed_at,
          formData: formData,
          logoBase64: logoBase64,
          timezone: userTimezone
        });
        
        const stream = await ReactPDF.default.renderToStream(pdfElement);
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const pdfBuffer = Buffer.concat(chunks);
        
        // Upload to Supabase storage
        const storagePath = `inspection-forms/${applicationId}/inspection-form-${applicationId}.pdf`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('bucket0')
          .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true
          });
        
        if (uploadError) {
          throw uploadError;
        }
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('bucket0')
          .getPublicUrl(storagePath);
        
        downloadLinks.push({
          filename: filename,
          downloadUrl: urlData.publicUrl,
          type: 'pdf',
          description: 'Property Inspection Form',
          size: pdfBuffer.byteLength
        });
        
        console.log('Added inspection form PDF download link:', filename);
      } catch (error) {
        console.error('Failed to create inspection form PDF:', error);
        // Don't throw - continue with other documents
      }
    } else {
      console.log('No inspection form data found');
    }
    
    // Add property documents for this HOA property as download links (excluding Public Offering Statement)
    if (application.hoa_property_id) {
      try {
        console.log('Creating download links for property documents, HOA property ID:', application.hoa_property_id);
        
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
          
          console.log('Found', sortedDocuments.length, 'property documents (excluding Public Offering Statement)');
          
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
          
          // Fallback to old storage method for backward compatibility
          try {
            const { data: propertyFilesList, error: storageError } = await supabase.storage
              .from('bucket0')
              .list(`property_files/${application.hoa_property_id}`, {
                limit: 100,
                offset: 0
              });

            if (storageError) {
              console.error('Error listing property files:', storageError);
            } else if (propertyFilesList && propertyFilesList.length > 0) {
              console.log('Found', propertyFilesList.length, 'property files (legacy storage)');
              
              for (const file of propertyFilesList) {
                // Skip Public Offering Statement files (check filename)
                if (file.name.toLowerCase().includes('public_offering') || 
                    file.name.toLowerCase().includes('public_offering_statement')) {
                  console.log('Skipping Public Offering Statement file:', file.name);
                  continue;
                }
                
                try {
                  // Create 30-day signed URL for each file
                  const { data: urlData, error: urlError } = await supabase.storage
                    .from('bucket0')
                    .createSignedUrl(`property_files/${application.hoa_property_id}/${file.name}`, EXPIRY_30_DAYS, {
                      download: file.name.split('_').slice(1).join('_') // Clean filename for download
                    });

                  if (urlError) {
                    console.error(`Error creating signed URL for ${file.name}:`, urlError);
                    continue;
                  }

                  const cleanFilename = file.name.split('_').slice(1).join('_'); // Remove timestamp prefix
                  console.log('Created download link for property file:', cleanFilename);
                  
                  downloadLinks.push({
                    filename: cleanFilename,
                    downloadUrl: urlData.signedUrl,
                    type: 'document',
                    description: 'Property Supporting Document',
                    size: file.metadata?.size || 'Unknown'
                  });
                } catch (error) {
                  console.error(`Failed to create download link for ${file.name}:`, error);
                }
              }
            }
          } catch (fallbackError) {
            console.error('Error in fallback property files listing:', fallbackError);
          }
        }
      } catch (error) {
        console.error('Error creating property document download links:', error);
      }
    } else {
      console.log('No HOA property ID found in application');
    }

    // Send the actual email
    console.log('Sending email with', downloadLinks.length, 'download links');
    downloadLinks.forEach((link, index) => {
      console.log(`Download link ${index + 1}:`, link.filename, 'Type:', link.type);
    });
    
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
    
    // Send email to submitter with buyer emails as CC
    try {
      await sendApprovalEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name,
        propertyAddress: application.property_address,
        hoaName: application.hoa_properties.name,
        pdfUrl: publicUrl,
        applicationId: applicationId,
        downloadLinks: downloadLinks,
        comments: application.comments || null,
        cc: buyerEmails // Include buyer emails as CC recipients
      });
      if (buyerEmails.length > 0) {
        console.log(`Email sent successfully to submitter: ${application.submitter_email} (CC: ${buyerEmails.join(', ')})`);
      } else {
        console.log('Email sent successfully to submitter:', application.submitter_email);
      }
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't throw here - we still want to mark as success if notification was created
      // The notification record shows intent to send, even if delivery failed
    }

    // Update appropriate status based on whether this is property-specific or application-wide
    if (isPropertySpecific) {
      // Update property group status
      const { error: updateError } = await supabase
        .from('application_property_groups')
        .update({ 
          email_status: 'completed',
          email_completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', propertyGroupId);

      if (updateError) {
        throw updateError;
      }
    } else {
      // Update application status
      const { error: updateError } = await supabase
        .from('applications')
        .update({ 
          status: 'approved',
          email_completed_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) {
        throw updateError;
      }
    }

    return res.status(200).json({ 
      success: true, 
      pdfUrl: publicUrl,
      propertySpecific: isPropertySpecific,
      propertyName: propertyName
    });
  } catch (error) {
    console.error('Failed to send approval email:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to send approval email' });
  }
}

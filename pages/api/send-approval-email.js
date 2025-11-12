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

    // Create notification record with public URL (for internal use)
    const notificationSubject = isPropertySpecific 
      ? `Resale Certificate Ready - ${propertyName}`
      : `Resale Certificate Ready - ${application.property_address}`;
    
    const notificationMessage = isPropertySpecific
      ? `Your document(s) for ${propertyName} in ${application.hoa_properties.name} are now ready for download.`
      : `Your document(s) for ${application.property_address} in ${application.hoa_properties.name} are now ready for download.`;

    const { error: notifError } = await supabase.from('notifications').insert([
      {
        application_id: applicationId,
        recipient_email: application.submitter_email,
        recipient_name: application.submitter_name,
        notification_type: 'application_approved',
        subject: notificationSubject,
        message: notificationMessage,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          pdf_url: publicUrl,
          property_address: isPropertySpecific ? propertyName : application.property_address,
          hoa_name: application.hoa_properties.name,
          property_specific: isPropertySpecific,
          property_group_id: propertyGroupId
        },
      },
    ]);

    if (notifError) {
      throw notifError;
    }

    // Prepare download links (PDF + property files)
    const EXPIRY_30_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
    let downloadLinks = [];
    
    // Add the resale certificate PDF as a download link
    if (publicUrl) {
      try {
        console.log('Creating download link for PDF:', publicUrl);
        const filename = isPropertySpecific 
          ? `Resale_Certificate_${propertyName.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
          : `Resale_Certificate_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        
        downloadLinks.push({
          filename: filename,
          downloadUrl: publicUrl, // PDF is already publicly accessible
          type: 'pdf',
          description: 'Virginia Resale Certificate'
        });
        
        console.log('Added PDF download link:', filename);
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
        
        // Convert form data to a readable HTML format
        const formData = inspectionForm.response_data;
        const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Property Inspection Form - ${application.property_address}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #166534; border-bottom: 2px solid #166534; padding-bottom: 10px; }
        h2 { color: #059669; margin-top: 30px; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; color: #374151; }
        .value { margin-left: 10px; color: #111827; }
        .section { background-color: #f9fafb; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .completed { color: #059669; font-weight: bold; }
        .date { color: #6b7280; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>Property Inspection Form</h1>
    <div class="date">Generated on: ${new Date().toLocaleDateString()}</div>
    <div class="date">Property Address: ${application.property_address}</div>
    <div class="date">HOA: ${application.hoa_properties.name}</div>
    
    <div class="section">
        <h2>Form Status</h2>
        <div class="field">
            <span class="label">Status:</span>
            <span class="value completed">${inspectionForm.status}</span>
        </div>
        <div class="field">
            <span class="label">Completed:</span>
            <span class="value">${inspectionForm.completed_at ? new Date(inspectionForm.completed_at).toLocaleString() : 'Not completed'}</span>
        </div>
    </div>
    
    <div class="section">
        <h2>Inspection Details</h2>
        ${Object.entries(formData).map(([key, value]) => `
            <div class="field">
                <span class="label">${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span>
                <span class="value">${value !== null && value !== undefined ? value : 'Not provided'}</span>
            </div>
        `).join('')}
    </div>
    
    <div class="section">
        <h2>Additional Information</h2>
        <p>This form was completed as part of the resale certificate process for ${application.property_address}.</p>
        <p>For questions or concerns, please contact GMG ResaleFlow at resales@gmgva.com</p>
    </div>
</body>
</html>`;
        
        // Generate PDF from HTML using pdf-lib
        const { htmlToPdf } = require('../../lib/pdfLibPdfService');
        const pdfBuffer = await htmlToPdf(htmlContent, {
          format: 'Letter',
          printBackground: true
        });
        
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
    
    // Add ALL property files for this HOA property as download links
    if (application.hoa_property_id) {
      try {
        console.log('Creating download links for property files, HOA property ID:', application.hoa_property_id);
        
        // Get all files from storage for this property
        const { data: propertyFilesList, error: storageError } = await supabase.storage
          .from('bucket0')
          .list(`property_files/${application.hoa_property_id}`, {
            limit: 100,
            offset: 0
          });

        if (storageError) {
          console.error('Error listing property files:', storageError);
        } else if (propertyFilesList && propertyFilesList.length > 0) {
          console.log('Found', propertyFilesList.length, 'property files');
          
          for (const file of propertyFilesList) {
            try {
              // Clean filename: remove timestamp (13-digit numbers from Date.now())
              // Handles patterns like:
              // - "timestamp_filename.pdf" → "filename.pdf"
              // - "document_key_timestamp_filename.pdf" → "document_key_filename.pdf"
              // - "architectural_guidelines_1762958540289_download_file.pdf" → "architectural_guidelines_download_file.pdf"
              let cleanFilename = file.name;
              
              // Split by underscore to analyze parts
              const parts = file.name.split('_');
              
              // Find and remove any 13-digit timestamp (typical of Date.now())
              // Keep all other parts including document keys
              const cleanedParts = parts.filter(part => !/^\d{13}$/.test(part));
              
              if (cleanedParts.length > 0) {
                cleanFilename = cleanedParts.join('_');
              }
              
              // Create 30-day signed URL for each file (without download parameter to allow opening in browser)
              const { data: urlData, error: urlError } = await supabase.storage
                .from('bucket0')
                .createSignedUrl(`property_files/${application.hoa_property_id}/${file.name}`, EXPIRY_30_DAYS);

              if (urlError) {
                console.error(`Error creating signed URL for ${file.name}:`, urlError);
                continue;
              }

              console.log('Created download link for property file:', cleanFilename, '(original:', file.name, ')');
              
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
        } else {
          console.log('No property files found for this HOA property');
        }
      } catch (error) {
        console.error('Error creating property file download links:', error);
      }
    } else {
      console.log('No HOA property ID found in application');
    }

    // Send the actual email
    console.log('Sending email with', downloadLinks.length, 'download links');
    downloadLinks.forEach((link, index) => {
      console.log(`Download link ${index + 1}:`, link.filename, 'Type:', link.type);
    });
    
    try {
      await sendApprovalEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name,
        propertyAddress: application.property_address,
        hoaName: application.hoa_properties.name,
        pdfUrl: publicUrl,
        applicationId: applicationId,
        downloadLinks: downloadLinks
      });
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

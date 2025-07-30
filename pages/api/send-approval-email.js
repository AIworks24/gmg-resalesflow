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

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(
        `
        *,
        hoa_properties(name, property_owner_email, property_owner_name)
      `
      )
      .eq('id', applicationId)
      .single();

    if (appError) {
      throw appError;
    }

    // Check if PDF exists
    if (!application.pdf_url) {
      return res.status(400).json({ error: 'PDF has not been generated yet' });
    }

    const publicUrl = application.pdf_url;

    // Create notification record with public URL (for internal use)
    const { error: notifError } = await supabase.from('notifications').insert([
      {
        application_id: applicationId,
        recipient_email: application.submitter_email,
        recipient_name: application.submitter_name,
        notification_type: 'application_approved',
        subject: `Resale Certificate Ready - ${application.property_address}`,
        message: `Your Resale Certificate for ${application.property_address} in ${application.hoa_properties.name} is now ready. You can download it using the link provided in the email.`,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          pdf_url: publicUrl, // Store the public URL in metadata
          property_address: application.property_address,
          hoa_name: application.hoa_properties.name,
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
    if (application.pdf_url) {
      try {
        console.log('Creating download link for PDF:', application.pdf_url);
        const filename = `Resale_Certificate_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        
        downloadLinks.push({
          filename: filename,
          downloadUrl: application.pdf_url, // PDF is already publicly accessible
          type: 'pdf',
          description: 'Virginia Resale Certificate'
        });
        
        console.log('Added PDF download link:', filename);
      } catch (error) {
        console.error('Failed to create PDF download link:', error);
      }
    } else {
      console.log('No PDF URL found in application');
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

    // Update application status and mark email task as completed
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

    return res.status(200).json({ success: true, pdfUrl: publicUrl });
  } catch (error) {
    console.error('Failed to send approval email:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to send approval email' });
  }
}

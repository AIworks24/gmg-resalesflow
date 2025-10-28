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

    // Get application data with settlement form
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

    // Get settlement form
    const settlementForm = application.property_owner_forms?.find(
      (f) => f.form_type === 'settlement_form'
    );

    if (!settlementForm || settlementForm.status !== 'completed') {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }

    const formData = settlementForm.response_data || settlementForm.form_data;
    
    // Determine document type based on property state
    const propertyState = application.hoa_properties?.location?.includes('VA') ? 'VA' : 'NC';
    const documentType = 'Settlement Form';
    
    // Generate HTML content for the PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${documentType} - ${application.property_address}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #166534; border-bottom: 3px solid #166534; padding-bottom: 10px; margin-bottom: 30px; }
        .header-info { background-color: #f9fafb; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
        .section { margin: 20px 0; }
        .section-title { color: #059669; font-size: 1.3em; font-weight: bold; margin: 20px 0 10px 0; border-bottom: 1px solid #059669; padding-bottom: 5px; }
        .field { margin: 8px 0; }
        .label { font-weight: bold; color: #374151; display: inline-block; min-width: 200px; }
        .value { color: #111827; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #166534; color: #6b7280; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>${documentType}</h1>
    
    <div class="header-info">
        <p><strong>Property Address:</strong> ${application.property_address}</p>
        <p><strong>HOA:</strong> ${application.hoa_properties.name}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    ${Object.keys(formData)
      .filter(key => formData[key] && formData[key] !== '' && formData[key] !== null && formData[key] !== undefined)
      .map((key) => {
        const value = formData[key];
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).replace(/([a-z])([A-Z])/g, '$1 $2');
        return `
          <div class="field">
              <span class="label">${label}:</span>
              <span class="value">${value}</span>
          </div>
        `;
      })
      .join('')}
    
    <div class="footer">
        <p>This document was generated on ${new Date().toLocaleString()}</p>
        <p>For questions or concerns, please contact Goodman Management Group at resales@gmgva.com</p>
    </div>
</body>
</html>`;

    // Generate PDF from HTML using PDF.co
    const filename = `${documentType.replace(/[^a-zA-Z0-9]/g, '_')}_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    
    const pdfResponse = await fetch('https://api.pdf.co/v1/pdf/convert/from/html', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.PDFCO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        html: htmlContent,
        name: filename,
        async: false
      })
    });

    if (!pdfResponse.ok) {
      const errorText = await pdfResponse.text();
      console.error('PDF.co API error:', errorText);
      throw new Error(`Failed to generate PDF: ${errorText}`);
    }

    const pdfData = await pdfResponse.json();
    
    // Check if the response has a download URL
    if (!pdfData.url) {
      console.error('PDF.co response:', pdfData);
      throw new Error('PDF.co did not return a download URL');
    }

    // Download the PDF from PDF.co
    const pdfDownloadResponse = await fetch(pdfData.url);
    if (!pdfDownloadResponse.ok) {
      throw new Error('Failed to download PDF from PDF.co');
    }

    const pdfBuffer = await pdfDownloadResponse.arrayBuffer();
    
    // Validate PDF buffer is not empty
    if (!pdfBuffer || pdfBuffer.byteLength === 0) {
      throw new Error('PDF buffer is empty');
    }

    // Upload PDF to Supabase storage
    const fileName = `${Date.now()}-${filename}`;
    const filePath = `settlement-forms/${fileName}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, Buffer.from(pdfBuffer), {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('bucket0')
      .getPublicUrl(filePath);

    // Prepare download links
    const downloadLinks = [{
      filename: filename,
      downloadUrl: publicUrl,
      type: 'pdf',
      description: documentType
    }];

    // Update the form with PDF URL
    await supabase
      .from('property_owner_forms')
      .update({ pdf_url: publicUrl })
      .eq('id', settlementForm.id);

    // Send email with PDF
    const { sendApprovalEmail } = await import('../../lib/emailService');
    
    await sendApprovalEmail({
      to: application.submitter_email,
      applicationId: applicationId,
      propertyAddress: application.property_address,
      pdfUrl: publicUrl,
      submitterName: application.submitter_name || 'Valued Customer',
      hoaName: application.hoa_properties?.name || 'HOA',
      downloadLinks: downloadLinks,
    });

    // Create notification record
    const notificationSubject = `Settlement Form Ready - ${application.property_address}`;
    const notificationMessage = `Your Settlement Form for ${application.property_address} in ${application.hoa_properties?.name} is now ready. You can download it using the link provided in the email.`;

    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        application_id: applicationId,
        recipient_email: application.submitter_email,
        recipient_name: application.submitter_name,
        notification_type: 'application_approved',
        subject: notificationSubject,
        message: notificationMessage,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't throw - email was sent successfully
    }

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

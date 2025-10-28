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

    const { applicationId, formData: formDataFromClient } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, location)
      `)
      .eq('id', applicationId)
      .single();

    if (appError) throw appError;

    // Get settlement form data from database
    const { data: settlementForm, error: formError } = await supabase
      .from('property_owner_forms')
      .select('form_data')
      .eq('application_id', applicationId)
      .eq('form_type', 'settlement_form')
      .maybeSingle();

    if (formError) throw formError;

    // Use form_data from database if available, otherwise use client formData
    const formData = settlementForm?.form_data || formDataFromClient || {};

    // If no form data available, return error
    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }

    // Determine property state
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
    
    ${Object.keys(formData || {})
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

    // Update application with PDF URL and mark task as completed
    const timestamp = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        pdf_url: publicUrl,
        pdf_generated_at: timestamp,
        pdf_completed_at: timestamp,
        updated_at: timestamp, // Explicitly set updated_at to match pdf_generated_at
      })
      .eq('id', applicationId);

    if (updateError) throw updateError;

    return res.status(200).json({ 
      success: true, 
      pdfUrl: publicUrl 
    });
  } catch (error) {
    console.error('Error in generate-settlement-pdf:', error);
    return res.status(500).json({ error: error.message });
  }
}

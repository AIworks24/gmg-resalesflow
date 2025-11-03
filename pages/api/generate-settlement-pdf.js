import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import settlementFormFields from '../../lib/settlementFormFields.json';
import fs from 'fs';
import path from 'path';

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

    // Get application data with settlement form
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, location),
        property_owner_forms(id, form_type, form_data)
      `)
      .eq('id', applicationId)
      .single();

    if (appError) throw appError;

    // Get settlement form from nested data
    const settlementForm = application.property_owner_forms?.find(
      (f) => f.form_type === 'settlement_form'
    );

    // Use form_data from database if available, otherwise use client formData
    const formData = settlementForm?.form_data || formDataFromClient || {};

    // If no form data available, return error
    if (!formData || Object.keys(formData).length === 0) {
      return res.status(400).json({ error: 'Settlement form has not been completed yet' });
    }

    // Determine property state - check for VA/Virginia or NC/North Carolina
    const location = application.hoa_properties?.location?.toUpperCase() || '';
    
    // Debug: Log location to help diagnose issues
    console.log('PDF Generation - Property Location:', application.hoa_properties?.location);
    console.log('PDF Generation - Uppercase Location:', location);
    
    let propertyState = 'NC'; // Default to NC
    if (location.includes('VA') || location.includes('VIRGINIA')) {
      propertyState = 'VA';
    } else if (location.includes('NC') || location.includes('NORTH CAROLINA')) {
      propertyState = 'NC';
    }
    
    console.log('PDF Generation - Detected Property State:', propertyState);
    
    const documentType = propertyState === 'VA' 
      ? 'Dues Request - Escrow Instructions' 
      : 'Statement of Unpaid Assessments';
    
    console.log('PDF Generation - Document Type:', documentType);

    // Helper function to format values
    const formatValue = (value, fieldType) => {
      if (value === null || value === undefined || value === '') return '';
      
      if (fieldType === 'date' && value) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
          }
        } catch (e) {
          // If date parsing fails, return as is
        }
      }
      
      return String(value);
    };

    // Helper function to format field label
    const formatLabel = (key, label) => {
      return label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
    };

    // Helper function to escape HTML
    const escapeHtml = (text) => {
      if (!text) return '';
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return String(text).replace(/[&<>"']/g, m => map[m]);
    };

    // Define fee fields that should be grouped together (but not in comments)
    const feeFields = {
      VA: ['transferFee', 'resaleCertificateFee', 'capitalContribution', 'prepaidAssessments', 'adminFee', 'totalAmountDue'],
      NC: ['lateFees', 'interestCharges', 'attorneyFees', 'otherCharges', 'totalAmountDue', 'resaleCertificateFee']
    };

    // Define comment fields that should be at the very bottom
    const commentFields = ['assessmentComments', 'feeComments', 'goodThroughDate'];

    // Get sections for the property state
    const sections = settlementFormFields.forms[propertyState]?.sections || [];
    
    // Organize fields by section, separating fees and comments
    const organizedSections = [];
    const feesSection = { section: 'Fees', fields: [] };
    const commentsSection = { section: 'Comments', fields: [] };
    
    for (const section of sections) {
      const sectionFields = [];
      
      for (const field of section.fields) {
        const fieldKey = field.key;
        const fieldValue = formData[fieldKey];
        
        // Skip empty/null/undefined values
        if (!fieldValue && fieldValue !== 0 && fieldValue !== false) continue;
        
        // Check if it's a comment field - add to comments section
        if (commentFields.includes(fieldKey)) {
          commentsSection.fields.push({
            key: fieldKey,
            label: field.label || formatLabel(fieldKey),
            value: formatValue(fieldValue, field.type),
            type: field.type
          });
          continue;
        }
        
        // Check if it's a fee field - add to fees section
        if (feeFields[propertyState].includes(fieldKey)) {
          feesSection.fields.push({
            key: fieldKey,
            label: field.label || formatLabel(fieldKey),
            value: formatValue(fieldValue, field.type),
            type: field.type
          });
          continue;
        }
        
        // Regular field - add to its section
        sectionFields.push({
          key: fieldKey,
          label: field.label || formatLabel(fieldKey),
          value: formatValue(fieldValue, field.type),
          type: field.type
        });
      }
      
      // Only add section if it has fields
      if (sectionFields.length > 0) {
        organizedSections.push({
          section: section.section,
          fields: sectionFields
        });
      }
    }
    
    // Add fees section before comments if it has fields
    if (feesSection.fields.length > 0) {
      organizedSections.push(feesSection);
    }
    
    // Add comments section at the very end if it has fields
    if (commentsSection.fields.length > 0) {
      organizedSections.push(commentsSection);
    }

    // Load and encode company logo
    let logoBase64 = '';
    try {
      const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = logoBuffer.toString('base64');
      }
    } catch (error) {
      console.warn('Could not load company logo:', error);
    }

    // Generate HTML sections
    const sectionsHTML = organizedSections.map(section => {
      const fieldsHTML = section.fields.map(field => {
        const escapedLabel = escapeHtml(formatLabel(field.key, field.label));
        const escapedValue = escapeHtml(field.value);
        
        // Handle textarea fields (comments) differently
        if (field.type === 'textarea') {
          return `
            <div class="field textarea-field">
                <div class="label">${escapedLabel}:</div>
                <div class="value textarea-value">${escapedValue}</div>
            </div>
          `;
        }
        return `
          <div class="field">
              <span class="label">${escapedLabel}:</span>
              <span class="value">${escapedValue}</span>
          </div>
        `;
      }).join('');
      
      const escapedSectionTitle = escapeHtml(section.section);
      return `
        <div class="section">
            <div class="section-title">${escapedSectionTitle}</div>
            ${fieldsHTML}
        </div>
      `;
    }).join('');

    // Generate HTML content for the PDF
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${documentType} - ${application.property_address}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .company-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #166534; }
        .company-logo { max-height: 80px; max-width: 200px; }
        .company-info { text-align: right; color: #166534; font-size: 0.9em; }
        .company-info h2 { margin: 0 0 5px 0; font-size: 1.2em; }
        .company-info p { margin: 3px 0; }
        h1 { color: #166534; border-bottom: 3px solid #166534; padding-bottom: 10px; margin: 30px 0; text-align: center; }
        .header-info { background-color: #f9fafb; padding: 20px; border-radius: 5px; margin-bottom: 30px; }
        .section { margin: 20px 0; }
        .section-title { color: #059669; font-size: 1.3em; font-weight: bold; margin: 20px 0 10px 0; border-bottom: 1px solid #059669; padding-bottom: 5px; }
        .field { margin: 8px 0; }
        .label { font-weight: bold; color: #374151; display: inline-block; min-width: 200px; }
        .value { color: #111827; }
        .textarea-field { margin: 12px 0; }
        .textarea-field .label { display: block; margin-bottom: 4px; }
        .textarea-value { white-space: pre-wrap; padding-left: 0; }
        .fees-divider { margin-top: 20px; padding-top: 20px; border-top: 2px solid #d1d5db; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #166534; color: #6b7280; font-size: 0.9em; text-align: center; }
    </style>
</head>
<body>
    ${logoBase64 ? `
    <div class="company-header">
        <img src="data:image/png;base64,${logoBase64}" alt="Goodman Management Group" class="company-logo" />
        <div class="company-info">
            <h2>Goodman Management Group</h2>
            <p>Professional HOA Management & Settlement Services</p>
            <p>Phone: (804) 360-2115</p>
            <p>Email: resales@gmgva.com</p>
        </div>
    </div>
    ` : ''}
    
    <h1>${escapeHtml(documentType)}</h1>
    
    <div class="header-info">
        <p><strong>Property Address:</strong> ${escapeHtml(application.property_address)}</p>
        <p><strong>HOA:</strong> ${escapeHtml(application.hoa_properties.name)}</p>
        <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    </div>
    
    ${sectionsHTML}
    
    <div class="footer">
        <p><strong>Goodman Management Group</strong></p>
        <p>This document was generated on ${new Date().toLocaleString()}</p>
        <p>For questions or concerns, please contact us at resales@gmgva.com or (804) 360-2115</p>
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

    // Update both applications table and property_owner_forms table with PDF URL
    const timestamp = new Date().toISOString();
    
    // Update application with PDF URL and mark task as completed
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

    // Also update the settlement form with PDF URL
    if (settlementForm?.id) {
      const { error: formUpdateError } = await supabase
        .from('property_owner_forms')
        .update({
          pdf_url: publicUrl,
        })
        .eq('id', settlementForm.id);

      if (formUpdateError) {
        console.warn('Failed to update property_owner_forms with pdf_url:', formUpdateError);
        // Don't throw - application was updated successfully
      }
    }

    return res.status(200).json({ 
      success: true, 
      pdfUrl: publicUrl 
    });
  } catch (error) {
    console.error('Error in generate-settlement-pdf:', error);
    return res.status(500).json({ error: error.message });
  }
}

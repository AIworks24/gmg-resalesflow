import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendSettlementFormEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const {
      to,
      applicationId,
      settlementAgentName,
      propertyAddress,
      propertyState,
      documentType,
      formData,
      managerName,
      managerEmail,
      managerPhone,
    } = req.body;

    // Validate required fields
    if (!to || !applicationId || !settlementAgentName || !propertyAddress || !propertyState || !formData) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, applicationId, settlementAgentName, propertyAddress, propertyState, formData' 
      });
    }

    // Generate settlement form PDF
    const downloadLinks = [];
    try {
      console.log('Creating settlement form PDF');
      const filename = `${documentType.replace(/ /g, '_')}_${propertyAddress.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      
      // Create HTML content for the settlement form
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>${documentType} - ${propertyAddress}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: ${propertyState === 'VA' ? '#1E40AF' : '#059669'}; border-bottom: 2px solid ${propertyState === 'VA' ? '#1E40AF' : '#059669'}; padding-bottom: 10px; }
        h2 { color: ${propertyState === 'VA' ? '#1E40AF' : '#059669'}; margin-top: 30px; }
        .field { margin: 10px 0; }
        .label { font-weight: bold; color: #374151; }
        .value { margin-left: 10px; color: #111827; }
        .section { background-color: #f9fafb; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid ${propertyState === 'VA' ? '#1E40AF' : '#059669'}; }
        .date { color: #6b7280; font-size: 0.9em; }
        .header { background-color: ${propertyState === 'VA' ? '#1E40AF' : '#059669'}; color: white; padding: 20px; text-align: center; }
        .contact-info { background-color: #EFF6FF; padding: 15px; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${documentType}</h1>
        <p style="margin: 5px 0;">Goodman Management Group - Settlement Services</p>
    </div>
    
    <div style="margin-top: 20px;">
        <div class="date">Generated on: ${new Date().toLocaleDateString()}</div>
        <div class="date">Property Address: ${propertyAddress}</div>
    </div>
    
    <div class="section">
        <h2>Property Information</h2>
        ${formData.propertyName ? `<div class="field"><span class="label">Property Name:</span> <span class="value">${formData.propertyName}</span></div>` : ''}
        ${formData.propertyAddress ? `<div class="field"><span class="label">Property Address:</span> <span class="value">${formData.propertyAddress}</span></div>` : ''}
        ${formData.unitNumber ? `<div class="field"><span class="label">Unit Number:</span> <span class="value">${formData.unitNumber}</span></div>` : ''}
        ${formData.associationName ? `<div class="field"><span class="label">Association Name:</span> <span class="value">${formData.associationName}</span></div>` : ''}
        ${formData.associationAddress ? `<div class="field"><span class="label">Association Address:</span> <span class="value">${formData.associationAddress}</span></div>` : ''}
    </div>
    
    <div class="section">
        <h2>Buyer Information</h2>
        ${formData.buyerName ? `<div class="field"><span class="label">Buyer Name:</span> <span class="value">${formData.buyerName}</span></div>` : ''}
        ${formData.buyerEmail ? `<div class="field"><span class="label">Buyer Email:</span> <span class="value">${formData.buyerEmail}</span></div>` : ''}
        ${formData.buyerPhone ? `<div class="field"><span class="label">Buyer Phone:</span> <span class="value">${formData.buyerPhone}</span></div>` : ''}
        ${formData.estimatedClosingDate ? `<div class="field"><span class="label">Estimated Closing Date:</span> <span class="value">${formData.estimatedClosingDate}</span></div>` : ''}
    </div>
    
    ${propertyState === 'VA' ? `
    <div class="section">
        <h2>Assessment Information (Virginia)</h2>
        ${formData.monthlyAssessment ? `<div class="field"><span class="label">Monthly Assessment:</span> <span class="value">${formData.monthlyAssessment}</span></div>` : ''}
        ${formData.assessmentDueDate ? `<div class="field"><span class="label">Assessment Due Date:</span> <span class="value">${formData.assessmentDueDate}</span></div>` : ''}
        ${formData.unpaidAssessments ? `<div class="field"><span class="label">Unpaid Assessments:</span> <span class="value">${formData.unpaidAssessments}</span></div>` : ''}
        ${formData.transferFee ? `<div class="field"><span class="label">Transfer Fee:</span> <span class="value">${formData.transferFee}</span></div>` : ''}
        ${formData.capitalContribution ? `<div class="field"><span class="label">Capital Contribution:</span> <span class="value">${formData.capitalContribution}</span></div>` : ''}
        ${formData.workingCapital ? `<div class="field"><span class="label">Working Capital:</span> <span class="value">${formData.workingCapital}</span></div>` : ''}
        ${formData.otherFees ? `<div class="field"><span class="label">Other Fees:</span> <span class="value">${formData.otherFees}</span></div>` : ''}
        ${formData.otherFeesDescription ? `<div class="field"><span class="label">Other Fees Description:</span> <span class="value">${formData.otherFeesDescription}</span></div>` : ''}
        ${formData.totalAmountDue ? `<div class="field"><span class="label">Total Amount Due:</span> <span class="value"><strong>${formData.totalAmountDue}</strong></span></div>` : ''}
    </div>
    ` : `
    <div class="section">
        <h2>Assessment Information (North Carolina)</h2>
        ${formData.regularAssessmentAmount ? `<div class="field"><span class="label">Regular Assessment Amount:</span> <span class="value">${formData.regularAssessmentAmount}</span></div>` : ''}
        ${formData.assessmentFrequency ? `<div class="field"><span class="label">Assessment Frequency:</span> <span class="value">${formData.assessmentFrequency}</span></div>` : ''}
        ${formData.lastPaymentDate ? `<div class="field"><span class="label">Last Payment Date:</span> <span class="value">${formData.lastPaymentDate}</span></div>` : ''}
        ${formData.unpaidRegularAssessments ? `<div class="field"><span class="label">Unpaid Regular Assessments:</span> <span class="value">${formData.unpaidRegularAssessments}</span></div>` : ''}
        ${formData.specialAssessmentAmount ? `<div class="field"><span class="label">Special Assessment Amount:</span> <span class="value">${formData.specialAssessmentAmount}</span></div>` : ''}
        ${formData.unpaidSpecialAssessments ? `<div class="field"><span class="label">Unpaid Special Assessments:</span> <span class="value">${formData.unpaidSpecialAssessments}</span></div>` : ''}
        ${formData.lateFees ? `<div class="field"><span class="label">Late Fees:</span> <span class="value">${formData.lateFees}</span></div>` : ''}
        ${formData.interestCharges ? `<div class="field"><span class="label">Interest Charges:</span> <span class="value">${formData.interestCharges}</span></div>` : ''}
        ${formData.attorneyFees ? `<div class="field"><span class="label">Attorney Fees:</span> <span class="value">${formData.attorneyFees}</span></div>` : ''}
        ${formData.otherCharges ? `<div class="field"><span class="label">Other Charges:</span> <span class="value">${formData.otherCharges}</span></div>` : ''}
        ${formData.totalAmountDue ? `<div class="field"><span class="label">Total Amount Due:</span> <span class="value"><strong>${formData.totalAmountDue}</strong></span></div>` : ''}
    </div>
    `}
    
    <div class="contact-info">
        <h2>Contact Information</h2>
        ${managerName ? `<div class="field"><span class="label">Community Manager:</span> <span class="value">${managerName}</span></div>` : ''}
        ${formData.managerTitle ? `<div class="field"><span class="label">Title:</span> <span class="value">${formData.managerTitle}</span></div>` : ''}
        ${formData.managerCompany ? `<div class="field"><span class="label">Company:</span> <span class="value">${formData.managerCompany}</span></div>` : ''}
        ${managerPhone ? `<div class="field"><span class="label">Phone:</span> <span class="value">${managerPhone}</span></div>` : ''}
        ${managerEmail ? `<div class="field"><span class="label">Email:</span> <span class="value">${managerEmail}</span></div>` : ''}
    </div>
    
    <div style="margin-top: 30px; padding: 15px; background-color: #FEF3C7; border-radius: 5px;">
        <h3 style="margin-top: 0;">Important Notes</h3>
        <p>This settlement form was generated as part of the resale certificate process.</p>
        <p>For questions or concerns, please contact GMG ResaleFlow at resales@gmgva.com</p>
        <p style="margin-bottom: 0;"><strong>Application ID:</strong> ${applicationId}</p>
    </div>
</body>
</html>`;
      
      // Generate PDF from HTML using Puppeteer
      const { htmlToPdf } = require('../../lib/puppeteerPdfService');
      const pdfBuffer = await htmlToPdf(htmlContent, {
        format: 'Letter',
        printBackground: true
      });
      
      // Upload to Supabase storage
      const storagePath = `settlement-forms/${applicationId}/settlement-form-${applicationId}.pdf`;
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
        description: documentType,
        size: pdfBuffer.byteLength
      });
      
      console.log('Added settlement form PDF download link:', filename);
    } catch (error) {
      console.error('Failed to create settlement form PDF:', error);
      // Continue without PDF if generation fails
    }

    // Send the settlement form email with PDF download link
    const result = await sendSettlementFormEmail({
      to,
      applicationId,
      settlementAgentName,
      propertyAddress,
      propertyState,
      documentType,
      formData,
      managerName,
      managerEmail,
      managerPhone,
      downloadLinks, // Pass PDF download links
    });

    console.log('Settlement email sent successfully:', {
      applicationId,
      to,
      propertyState,
      documentType
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Settlement form email sent successfully',
      result 
    });

  } catch (error) {
    console.error('Error sending settlement email:', error);
    return res.status(500).json({ 
      error: 'Failed to send settlement email',
      details: error.message 
    });
  }
}
import nodemailer from 'nodemailer';

// Check if Microsoft Graph is configured
const isGraphConfigured = !!(
  process.env.MICROSOFT_CLIENT_ID &&
  process.env.MICROSOFT_CLIENT_SECRET &&
  process.env.MICROSOFT_TENANT_ID &&
  process.env.MICROSOFT_FROM_EMAIL
);

// Microsoft Graph email sending function
const sendViaMicrosoftGraph = async ({ to, subject, html }) => {
  try {
    // For now, we'll use a simple implementation that falls back to SMTP
    // In a production environment, you would implement proper Microsoft Graph API calls here
    console.log('Microsoft Graph email sending not fully implemented, falling back to SMTP');
    throw new Error('Microsoft Graph not implemented');
  } catch (error) {
    console.error('Error sending via Microsoft Graph:', error);
    throw error;
  }
};

// Create reusable transporter object using Gmail SMTP
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.GMAIL_USER,
//     pass: process.env.GMAIL_APP_PASSWORD,
//   },
// });

// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   secure: false, 
//   requireTLS: true,
//   auth: {
//     user: process.env.GMAIL_USER,
//     pass: process.env.GMAIL_APP_PASSWORD,
//   },
//   tls: {
//     ciphers: process.env.CIPHERS,
//     rejectUnauthorized: false
//   }
// });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER || process.env.GMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});


export const sendApprovalEmail = async ({
  to,
  applicationId,
  propertyAddress,
  pdfUrl,
  submitterName,
  hoaName,
  downloadLinks = [],
  isSettlement = false,
  customSubject = null,
  customTitle = null,
  customMessage = null,
}) => {
  try {
    // Generate download links HTML
    const downloadLinksHtml = downloadLinks.length > 0 
      ? downloadLinks.map(link => {
          const icon = link.type === 'pdf' ? '📄' : '📂';
          const sizeText = link.size && link.size !== 'Unknown' ? ` (${link.size} bytes)` : '';
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 style="color: #166534; text-decoration: none; font-weight: 500; display: inline-block; padding: 8px 12px; background-color: #f0f9ff; border-radius: 4px; border: 1px solid #e0e7ff;"
                 onmouseover="this.style.backgroundColor='#dbeafe'" 
                 onmouseout="this.style.backgroundColor='#f0f9ff'">
                ${icon} ${link.filename}${sizeText}
              </a>
              <br><small style="color: #6b7280; margin-left: 20px;">${link.description}</small>
            </li>
          `;
        }).join('')
      : '<li>No additional documents available</li>';

    // Use custom subject/message for settlement, otherwise use default
    const subject = customSubject || `Resale Certificate Ready - ${propertyAddress}`;
    const title = customTitle || 'Your Resale Certificate is Ready';
    const message = customMessage || `Your document(s) for <strong>${propertyAddress}</strong> in <strong>${hoaName}</strong> are now ready for download.`;
    
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #166534; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">${title}</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${submitterName},</p>
            <p>${message}</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #166534; margin-top: 0;">📥 Download Your Documents</h3>
              <p style="margin-bottom: 15px;">Click the links below to download your documents:</p>
              <ul style="list-style: none; padding: 0;">
                ${downloadLinksHtml}
              </ul>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">⏰ Important Note</h4>
              <p style="margin: 0;">Download links are valid for <strong>30 days</strong>. Please save the documents to your computer for future reference.</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${applicationId}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #166534;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendApplicationSubmissionEmail = async ({
  to,
  applicationId,
  customerName,
  propertyAddress,
  packageType,
  totalAmount,
  hoaName,
  submitterType,
}) => {
  try {
    // Calculate expected completion date
    const processingDays = packageType === 'rush' ? 5 : 15;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + processingDays);

    const subject = `Application Submitted - #${applicationId}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Application Submitted Successfully</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for submitting your resale certificate application. We have received your request and will begin processing it immediately.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #10B981; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>HOA Community:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${hoaName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Amount:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Expected Completion:</strong></td>
                  <td style="padding: 8px 0;">${expectedDate.toLocaleDateString()}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">What Happens Next?</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>We'll begin processing your resale certificate request</li>
                <li>Property owner forms will be sent to the HOA for completion</li>
                <li>You'll receive email updates throughout the process</li>
                <li>Completed documents will be delivered electronically</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Application submission email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Application submission email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending application submission email:', error);
    throw error;
  }
};

export const sendMultiCommunityNotificationEmail = async ({
  to,
  applicationId,
  customerName,
  primaryProperty,
  linkedProperties,
  totalAmount,
  packageType,
  isRush = false,
}) => {
  try {
    const subject = `Multi-Community Application Submitted - #${applicationId}`;
    const associationsList = linkedProperties.map((prop, index) => 
      `<li style="margin: 5px 0;">${index + 2}. ${prop.property_name} (${prop.location})</li>`
    ).join('');

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Multi-Community Application Submitted</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for submitting your multi-community resale certificate application. We have received your request for <strong>${primaryProperty}</strong> and its associated communities.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #3B82F6; margin-top: 0;">🏢 Included Communities</h3>
              <ol style="margin: 0; padding-left: 20px;">
                <li style="margin: 5px 0;"><strong>${primaryProperty}</strong> (Primary Property)</li>
                ${associationsList}
              </ol>
            </div>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #3B82F6; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Primary Property:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${primaryProperty}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Communities:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${linkedProperties.length + 1}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Total Amount:</strong></td>
                  <td style="padding: 8px 0;">$${totalAmount}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">📋 What This Means</h4>
              <p style="margin: 0;">Your property is part of a Master Association structure. We will process documents for all ${linkedProperties.length + 1} communities and provide you with a complete package containing all required forms and certificates.</p>
            </div>
            
            <div style="background-color: #EBF8FF; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #2563EB; margin-top: 0;">⚡ Processing Timeline</h4>
              <p style="margin: 0;">${isRush ? 'Rush processing will be applied to all communities, ensuring faster completion.' : 'Standard processing will be applied to all communities, with completion expected within 10-15 business days.'}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #3B82F6;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Multi-community notification email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Multi-community notification email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending multi-community notification email:', error);
    throw error;
  }
};

export const sendPropertyManagerNotificationEmail = async ({
  to,
  applicationId,
  propertyName,
  propertyAddress,
  submitterName,
  submitterEmail,
  packageType,
  isRush = false,
  isMultiCommunity = false,
  linkedProperties = [],
}) => {
  try {
    const subject = `${isRush ? '🚨 RUSH ' : ''}New Application - ${propertyName}${isMultiCommunity ? ' (Multi-Community)' : ''}`;
    
    const linkedPropertiesList = isMultiCommunity && linkedProperties.length > 0 
      ? linkedProperties.map((prop, index) => 
          `<li style="margin: 5px 0;">${index + 2}. ${prop.property_name} (${prop.location})</li>`
        ).join('')
      : '';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${isRush ? '#DC2626' : '#059669'}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">${isRush ? '🚨 RUSH ' : ''}New Application Received</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear Property Manager,</p>
            
            <p>A new resale certificate application has been submitted for <strong>${propertyName}</strong>${isMultiCommunity ? ' and its associated communities' : ''}.</p>
            
            ${isRush ? `
            <div style="background-color: #FEE2E2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #DC2626;">
              <h4 style="color: #DC2626; margin-top: 0;">🚨 RUSH ORDER</h4>
              <p style="margin: 0; font-weight: bold;">This is a RUSH order requiring completion within 5 business days.</p>
            </div>
            ` : ''}
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: ${isRush ? '#DC2626' : '#059669'}; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Submitter:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${submitterName} (${submitterEmail})</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Application Type:</strong></td>
                  <td style="padding: 8px 0;">${isMultiCommunity ? 'Multi-Community' : 'Single Property'}</td>
                </tr>
              </table>
            </div>
            
            ${isMultiCommunity && linkedProperties.length > 0 ? `
            <div style="background-color: #EBF8FF; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #2563EB; margin-top: 0;">🏢 Associated Communities</h3>
              <ol style="margin: 0; padding-left: 20px;">
                <li style="margin: 5px 0;"><strong>${propertyName}</strong> (Primary Property)</li>
                ${linkedPropertiesList}
              </ol>
              <p style="margin: 10px 0 0 0; font-size: 14px; color: #6B7280;">Documents will be required for all listed communities.</p>
            </div>
            ` : ''}
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">Next Steps</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>Review the application details in the admin dashboard</li>
                <li>Complete any required property owner forms</li>
                <li>Process the resale certificate request</li>
                <li>Update the application status as you progress</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com'}/admin/applications" 
                 style="background-color: ${isRush ? '#DC2626' : '#059669'}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                View Application in Dashboard
              </a>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Property manager notification email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Property manager notification email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending property manager notification email:', error);
    throw error;
  }
};

export const sendPaymentConfirmationEmail = async ({
  to,
  applicationId,
  customerName,
  propertyAddress,
  packageType,
  totalAmount,
  stripeChargeId,
}) => {
  try {
    // Calculate expected completion date
    const processingDays = packageType === 'rush' ? 5 : 15;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + processingDays);

    const subject = `Payment Confirmation - Application #${applicationId}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Payment Confirmation</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for your payment! Your resale certificate application has been successfully submitted and payment confirmed.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #10B981; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Expected Completion:</strong></td>
                  <td style="padding: 8px 0;">${expectedDate.toLocaleDateString()}</td>
                </tr>
              </table>
            </div>
            
            ${stripeChargeId ? `
            <div style="background-color: #EBF8FF; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #2563EB; margin-top: 0;">Payment Reference</h4>
              <p style="margin: 0; font-family: monospace; font-size: 14px;">Stripe Payment ID: ${stripeChargeId}</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">Save this reference number for your records</p>
            </div>
            ` : ''}
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">What Happens Next?</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>We'll begin processing your resale certificate request</li>
                <li>Property owner forms will be sent to the HOA for completion</li>
                <li>You'll receive email updates throughout the process</li>
                <li>Completed documents will be delivered electronically</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Payment confirmation email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Payment confirmation email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    throw error;
  }
};

export const sendSettlementFormEmail = async ({
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
  downloadLinks = [],
}) => {
  try {
    const subject = `Settlement Form Ready - ${propertyAddress}`;
    
    // State-specific messaging
    const stateInfo = propertyState === 'VA' 
      ? {
          color: '#1E40AF', // Blue for VA
            title: 'Settlement Form',
          description: 'Dues Request - Escrow Instructions',
          note: 'This form is provided free of charge as required by Virginia law.'
        }
      : {
          color: '#059669', // Green for NC  
            title: 'Settlement Form',
          description: 'Statement of Unpaid Assessments',
          note: 'Please review the assessment details carefully.'
        };

    // Format form data for display
    const formatFormData = (data) => {
      const formatValue = (value) => {
        if (value === null || value === undefined || value === '') return 'N/A';
        return typeof value === 'string' ? value : JSON.stringify(value);
      };

      const formatKey = (key) => {
        return key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim();
      };

      const sections = {
        'Property Information': [
          ['Property Name', data.propertyName],
          ['Property Address', data.propertyAddress],
          ['Unit Number', data.unitNumber],
          ['Association Name', data.associationName],
          ['Association Address', data.associationAddress],
        ],
        'Buyer Information': [
          ['Buyer Name', data.buyerName],
          ['Buyer Email', data.buyerEmail],
          ['Buyer Phone', data.buyerPhone],
        ],
        'Assessment Information': propertyState === 'VA' ? [
          ['Monthly Assessment', data.monthlyAssessment],
          ['Unpaid Assessments', data.unpaidAssessments],
          ['Transfer Fee', data.transferFee],
          ['Capital Contribution', data.capitalContribution],
          ['Working Capital', data.workingCapital],
          ['Other Fees', data.otherFees],
          ['Other Fees Description', data.otherFeesDescription],
        ] : [
          ['Regular Assessment Amount', data.regularAssessmentAmount],
          ['Assessment Frequency', data.assessmentFrequency],
          ['Unpaid Regular Assessments', data.unpaidRegularAssessments],
          ['Special Assessment Amount', data.specialAssessmentAmount],
          ['Unpaid Special Assessments', data.unpaidSpecialAssessments],
          ['Late Fees', data.lateFees],
          ['Interest Charges', data.interestCharges],
          ['Attorney Fees', data.attorneyFees],
          ['Other Charges', data.otherCharges],
        ],
        'Contact Information': [
          ['Community Manager', data.managerName],
          ['Title', data.managerTitle],
          ['Company', data.managerCompany],
          ['Phone', data.managerPhone],
          ['Email', data.managerEmail],
        ],
      };

      let html = '';
      for (const [sectionTitle, fields] of Object.entries(sections)) {
        const sectionFields = fields.filter(([, value]) => value !== undefined);
        if (sectionFields.length > 0) {
          html += `
            <h4 style="color: ${stateInfo.color}; margin-top: 20px; margin-bottom: 10px; border-bottom: 2px solid ${stateInfo.color}; padding-bottom: 5px;">
              ${sectionTitle}
            </h4>
          `;
          sectionFields.forEach(([key, value]) => {
            html += `
              <div style="margin: 8px 0; padding: 8px; background-color: #f9f9f9; border-radius: 4px;">
                <strong style="color: ${stateInfo.color};">${formatKey(key)}:</strong>
                <span style="margin-left: 10px;">${formatValue(value)}</span>
              </div>
            `;
          });
        }
      }

      return html;
    };

    // Generate download links HTML
    const downloadLinksHtml = downloadLinks.length > 0 
      ? downloadLinks.map(link => {
          const icon = link.type === 'pdf' ? '📄' : '📂';
          const sizeText = link.size && link.size !== 'Unknown' ? ` (${link.size} bytes)` : '';
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 style="color: ${stateInfo.color}; text-decoration: none; font-weight: 500; display: inline-block; padding: 8px 12px; background-color: #f0f9ff; border-radius: 4px; border: 1px solid #e0e7ff;"
                 onmouseover="this.style.backgroundColor='#dbeafe'" 
                 onmouseout="this.style.backgroundColor='#f0f9ff'">
                ${icon} ${link.filename}${sizeText}
              </a>
              <br><small style="color: #6b7280; margin-left: 20px;">${link.description}</small>
            </li>
          `;
        }).join('')
      : '';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: ${stateInfo.color}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">${stateInfo.title} Ready</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - Settlement Services</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${settlementAgentName},</p>
            <p>Your settlement form for <strong>${propertyAddress}</strong> has been completed.</p>
            
            ${downloadLinks.length > 0 ? `
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: ${stateInfo.color}; margin-top: 0;">📥 Download Your Document</h3>
              <p style="margin-bottom: 15px;">Click the link below to download your completed settlement form:</p>
              <ul style="list-style: none; padding: 0;">
                ${downloadLinksHtml}
              </ul>
            </div>
            ` : ''}
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid ${stateInfo.color};">
              <h3 style="color: ${stateInfo.color}; margin-top: 0;">📄 ${stateInfo.description}</h3>
              <p style="margin-bottom: 15px; font-weight: bold;">The completed settlement form details are provided below:</p>
              
              ${formatFormData(formData)}
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">📋 Important Information</h4>
              <p style="margin: 0;">${stateInfo.note}</p>
              <p style="margin: 10px 0 0 0;"><strong>Please review all assessment details and amounts carefully before closing.</strong></p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${stateInfo.color};">
              <h4 style="color: ${stateInfo.color}; margin-top: 0;">Contact Information</h4>
              <p style="margin: 5px 0;"><strong>Community Manager:</strong> ${managerName}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${managerEmail}" style="color: ${stateInfo.color};">${managerEmail}</a></p>
              <p style="margin: 5px 0;"><strong>Phone:</strong> ${managerPhone}</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${applicationId}</p>
              <p style="margin: 5px 0 0 0;"><strong>Property State:</strong> ${propertyState}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: ${stateInfo.color};">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Settlement Services</p>
            </div>
          </div>
        </div>
      `;

    if (isGraphConfigured) {
      try {
        const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
        console.log('Settlement form email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER,
      to,
      subject,
      html,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Settlement form email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending settlement form email:', error);
    throw error;
  }
};

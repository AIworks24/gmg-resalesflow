import nodemailer from 'nodemailer';

// Create reusable transporter object using environment-driven SMTP (supports Gmail or Office 365)
// Preferred: set SMTP_HOST/SMTP_PORT/SMTP_SECURE, EMAIL_USERNAME, EMAIL_APP_PASSWORD
// Fallback: if not provided, use Gmail service with GMAIL_USER/GMAIL_APP_PASSWORD
const useExplicitSmtp = Boolean(process.env.SMTP_HOST);
const transporter = nodemailer.createTransport(
  useExplicitSmtp
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USERNAME,
          pass: process.env.EMAIL_APP_PASSWORD,
        },
      }
    : {
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      }
);

// Microsoft Graph configuration (client credentials flow)
const GRAPH_TENANT_ID = process.env.MS_TENANT_ID;
const GRAPH_CLIENT_ID = process.env.MS_CLIENT_ID;
const GRAPH_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const GRAPH_SENDER_USER = process.env.MS_SENDER_USER_ID; // UPN or GUID
const GRAPH_SAVE_TO_SENT = process.env.MS_SAVE_TO_SENT === 'true';

const isGraphConfigured = Boolean(
  GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && GRAPH_SENDER_USER
);

async function sendViaMicrosoftGraph({ to, subject, html }) {
  const tokenUrl = `https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`;
  const tokenBody = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const tokenResp = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: tokenBody.toString(),
  });

  if (!tokenResp.ok) {
    const errorText = await tokenResp.text();
    throw new Error(`Failed to acquire Graph token: ${tokenResp.status} ${errorText}`);
  }

  const { access_token: accessToken } = await tokenResp.json();

  const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(
    GRAPH_SENDER_USER
  )}/sendMail`;

  const messageBody = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: GRAPH_SAVE_TO_SENT,
  };

  const sendResp = await fetch(sendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messageBody),
  });

  if (!sendResp.ok) {
    const errorText = await sendResp.text();
    throw new Error(`Graph sendMail failed: ${sendResp.status} ${errorText}`);
  }

  return { success: true };
}

export const sendApprovalEmail = async ({
  to,
  applicationId,
  propertyAddress,
  pdfUrl,
  submitterName,
  hoaName,
  downloadLinks = [],
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

    const subject = `Resale Certificate Ready - ${propertyAddress}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #166534; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Your Resale Certificate is Ready</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${submitterName},</p>
            <p>Your Resale Certificate for <strong>${propertyAddress}</strong> in <strong>${hoaName}</strong> is now ready for download.</p>
            
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
      const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
      console.log('Email sent successfully via Microsoft Graph:', emailResponse);
      return { success: true, response: emailResponse };
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
      const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
      console.log('Application submission email sent successfully via Microsoft Graph:', emailResponse);
      return { success: true, response: emailResponse };
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
      const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
      console.log('Multi-community notification email sent successfully via Microsoft Graph:', emailResponse);
      return { success: true, response: emailResponse };
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
      const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
      console.log('Property manager notification email sent successfully via Microsoft Graph:', emailResponse);
      return { success: true, response: emailResponse };
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
      const emailResponse = await sendViaMicrosoftGraph({ to, subject, html });
      console.log('Payment confirmation email sent successfully via Microsoft Graph:', emailResponse);
      return { success: true, response: emailResponse };
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

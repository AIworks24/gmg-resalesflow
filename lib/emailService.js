import nodemailer from 'nodemailer';
import { normalizeEmail } from './emailUtils';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';

// Simple HTML escape function to prevent XSS
const escapeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Check if Microsoft Graph is configured
const isGraphConfigured = !!(
  process.env.MICROSOFT_CLIENT_ID &&
  process.env.MICROSOFT_CLIENT_SECRET &&
  process.env.MICROSOFT_TENANT_ID &&
  process.env.MICROSOFT_FROM_EMAIL
);

// Initialize Microsoft Graph client (only if configured)
let graphClient = null;
if (isGraphConfigured) {
  try {
    const credential = new ClientSecretCredential(
      process.env.MICROSOFT_TENANT_ID,
      process.env.MICROSOFT_CLIENT_ID,
      process.env.MICROSOFT_CLIENT_SECRET
    );

    graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const tokenResponse = await credential.getToken('https://graph.microsoft.com/.default');
          return tokenResponse.token;
        }
      }
    });

    console.log('[Microsoft Graph] Client initialized successfully');
  } catch (error) {
    console.error('[Microsoft Graph] Failed to initialize client:', error.message);
    graphClient = null;
  }
}

// Microsoft Graph email sending function
const sendViaMicrosoftGraph = async ({ to, subject, html, from }) => {
  if (!graphClient) {
    throw new Error('Microsoft Graph client not initialized');
  }

  try {
    const fromEmail = from || process.env.MICROSOFT_FROM_EMAIL;
    
    // Normalize recipient email
    const toEmail = normalizeEmail(to);

    // Prepare the email message in Microsoft Graph format
    const message = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: html
        },
        toRecipients: [
          {
            emailAddress: {
              address: toEmail
            }
          }
        ],
        from: {
          emailAddress: {
            address: fromEmail
          }
        }
      },
      saveToSentItems: true
    };

    // Send the email using Microsoft Graph API
    // Note: This sends from the user's mailbox specified in MICROSOFT_FROM_EMAIL
    const response = await graphClient
      .api(`/users/${fromEmail}/sendMail`)
      .post(message);

    console.log('[Microsoft Graph] Email sent successfully to:', toEmail);
    
    return {
      success: true,
      messageId: response?.id || 'sent',
      response: response
    };
  } catch (error) {
    console.error('[Microsoft Graph] Error sending email:', {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode
    });
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
  comments = null,
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized approval email recipient: ${to} -> ${normalizedTo}`);
    }
    
    // Generate download links HTML
    const downloadLinksHtml = downloadLinks.length > 0 
      ? downloadLinks.map(link => {
          const icon = link.type === 'pdf' ? '📄' : '📂';
          const sizeText = link.size && link.size !== 'Unknown' ? ` (${link.size} bytes)` : '';
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 target="_blank"
                 rel="noopener noreferrer"
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
            
            ${comments ? `
            <div style="background-color: #EBF8FF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563EB;">
              <h4 style="color: #2563EB; margin-top: 0;">💬 Additional Comments</h4>
              <p style="margin: 0; white-space: pre-wrap; color: #1F2937;">${escapeHtml(comments)}</p>
            </div>
            ` : ''}
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">⏰ Important Note</h4>
              <p style="margin: 0;">Download links are valid for <strong>30 days</strong>. Please save the documents to your computer for future reference.</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${applicationId}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #166534;">resales@gmgva.com</a>
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
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
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
  applicationType,
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized application submission email recipient: ${to} -> ${normalizedTo}`);
    }
    
    // Calculate expected completion date
    const processingDays = packageType === 'rush' ? 5 : 15;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + processingDays);

    // Get the correct application type terminology
    const getApplicationTypeTerm = (type) => {
      if (type === 'lender_questionnaire') {
        return 'lender questionnaire application';
      } else if (type === 'settlement_va' || type === 'settlement_nc') {
        return 'settlement form application';
      } else if (type === 'public_offering') {
        return 'public offering application';
      } else if (type === 'multi_community') {
        return 'multi-community resale certificate application';
      } else {
        return 'resale certificate application';
      }
    };

    const getRequestTypeTerm = (type) => {
      if (type === 'lender_questionnaire') {
        return 'lender questionnaire';
      } else if (type === 'settlement_va' || type === 'settlement_nc') {
        return 'settlement form';
      } else if (type === 'public_offering') {
        return 'public offering';
      } else {
        return 'resale certificate';
      }
    };

    const applicationTypeTerm = getApplicationTypeTerm(applicationType);
    const requestTypeTerm = getRequestTypeTerm(applicationType);

    const subject = `Application Submitted - #${applicationId}`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Application Submitted Successfully</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for submitting your ${applicationTypeTerm}. We have received your request and will begin processing it immediately.</p>
            
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
                <li>We'll begin processing your ${requestTypeTerm} request</li>
                ${(applicationType === 'settlement_va' || applicationType === 'settlement_nc') ? '' : '<li>Property owner forms will be sent to the HOA for completion</li>'}
                <li>You'll receive email updates throughout the process</li>
                <li>Completed documents will be delivered electronically</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
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
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Application submission email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
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
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized multi-community email recipient: ${to} -> ${normalizedTo}`);
    }
    
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
                Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #3B82F6;">resales@gmgva.com</a>
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
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Multi-community notification email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
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
  applicationType,
}) => {
  try {
    console.log(`[EMAIL_SERVICE] App ${applicationId}: Starting email prep for ${to}`);
    
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EMAIL_SERVICE] App ${applicationId}: Normalized ${to} -> ${normalizedTo}`);
    }
    // Format application type for display
    const formatApplicationTypeForEmail = (type, rush) => {
      if (type === 'settlement_va') {
        return rush ? 'Settlement VA (Rush)' : 'Settlement VA';
      } else if (type === 'settlement_nc') {
        return rush ? 'Settlement NC (Rush)' : 'Settlement NC';
      } else if (type === 'multi_community') {
        return 'Multi-Community';
      } else if (type === 'lender_questionnaire') {
        return rush ? 'Lender Questionnaire (Rush)' : 'Lender Questionnaire';
      } else if (type === 'public_offering') {
        return rush ? 'Public Offering (Rush)' : 'Public Offering';
      } else {
        return rush ? 'Single Property (Rush)' : 'Single Property';
      }
    };

    const applicationTypeDisplay = formatApplicationTypeForEmail(applicationType, isRush);

    // Get the correct application type terminology for the email body
    const getApplicationTypeTerm = (type) => {
      if (type === 'lender_questionnaire') {
        return 'lender questionnaire application';
      } else if (type === 'settlement_va' || type === 'settlement_nc') {
        return 'settlement form application';
      } else if (type === 'public_offering') {
        return 'public offering application';
      } else if (type === 'multi_community') {
        return 'multi-community resale certificate application';
      } else {
        return 'resale certificate application';
      }
    };

    const applicationTypeTerm = getApplicationTypeTerm(applicationType);

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
            
            <p>A new ${applicationTypeTerm} has been submitted for <strong>${propertyName}</strong>${isMultiCommunity ? ' and its associated communities' : ''}.</p>
            
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
                  <td style="padding: 8px 0;">${applicationTypeDisplay}</td>
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
                <li>Process the ${applicationType === 'lender_questionnaire' ? 'lender questionnaire' : applicationType === 'settlement_va' || applicationType === 'settlement_nc' ? 'settlement form' : 'resale certificate'} request</li>
                <li>Update the application status as you progress</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com'}/admin/login?applicationId=${applicationId}" 
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
        console.log(`[EMAIL_SERVICE] App ${applicationId}: Attempting Microsoft Graph send to ${normalizedTo}`);
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log(`[EMAIL_SERVICE] App ${applicationId}: ✓ Microsoft Graph success for ${normalizedTo}`);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log(`[EMAIL_SERVICE] App ${applicationId}: Microsoft Graph failed, falling back to SMTP:`, error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
      subject,
      html,
    };

    console.log(`[EMAIL_SERVICE] App ${applicationId}: Sending via SMTP from ${emailFrom} to ${normalizedTo}`);
    const emailResponse = await transporter.sendMail(mailOptions);
    
    console.log(`[EMAIL_SERVICE] App ${applicationId}: ✓ SMTP success for ${normalizedTo}`, {
      messageId: emailResponse.messageId,
      accepted: emailResponse.accepted,
      rejected: emailResponse.rejected,
      response: emailResponse.response
    });
    
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error(`[EMAIL_SERVICE] App ${applicationId}: ✗ SMTP failed for ${to}`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
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
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized payment confirmation email recipient: ${to} -> ${normalizedTo}`);
    }
    
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
                Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
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
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Payment confirmation email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
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
  comments = null,
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized settlement form recipient email: ${to} -> ${normalizedTo}`);
    }
    
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
                 target="_blank"
                 rel="noopener noreferrer"
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
            
            ${comments ? `
            <div style="background-color: #EBF8FF; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${stateInfo.color};">
              <h4 style="color: ${stateInfo.color}; margin-top: 0;">💬 Additional Comments</h4>
              <p style="margin: 0; white-space: pre-wrap; color: #1F2937;">${escapeHtml(comments)}</p>
            </div>
            ` : ''}
            
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
                Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: ${stateInfo.color};">resales@gmgva.com</a>
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
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Settlement form email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo, // Use normalized email for consistent delivery
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

export const sendEmailConfirmationEmail = async ({
  to,
  confirmationToken,
  firstName,
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized confirmation email recipient: ${to} -> ${normalizedTo}`);
    }
    
    // Get logo path for CID attachment (MIME method)
    // According to https://mailtrap.io/blog/embedding-images-in-html-email-have-the-rules-changed/
    // CID attachments work well with desktop clients and are more reliable than base64
    const path = require('path');
    const fs = require('fs');
    const logoPath = path.join(process.cwd(), 'assets', 'company_logo_white.png');
    
    // Prepare CID attachment for logo
    const attachments = [];
    let logoCid = null;
    
    try {
      // Check if file exists
      if (fs.existsSync(logoPath)) {
        logoCid = 'company-logo-white';
        attachments.push({
          filename: 'company_logo_white.png',
          path: logoPath,
          cid: logoCid, // Content-ID for referencing in HTML
        });
        console.log(`[EmailService] ✅ Logo prepared as CID attachment: ${logoCid}`);
      } else {
        console.warn(`[EmailService] Logo file not found at: ${logoPath}, using text fallback`);
      }
    } catch (error) {
      console.error('[EmailService] Error preparing logo attachment:', error.message);
      // Continue without logo - email will still send but without logo image
    }
    
    // Get the base URL for confirmation link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
    const confirmationUrl = `${baseUrl}/auth/confirm-email?token=${confirmationToken}`;
    
    const subject = 'Verify Your Email Address - GMG ResaleFlow';
    
    // Optimized HTML template - compact to prevent Gmail clipping
    // Gmail clips emails over ~102KB, so we keep this minimal
    // Use CID reference for logo (MIME attachment method)
    const logoImg = logoCid
      ? `<img src="cid:${logoCid}" alt="GMG ResaleFlow" width="auto" height="60" border="0" style="height:60px;width:auto;display:block;max-width:100%;border:0;outline:none;text-decoration:none">`
      : `<div style="height:60px;color:#ffffff;font-size:24px;font-weight:bold;display:flex;align-items:center;justify-content:center">GMG ResaleFlow</div>`;
    
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify Your Email</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#374151;background-color:#f3f4f6;margin:0;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:20px;background-color:#f3f4f6"><tr><td align="center" style="padding:20px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.05)"><tr><td align="center" style="padding:32px 40px;background-color:#166534">${logoImg}</td></tr><tr><td style="padding:40px 40px 24px 40px;text-align:left"><h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.5px">Verify your email</h1><p style="margin:0 0 24px 0;font-size:16px;color:#4b5563">You're receiving this email because you registered for a GMG ResaleFlow account.</p><p style="margin:0 0 32px 0;font-size:16px;color:#4b5563">Please tap the button below to verify your email address.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="left"><a href="${confirmationUrl}" style="display:inline-block;padding:14px 28px;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">VERIFY EMAIL ADDRESS</a></td></tr></table></td></tr><tr><td style="padding:0 40px 40px 40px;text-align:center"><p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;padding-top:24px;border-top:1px solid #e5e7eb;line-height:1.5">If you didn't create an account, you can ignore this email.<br>&copy; Goodman Management Group. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;

    if (isGraphConfigured) {
      try {
        // Pass attachments to Microsoft Graph if supported, otherwise this might need adjustment depending on the implementation
        // For now, assuming basic HTML support. Attachments might need special handling in sendViaMicrosoftGraph
        const emailResponse = await sendViaMicrosoftGraph({ to: normalizedTo, subject, html });
        console.log('Email confirmation email sent successfully via Microsoft Graph:', emailResponse);
        return { success: true, response: emailResponse };
      } catch (error) {
        console.log('Microsoft Graph failed, falling back to SMTP:', error.message);
        // Fall through to SMTP
      }
    }

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const mailOptions = {
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: normalizedTo,
      subject,
      html,
      attachments, // Include CID attachments for logo
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email confirmation email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending email confirmation email:', error);
    throw error;
  }
};
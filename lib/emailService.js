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

// Clean filename by removing query parameters and URL fragments
const cleanFilename = (filename) => {
  if (!filename) return '';
  // Remove query parameters (everything after ?)
  let cleaned = filename.split('?')[0];
  // Remove URL fragments (everything after #)
  cleaned = cleaned.split('#')[0];
  return cleaned;
};

// Check if Microsoft Graph is configured
const checkGraphConfiguration = () => {
  const hasClientId = !!process.env.MICROSOFT_CLIENT_ID;
  const hasClientSecret = !!process.env.MICROSOFT_CLIENT_SECRET;
  const hasTenantId = !!process.env.MICROSOFT_TENANT_ID;
  const hasFromEmail = !!process.env.MICROSOFT_FROM_EMAIL;
  
  const isConfigured = hasClientId && hasClientSecret && hasTenantId && hasFromEmail;
  
  if (!isConfigured) {
    const missing = [];
    if (!hasClientId) missing.push('MICROSOFT_CLIENT_ID');
    if (!hasClientSecret) missing.push('MICROSOFT_CLIENT_SECRET');
    if (!hasTenantId) missing.push('MICROSOFT_TENANT_ID');
    if (!hasFromEmail) missing.push('MICROSOFT_FROM_EMAIL');
    
    console.warn('[Microsoft Graph] Configuration incomplete. Missing environment variables:', missing.join(', '));
    console.warn('[Microsoft Graph] Will use SMTP fallback until Microsoft Graph is fully configured.');
  }
  
  return isConfigured;
};

const isGraphConfigured = checkGraphConfiguration();

// Initialize Microsoft Graph client (only if configured)
let graphClient = null;
if (isGraphConfigured) {
  try {
    console.log('[Microsoft Graph] Initializing client...');
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

    console.log('[Microsoft Graph] ✓ Client initialized successfully');
    console.log('[Microsoft Graph] From email:', process.env.MICROSOFT_FROM_EMAIL);
  } catch (error) {
    console.error('[Microsoft Graph] ✗ Failed to initialize client:', {
      message: error.message,
      stack: error.stack
    });
    graphClient = null;
    console.warn('[Microsoft Graph] Will use SMTP fallback due to initialization failure');
  }
} else {
  console.log('[Microsoft Graph] Skipping initialization - configuration incomplete');
}

// Microsoft Graph email sending function
const sendViaMicrosoftGraph = async ({ to, subject, html, from, attachments = [] }) => {
  if (!graphClient) {
    throw new Error('Microsoft Graph client not initialized');
  }

  try {
    const fromEmail = from || process.env.MICROSOFT_FROM_EMAIL;
    
    // Normalize recipient email
    const toEmail = normalizeEmail(to);

    // Process attachments for Microsoft Graph format
    // For CID attachments (inline images), convert to base64 data URIs in HTML
    let processedHtml = html;
    const graphAttachments = [];
    
    if (attachments && attachments.length > 0) {
      const fs = require('fs');
      
      for (const attachment of attachments) {
        if (attachment.cid) {
          // CID attachment - convert to base64 data URI
          try {
            if (attachment.path && fs.existsSync(attachment.path)) {
              const fileBuffer = fs.readFileSync(attachment.path);
              const base64 = fileBuffer.toString('base64');
              const mimeType = attachment.contentType || 'image/png';
              const dataUri = `data:${mimeType};base64,${base64}`;
              
              // Replace CID reference with data URI (handle various formats)
              // Match: cid:company-logo-white or "cid:company-logo-white" or 'cid:company-logo-white'
              const cidPattern = new RegExp(`(["']?)cid:${attachment.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'gi');
              processedHtml = processedHtml.replace(cidPattern, dataUri);
              console.log(`[Microsoft Graph] Converted CID attachment ${attachment.cid} to data URI (${Math.round(base64.length / 1024)}KB)`);
            } else {
              console.warn(`[Microsoft Graph] Logo file not found at path: ${attachment.path}`);
            }
          } catch (error) {
            console.warn(`[Microsoft Graph] Failed to process CID attachment ${attachment.cid}:`, error.message);
          }
        } else {
          // Regular attachment - add to attachments array
          try {
            if (attachment.path && fs.existsSync(attachment.path)) {
              const fileBuffer = fs.readFileSync(attachment.path);
              graphAttachments.push({
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: attachment.filename || 'attachment',
                contentType: attachment.contentType || 'application/octet-stream',
                contentBytes: fileBuffer.toString('base64')
              });
            }
          } catch (error) {
            console.warn(`[Microsoft Graph] Failed to process attachment ${attachment.filename}:`, error.message);
          }
        }
      }
    }

    // Prepare the email message in Microsoft Graph format
    const message = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: processedHtml
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
        },
        attachments: graphAttachments.length > 0 ? graphAttachments : undefined
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

// SMTP email sending function (fallback method)
const sendViaSMTP = async ({ to, subject, html, attachments = [] }) => {
  const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
  const mailOptions = {
    from: `"GMG ResaleFlow" <${emailFrom}>`,
    to: normalizeEmail(to),
    subject,
    html,
    attachments,
  };

  const emailResponse = await transporter.sendMail(mailOptions);
  console.log('[SMTP] Email sent successfully to:', normalizeEmail(to));
  return {
    success: true,
    messageId: emailResponse.messageId,
    response: emailResponse
  };
};

/**
 * Unified email sending function with automatic fallback
 * Primary: Microsoft Graph API
 * Fallback: SMTP (if Graph fails or not configured)
 */
const sendEmail = async ({ to, subject, html, from, attachments = [], context = '' }) => {
  const normalizedTo = normalizeEmail(to);
  const logPrefix = context ? `[${context}]` : '[EmailService]';
  
  // Try Microsoft Graph first (primary method)
  if (isGraphConfigured && graphClient) {
    try {
      console.log(`${logPrefix} Attempting to send via Microsoft Graph (primary) to: ${normalizedTo}`);
      const emailResponse = await sendViaMicrosoftGraph({ 
        to: normalizedTo, 
        subject, 
        html, 
        from,
        attachments 
      });
      console.log(`${logPrefix} ✓ Successfully sent via Microsoft Graph to: ${normalizedTo}`);
      return { success: true, method: 'microsoft-graph', response: emailResponse };
    } catch (error) {
      console.warn(`${logPrefix} Microsoft Graph failed, falling back to SMTP:`, {
        error: error.message,
        code: error.code,
        statusCode: error.statusCode
      });
      // Fall through to SMTP fallback
    }
  } else {
    console.log(`${logPrefix} Microsoft Graph not configured, using SMTP fallback`);
  }

  // Fallback to SMTP
  try {
    console.log(`${logPrefix} Attempting to send via SMTP (fallback) to: ${normalizedTo}`);
    const emailResponse = await sendViaSMTP({ to: normalizedTo, subject, html, attachments });
    console.log(`${logPrefix} ✓ Successfully sent via SMTP to: ${normalizedTo}`);
    return { success: true, method: 'smtp', response: emailResponse };
  } catch (error) {
    console.error(`${logPrefix} ✗ Both Microsoft Graph and SMTP failed for: ${normalizedTo}`, {
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    throw error;
  }
};

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
          const cleanName = cleanFilename(link.filename);
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 target="_blank"
                 rel="noopener noreferrer"
                 style="color: #166534; text-decoration: none; font-weight: 500; display: inline-block; padding: 8px 12px; background-color: #f0f9ff; border-radius: 4px; border: 1px solid #e0e7ff;"
                 onmouseover="this.style.backgroundColor='#dbeafe'" 
                 onmouseout="this.style.backgroundColor='#f0f9ff'">
                ${icon} ${cleanName}${sizeText}
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'ApprovalEmail'
    });
  } catch (error) {
    console.error('Error sending approval email:', error);
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'ApplicationSubmission'
    });
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'MultiCommunityNotification'
    });
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: `PropertyManagerNotification-${applicationId}`
    });
  } catch (error) {
    console.error(`[EMAIL_SERVICE] App ${applicationId}: ✗ Failed to send property manager notification to ${to}`, {
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'PaymentConfirmation'
    });
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
          const cleanName = cleanFilename(link.filename);
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 target="_blank"
                 rel="noopener noreferrer"
                 style="color: ${stateInfo.color}; text-decoration: none; font-weight: 500; display: inline-block; padding: 8px 12px; background-color: #f0f9ff; border-radius: 4px; border: 1px solid #e0e7ff;"
                 onmouseover="this.style.backgroundColor='#dbeafe'" 
                 onmouseout="this.style.backgroundColor='#f0f9ff'">
                ${icon} ${cleanName}${sizeText}
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

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'SettlementForm'
    });
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
    
    // Get the base URL for confirmation link and logo
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
    const confirmationUrl = `${baseUrl}/auth/confirm-email?token=${confirmationToken}`;
    
    // Check if we're in local development (localhost URLs won't work in email clients)
    const isLocalDev = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('your-app-url.com');
    
    // Prepare logo - use base64 for local dev, public URL for production
    const path = require('path');
    const fs = require('fs');
    const logoPath = path.join(process.cwd(), 'public', 'company_logo_white.png');
    let logoImg = '';
    
    if (isLocalDev) {
      // Local development: Use base64 (email clients can't access localhost URLs)
      try {
        if (fs.existsSync(logoPath)) {
          const fileBuffer = fs.readFileSync(logoPath);
          const base64 = fileBuffer.toString('base64');
          const logoDataUri = `data:image/png;base64,${base64}`;
          logoImg = `<img src="${logoDataUri}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
          console.log(`[EmailService] ✅ Logo embedded as base64 for local dev (${Math.round(base64.length / 1024)}KB)`);
        } else {
          const assetsLogoPath = path.join(process.cwd(), 'assets', 'company_logo_white.png');
          if (fs.existsSync(assetsLogoPath)) {
            const fileBuffer = fs.readFileSync(assetsLogoPath);
            const base64 = fileBuffer.toString('base64');
            const logoDataUri = `data:image/png;base64,${base64}`;
            logoImg = `<img src="${logoDataUri}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
            console.log(`[EmailService] ✅ Logo embedded from assets as base64 for local dev (${Math.round(base64.length / 1024)}KB)`);
          } else {
            logoImg = `<div style="color:#ffffff;font-size:20px;font-weight:600;text-align:center">GMG ResaleFlow</div>`;
            console.warn(`[EmailService] Logo file not found, using text fallback`);
          }
        }
      } catch (error) {
        console.error('[EmailService] Error reading logo file:', error.message);
        logoImg = `<div style="color:#ffffff;font-size:20px;font-weight:600;text-align:center">GMG ResaleFlow</div>`;
      }
    } else {
      // Production: Use public URL (Gmail web requires this)
      const logoUrl = `${baseUrl}/company_logo_white.png`;
      logoImg = `<img src="${logoUrl}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
      console.log(`[EmailService] ✅ Logo using public URL: ${logoUrl}`);
    }
    
    const subject = 'Verify Your Email Address - GMG ResaleFlow';
    
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verify Your Email</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#374151;background-color:#f3f4f6;margin:0;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:20px;background-color:#f3f4f6"><tr><td align="center" style="padding:20px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.05)"><tr><td align="center" style="padding:32px 40px;background-color:#166534">${logoImg}</td></tr><tr><td style="padding:40px 40px 24px 40px;text-align:center"><h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.5px">Verify your email</h1><p style="margin:0 0 24px 0;font-size:16px;color:#4b5563">You're receiving this email because you registered for a GMG ResaleFlow account.</p><p style="margin:0 0 32px 0;font-size:16px;color:#4b5563">Please tap the button below to verify your email address.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><a href="${confirmationUrl}" style="display:inline-block;padding:14px 28px;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">VERIFY EMAIL ADDRESS</a></td></tr></table></td></tr><tr><td style="padding:0 40px 40px 40px;text-align:center"><p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;padding-top:24px;border-top:1px solid #e5e7eb;line-height:1.5">If you didn't create an account, you can ignore this email.<br>&copy; Goodman Management Group. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'EmailConfirmation'
    });
  } catch (error) {
    console.error('Error sending email confirmation email:', error);
    throw error;
  }
};

export const sendPasswordResetEmail = async ({
  to,
  resetToken,
  firstName,
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized password reset email recipient: ${to} -> ${normalizedTo}`);
    }
    
    // Get the base URL for reset link and logo
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    // Check if we're in local development (localhost URLs won't work in email clients)
    const isLocalDev = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes('your-app-url.com');
    
    // Prepare logo - use base64 for local dev, public URL for production
    const path = require('path');
    const fs = require('fs');
    const logoPath = path.join(process.cwd(), 'public', 'company_logo_white.png');
    let logoImg = '';
    
    if (isLocalDev) {
      // Local development: Use base64 (email clients can't access localhost URLs)
      try {
        if (fs.existsSync(logoPath)) {
          const fileBuffer = fs.readFileSync(logoPath);
          const base64 = fileBuffer.toString('base64');
          const logoDataUri = `data:image/png;base64,${base64}`;
          logoImg = `<img src="${logoDataUri}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
          console.log(`[EmailService] ✅ Logo embedded as base64 for local dev (${Math.round(base64.length / 1024)}KB)`);
        } else {
          const assetsLogoPath = path.join(process.cwd(), 'assets', 'company_logo_white.png');
          if (fs.existsSync(assetsLogoPath)) {
            const fileBuffer = fs.readFileSync(assetsLogoPath);
            const base64 = fileBuffer.toString('base64');
            const logoDataUri = `data:image/png;base64,${base64}`;
            logoImg = `<img src="${logoDataUri}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
            console.log(`[EmailService] ✅ Logo embedded from assets as base64 for local dev (${Math.round(base64.length / 1024)}KB)`);
          } else {
            logoImg = `<div style="color:#ffffff;font-size:20px;font-weight:600;text-align:center">GMG ResaleFlow</div>`;
            console.warn(`[EmailService] Logo file not found, using text fallback`);
          }
        }
      } catch (error) {
        console.error('[EmailService] Error reading logo file:', error.message);
        logoImg = `<div style="color:#ffffff;font-size:20px;font-weight:600;text-align:center">GMG ResaleFlow</div>`;
      }
    } else {
      // Production: Use public URL (Gmail web requires this)
      const logoUrl = `${baseUrl}/company_logo_white.png`;
      logoImg = `<img src="${logoUrl}" alt="GMG ResaleFlow" width="200" height="60" border="0" style="height:60px;width:auto;max-width:200px;display:block;margin:0 auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic" />`;
      console.log(`[EmailService] ✅ Logo using public URL: ${logoUrl}`);
    }
    
    const subject = 'Reset Your Password - GMG ResaleFlow';
    
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset Your Password</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#374151;background-color:#f3f4f6;margin:0;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:20px;background-color:#f3f4f6"><tr><td align="center" style="padding:20px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.05)"><tr><td align="center" style="padding:32px 40px;background-color:#166534">${logoImg}</td></tr><tr><td style="padding:40px 40px 24px 40px;text-align:center"><h1 style="margin:0 0 16px 0;font-size:24px;font-weight:700;color:#111827;letter-spacing:-0.5px">Reset your password</h1><p style="margin:0 0 24px 0;font-size:16px;color:#4b5563">You're receiving this email because you requested a password reset for your GMG ResaleFlow account.</p><p style="margin:0 0 32px 0;font-size:16px;color:#4b5563">Please tap the button below to reset your password. This link will expire in 1 hour.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background-color:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;text-align:center;text-transform:uppercase;letter-spacing:0.5px">RESET PASSWORD</a></td></tr></table></td></tr><tr><td style="padding:0 40px 40px 40px;text-align:center"><p style="margin:24px 0 0 0;font-size:12px;color:#9ca3af;padding-top:24px;border-top:1px solid #e5e7eb;line-height:1.5">If you didn't request a password reset, you can safely ignore this email.<br>&copy; Goodman Management Group. All rights reserved.</p></td></tr></table></td></tr></table></body></html>`;

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'PasswordReset'
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};
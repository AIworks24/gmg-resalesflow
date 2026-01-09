import nodemailer from 'nodemailer';
import { normalizeEmail } from './emailUtils';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import 'isomorphic-fetch';
import { minifyEmailHtml, getEmailSize } from './emailMinifier';

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
const sendViaMicrosoftGraph = async ({ to, subject, html, from, attachments = [], cc = [] }) => {
  if (!graphClient) {
    throw new Error('Microsoft Graph client not initialized');
  }

  try {
    const fromEmail = from || process.env.MICROSOFT_FROM_EMAIL;
    
    // Normalize recipient email
    const toEmail = normalizeEmail(to);
    
    // Normalize CC emails
    const normalizedCc = Array.isArray(cc) 
      ? cc.map(email => normalizeEmail(email)).filter(email => email)
      : [];

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
        ccRecipients: normalizedCc.length > 0 ? normalizedCc.map(email => ({
          emailAddress: {
            address: email
          }
        })) : undefined,
        from: {
          emailAddress: {
            address: fromEmail,
            name: 'GMG ResaleFlow'
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
const sendViaSMTP = async ({ to, subject, html, attachments = [], cc = [] }) => {
  const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
  
  // Normalize CC emails
  const normalizedCc = Array.isArray(cc) 
    ? cc.map(email => normalizeEmail(email)).filter(email => email)
    : [];
  
  const mailOptions = {
    from: `"GMG ResaleFlow" <${emailFrom}>`,
    to: normalizeEmail(to),
    subject,
    html,
    attachments,
    ...(normalizedCc.length > 0 && { cc: normalizedCc.join(', ') }),
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
const sendEmail = async ({ to, subject, html, from, attachments = [], context = '', cc = [] }) => {
  const normalizedTo = normalizeEmail(to);
  const logPrefix = context ? `[${context}]` : '[EmailService]';
  
  // Normalize CC emails for logging
  const normalizedCc = Array.isArray(cc) 
    ? cc.map(email => normalizeEmail(email)).filter(email => email)
    : [];
  const ccLog = normalizedCc.length > 0 ? ` (CC: ${normalizedCc.join(', ')})` : '';
  
  // Try Microsoft Graph first (primary method)
  if (isGraphConfigured && graphClient) {
    try {
      console.log(`${logPrefix} Attempting to send via Microsoft Graph (primary) to: ${normalizedTo}${ccLog}`);
      const emailResponse = await sendViaMicrosoftGraph({ 
        to: normalizedTo, 
        subject, 
        html, 
        from,
        attachments,
        cc: normalizedCc
      });
      console.log(`${logPrefix} ✓ Successfully sent via Microsoft Graph to: ${normalizedTo}${ccLog}`);
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
    console.log(`${logPrefix} Attempting to send via SMTP (fallback) to: ${normalizedTo}${ccLog}`);
    const emailResponse = await sendViaSMTP({ to: normalizedTo, subject, html, attachments, cc: normalizedCc });
    console.log(`${logPrefix} ✓ Successfully sent via SMTP to: ${normalizedTo}${ccLog}`);
    return { success: true, method: 'smtp', response: emailResponse };
  } catch (error) {
    console.error(`${logPrefix} ✗ Both Microsoft Graph and SMTP failed for: ${normalizedTo}${ccLog}`, {
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
  cc = [],
}) => {
  try {
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized approval email recipient: ${to} -> ${normalizedTo}`);
    }
    
    // Logo URL and brand colors
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';
    const brandColorLight = '#1a5f47';
    
    // Generate download links HTML
    const downloadLinksHtml = downloadLinks.length > 0 
      ? downloadLinks.map(link => {
          const sizeText = link.size && link.size !== 'Unknown' ? ` <span style="color: #6b7280; font-size: 12px;">(${link.size} bytes)</span>` : '';
          const cleanName = cleanFilename(link.filename);
          return `
            <div style="margin-bottom: 12px; padding: 16px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; transition: all 0.2s;">
              <a href="${link.downloadUrl}" 
                 target="_blank"
                 rel="noopener noreferrer"
                 style="color: ${brandColor}; text-decoration: none; font-weight: 600; font-size: 15px; display: block; margin-bottom: 4px;">
                ${cleanName}${sizeText}
              </a>
              ${link.description ? `<p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5;">${link.description}</p>` : ''}
            </div>
          `;
        }).join('')
      : '<p style="color: #6b7280; font-size: 14px; margin: 0;">No additional documents available.</p>';

    // Use custom subject/message for settlement, otherwise use default
    const subject = customSubject || `Your Resale Certificate for ${propertyAddress} is Ready for Download`;
    const title = customTitle || 'Your Resale Certificate is Ready!';
    const message = customMessage || `Your resale certificate and supporting documents for <strong>${propertyAddress}</strong> in <strong>${hoaName}</strong> are now ready for download.`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                  
                  <!-- Header -->
                  <tr>
                    <td style="background-color: ${brandColor}; padding: 40px 30px;">
                      <!-- Logo -->
                      <div style="text-align: left; margin-bottom: 24px;">
                        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height: 42px; width: auto; max-width: 140px; display: block; border: 0; outline: none; text-decoration: none;" />
                      </div>
                      <!-- Title -->
                      <div style="text-align: center;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600; letter-spacing: -0.5px; line-height: 1.2;">${title}</h1>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px; background-color: #ffffff;">
                      <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">Dear ${submitterName},</p>
                      <p style="margin: 0 0 30px 0; color: #374151; font-size: 15px; line-height: 1.6;">${message}</p>
                      
                      <!-- Download Section -->
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px; margin: 30px 0;">
                        <h2 style="margin: 0 0 16px 0; color: ${brandColor}; font-size: 18px; font-weight: 600; letter-spacing: -0.3px;">Your Documents Are Ready for Download</h2>
                        <p style="margin: 0 0 20px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">Click on the documents below to download:</p>
                        <div style="margin-top: 16px;">
                          ${downloadLinksHtml}
                        </div>
                      </div>
                      
                      ${comments ? `
                      <!-- Comments Section -->
                      <div style="background-color: #eff6ff; border-left: 4px solid ${brandColor}; border-radius: 6px; padding: 20px; margin: 24px 0;">
                        <h3 style="margin: 0 0 12px 0; color: ${brandColor}; font-size: 16px; font-weight: 600;">Additional Comments</h3>
                        <p style="margin: 0; color: #1f2937; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(comments)}</p>
                      </div>
                      ` : ''}
                      
                      <!-- Important Notice -->
                      <div style="background-color: #fef3c7; border-left: 4px solid #d97706; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
                        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                          <strong>Important:</strong> Download links are valid for <strong>30 days</strong>. Please save the documents to your computer for future reference.
                        </p>
                      </div>
                      
                      <!-- Application ID -->
                      <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px 20px; margin: 24px 0;">
                        <p style="margin: 0; color: #374151; font-size: 13px; line-height: 1.5;">
                          <strong style="color: ${brandColor};">Application ID:</strong> <span style="font-family: 'Courier New', monospace; color: #6b7280;">${applicationId}</span>
                        </p>
                      </div>
                      
                      <!-- Contact Section -->
                      <div style="text-align: center; margin: 32px 0 24px 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                        <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                          Questions? We're here to help.
                        </p>
                        <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">
                          Contact us at <a href="mailto:resales@gmgva.com" style="color: ${brandColor}; text-decoration: none; font-weight: 500;">resales@gmgva.com</a>
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f9fafb; padding: 24px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #6b7280; font-size: 12px; line-height: 1.5;">
                        <strong style="color: #374151;">Goodman Management Group</strong><br>
                        Professional HOA Management & Resale Services
                      </p>
                    </td>
                  </tr>
                  
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;

    // Normalize CC emails
    const normalizedCc = Array.isArray(cc) 
      ? cc.map(email => normalizeEmail(email)).filter(email => email)
      : [];

    return await sendEmail({
      to: normalizedTo,
      subject,
      html,
      context: 'ApprovalEmail',
      cc: normalizedCc
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
  linkedProperties = [], // Optional: for multi-community applications
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

    // Format application type for display
    // If it's a settlement on a multi-community property, show "Multi-Community (Settlement VA/NC)"
    const getApplicationTypeDisplay = (type, hasLinkedProperties = false) => {
      // Check if it's a settlement type on a multi-community property
      if (hasLinkedProperties && (type === 'settlement_va' || type === 'settlement_nc')) {
        if (type === 'settlement_va') {
          return 'Multi-Community (Settlement VA)';
        } else {
          return 'Multi-Community (Settlement NC)';
        }
      }
      
      // Standard display logic
      if (type === 'settlement_va') {
        return 'Settlement VA';
      } else if (type === 'settlement_nc') {
        return 'Settlement NC';
      } else if (type === 'multi_community') {
        return 'Multi-Community';
      } else if (type === 'lender_questionnaire') {
        return 'Lender Questionnaire';
      } else if (type === 'public_offering') {
        return 'Public Offering';
      } else {
        return 'Single Property';
      }
    };

    const applicationTypeTerm = getApplicationTypeTerm(applicationType);
    const requestTypeTerm = getRequestTypeTerm(applicationType);
    const hasLinkedProps = linkedProperties && linkedProperties.length > 0;
    const applicationTypeDisplay = getApplicationTypeDisplay(applicationType, hasLinkedProps);

    // Logo URL from Supabase storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';
    const brandColorLight = '#1a5f47';

    const subject = `Application Submitted - #${applicationId}`;
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Application Submitted</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6; color: #333333;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td>
  <![endif]-->
  <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header with Logo -->
    <div class="email-header" style="background-color: ${brandColor}; padding: 30px 20px; position: relative;">
      <!-- Logo - Top Left -->
      <div style="margin-bottom: 16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height: 42px; width: auto; max-width: 140px; display: block; border: 0; outline: none; text-decoration: none;" />
      </div>
      <!-- Title - Centered -->
      <div style="text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Application Submitted</h1>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="email-content" style="padding: 30px 20px; background-color: #ffffff;">
      <p class="email-text" style="margin: 0 0 16px 0; font-size: 16px; color: #333333;">Dear ${escapeHtml(customerName)},</p>
      <p class="email-text-muted" style="margin: 0 0 24px 0; font-size: 16px; color: #666666;">Thank you for submitting your ${escapeHtml(applicationTypeTerm)}. We have received your request and will begin processing it according to your selected timeline.</p>
      
      <!-- Application Details Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: ${brandColor};">Application Details</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Application ID:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">#${escapeHtml(applicationId)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Application Type:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(applicationTypeDisplay)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Property Address:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(propertyAddress)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">HOA Community:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(hoaName)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Processing Type:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Expected Completion:</strong></td>
            <td style="padding: 12px 0; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${expectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
          </tr>
        </table>
      </div>
      
      ${linkedProperties && linkedProperties.length > 0 ? `
      <!-- Multi-Community Properties Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: ${brandColor};">Included Properties</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; font-weight: 500;">1. ${escapeHtml(hoaName)} (Primary Property)</td>
          </tr>
          ${linkedProperties.map((prop, index) => {
            const propName = prop.property_name || prop.name || 'Unknown Property';
            const propLocation = prop.location || '';
            return `
          <tr>
            <td style="padding: 8px 0; ${index < linkedProperties.length - 1 ? 'border-bottom: 1px solid #e5e7eb;' : ''} font-size: 14px; color: #111827;">${index + 2}. ${escapeHtml(propName)}${propLocation ? ` (${escapeHtml(propLocation)})` : ''}</td>
          </tr>
          `;
          }).join('')}
        </table>
        <div style="margin-top: 16px; padding: 12px; background-color: #f0f9f4; border-radius: 6px; border-left: 4px solid ${brandColor};">
          <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
            <strong>Note:</strong> These properties will be processed separately. You will receive individual updates for each property as they are completed.
          </p>
        </div>
      </div>
      ` : ''}
      
      ${(() => {
        // Generate dynamic "What Happens Next?" content based on application type
        let nextSteps = [];
        
        switch (applicationType) {
          case 'lender_questionnaire':
            nextSteps = [
              'We\'ll begin processing your lender questionnaire request',
              'Property owner forms will be sent to the HOA for completion',
              'You\'ll receive email updates throughout the process',
              'Completed lender questionnaire will be delivered electronically'
            ];
            break;
            
          case 'settlement_va':
          case 'settlement_nc':
            nextSteps = [
              'We\'ll begin processing your settlement forms request',
              'Settlement forms will be prepared and sent to the HOA',
              'You\'ll receive email updates throughout the process',
              'Completed settlement forms will be delivered electronically'
            ];
            break;
            
          case 'public_offering':
            nextSteps = [
              'We\'ll begin processing your public offering statement request',
              'The public offering statement will be prepared',
              'You\'ll receive email updates throughout the process',
              'The completed public offering statement will be delivered electronically'
            ];
            break;
            
          case 'multi_community':
            nextSteps = [
              'We\'ll begin processing your multi-community resale certificate request',
              'Property owner forms will be sent to each HOA for completion',
              'You\'ll receive email updates throughout the process',
              'Completed documents for all communities will be delivered electronically'
            ];
            break;
            
          case 'single_property':
          default:
            nextSteps = [
              'We\'ll begin processing your resale certificate request',
              'Property owner forms will be sent to the HOA for completion',
              'You\'ll receive email updates throughout the process',
              'Completed documents will be delivered electronically'
            ];
            break;
        }
        
        return `
      <!-- What Happens Next Card -->
      <div style="background-color: #f0f9ff; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #bae6fd;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr>
            <td style="width: 4px; padding: 0; vertical-align: middle;">
              <div style="width: 4px; height: 24px; background-color: ${brandColor}; border-radius: 2px;"></div>
            </td>
            <td style="padding: 0 0 0 12px; vertical-align: middle;">
              <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: ${brandColor};">What Happens Next?</h3>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
          ${nextSteps.map((step, index) => `
          <tr>
            <td style="padding: 0 0 12px 0; vertical-align: top; width: 40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse: collapse;">
                <tr>
                  <td style="width: 24px; height: 24px; background-color: ${brandColor}; border-radius: 50%; text-align: center; vertical-align: middle; padding: 0;">
                    <span style="color: #ffffff; font-size: 12px; font-weight: 700; line-height: 24px; display: block;">${index + 1}</span>
                  </td>
                </tr>
              </table>
            </td>
            <td style="padding: 0 0 12px 12px; font-size: 15px; color: #1e293b; line-height: 1.6; vertical-align: top;">
              ${escapeHtml(step)}
            </td>
          </tr>
          `).join('')}
        </table>
      </div>
              `;
      })()}
      
      <!-- Contact Information -->
      <div style="text-align: center; margin: 0 0 24px 0; padding: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #6b7280;">
          Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: ${brandColor}; text-decoration: none; font-weight: 500;">resales@gmgva.com</a>
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 24px 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
        <strong style="color: ${brandColor}; font-weight: 600;">Goodman Management Group</strong><br>
        Professional HOA Management & Resale Services
      </p>
    </div>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <!-- Dark Mode Support -->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-container {
        background-color: #1f2937 !important;
        color: #f9fafb !important;
      }
      .email-content {
        background-color: #111827 !important;
        color: #f9fafb !important;
      }
      .email-card {
        background-color: #1f2937 !important;
        border-color: #374151 !important;
      }
      .email-text {
        color: #d1d5db !important;
      }
      .email-text-muted {
        color: #9ca3af !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        padding: 0 !important;
      }
      .email-content {
        padding: 20px 16px !important;
      }
      .email-header {
        padding: 24px 16px !important;
      }
      .email-header h1 {
        font-size: 24px !important;
      }
      table[role="presentation"] {
        width: 100% !important;
      }
      td {
        display: block !important;
        width: 100% !important;
        text-align: left !important;
        padding: 8px 0 !important;
        border-bottom: none !important;
      }
      td[style*="text-align: right"] {
        text-align: left !important;
      }
    }
  </style>
</body>
</html>
      `;

    // Minify HTML to reduce email size and prevent Gmail clipping (102KB threshold)
    const minifiedHtml = minifyEmailHtml(html);
    const htmlSize = getEmailSize(minifiedHtml);
    
    if (htmlSize > 100) {
      console.warn(`[EmailService] Application submission email size is ${htmlSize}KB, approaching Gmail's 102KB clipping threshold`);
    } else {
      console.log(`[EmailService] Application submission email size: ${htmlSize}KB`);
    }

    return await sendEmail({
      to: normalizedTo,
      subject,
      html: minifiedHtml,
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

export const sendInvoiceReceiptEmail = async ({
  to,
  applicationId,
  customerName,
  propertyAddress,
  packageType,
  totalAmount,
  invoiceNumber,
  invoicePdfUrl,
  hostedInvoiceUrl,
  stripeChargeId,
  invoiceDate,
  applicationType = 'single_property', // Default to single_property if not provided
  paymentMethod = null, // Payment method (e.g., "VISA - 8008")
  lineItems = [], // Array of { name, amount, quantity } objects
}) => {
  try {
    // Debug logging
    console.log(`[EmailService] sendInvoiceReceiptEmail called with:`);
    console.log(`  - paymentMethod: ${paymentMethod}`);
    console.log(`  - lineItems: ${JSON.stringify(lineItems)}`);
    console.log(`  - lineItems.length: ${lineItems?.length || 0}`);
    
    // Normalize email to lowercase for consistent delivery
    const normalizedTo = normalizeEmail(to);
    if (normalizedTo !== to) {
      console.log(`[EmailService] Normalized invoice/receipt email recipient: ${to} -> ${normalizedTo}`);
    }

    const formattedDate = invoiceDate 
      ? new Date(invoiceDate).toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      : new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        });

    // Extract card brand and last 4 from payment method string (e.g., "VISA - 4242")
    let cardBrand = null;
    let cardLast4 = null;
    if (paymentMethod) {
      const match = paymentMethod.match(/^([A-Z]+)\s*-\s*(\d+)$/);
      if (match) {
        cardBrand = match[1].toUpperCase();
        cardLast4 = match[2];
      }
    }

    // Get credit card icon URL from Supabase storage
    // Card icons are hosted externally to reduce email HTML size and prevent Gmail clipping
    const getCardIconUrl = (brand) => {
      if (!brand) return null;
      const brandUpper = brand.toUpperCase();
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      const iconMap = {
        'VISA': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/visa.png`,
        'MASTERCARD': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/mastercard.png`,
        'AMEX': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/americanexpress.png`,
        'AMERICAN EXPRESS': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/americanexpress.png`,
        'DISCOVER': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/discover.png`,
        'DINERS': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/dinersclub.png`,
        'DINERS CLUB': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/dinersclub.png`,
        'JCB': `${supabaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/jcb.png`,
      };
      return iconMap[brandUpper] || null;
    };

    // Get credit card logo/brand display with hosted icon
    const getCardBrandDisplay = (brand) => {
      if (!brand) return '';
      const brandUpper = brand.toUpperCase();
      const iconUrl = getCardIconUrl(brand);
      
      // If icon is available, use it; otherwise fall back to styled text badge
      if (iconUrl) {
        return `<img src="${iconUrl}" alt="${brandUpper}" width="40" height="26" style="height: 26px; width: auto; max-width: 40px; display: inline-block; vertical-align: middle; border: 0; outline: none; text-decoration: none;" />`;
      }
      
      // Fallback: Use brand name with styling - email clients have limited SVG support
      const brandColors = {
        'VISA': '#1A1F71',
        'MASTERCARD': '#EB001B',
        'AMEX': '#006FCF',
        'AMERICAN EXPRESS': '#006FCF',
        'DISCOVER': '#FF6000'
      };
      const color = brandColors[brandUpper] || '#0f4734';
      return `<span style="display: inline-block; background-color: ${color}; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; letter-spacing: 0.5px; text-transform: uppercase;">${brandUpper}</span>`;
    };

    // Logo URL from Supabase storage - use environment variable for flexibility
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';
    const brandColorLight = '#1a5f47';
    
    const subject = `Payment Receipt #${invoiceNumber}`;
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Payment Receipt</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6; color: #333333;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td>
  <![endif]-->
  <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header with Logo -->
    <div class="email-header" style="background-color: ${brandColor}; padding: 30px 20px; position: relative;">
      <!-- Logo - Top Left -->
      <div style="margin-bottom: 16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height: 42px; width: auto; max-width: 140px; display: block; border: 0; outline: none; text-decoration: none;" />
      </div>
      <!-- Payment Receipt Title - Centered -->
      <div style="text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Payment Receipt</h1>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="email-content" style="padding: 30px 20px; background-color: #ffffff;">
      <p class="email-text" style="margin: 0 0 16px 0; font-size: 16px; color: #333333;">Dear ${escapeHtml(customerName)},</p>
      <p class="email-text-muted" style="margin: 0 0 24px 0; font-size: 16px; color: #666666;">Thank you for your payment! Please find your receipt below.</p>
      
      <!-- Receipt Details Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: ${brandColor};">Receipt Details</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Receipt Number:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">#${escapeHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Payment Date:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${formattedDate}</td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Processing Type:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
          </tr>
          ${paymentMethod && cardBrand ? `
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Payment Method:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right;">
              ${getCardBrandDisplay(cardBrand)} <span style="margin-left: 8px; font-weight: 500;">•••• ${cardLast4}</span>
            </td>
          </tr>
          ` : ''}
          ${stripeChargeId ? `
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Payment Reference:</strong></td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500; font-family: monospace;">${stripeChargeId}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 12px 0; font-size: 14px; color: #6b7280;"><strong style="color: #374151;">Total Amount Paid:</strong></td>
            <td style="padding: 12px 0; font-size: 20px; color: ${brandColor}; text-align: right; font-weight: 700;">$${totalAmount}</td>
          </tr>
        </table>
      </div>
      
      ${lineItems && lineItems.length > 0 ? `
      <!-- Summary Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb;">
        <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: ${brandColor};">Summary</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width: 100%; border-collapse: collapse;">
          ${lineItems.map(item => `
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #374151;">${escapeHtml(item.name)}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</td>
            <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 600;">$${item.amount}</td>
          </tr>
          `).join('')}
          <tr>
            <td style="padding: 16px 0 0 0; font-size: 16px; font-weight: 600; color: #374151;">Amount paid</td>
            <td style="padding: 16px 0 0 0; font-size: 20px; color: ${brandColor}; text-align: right; font-weight: 700;">$${totalAmount}</td>
          </tr>
        </table>
      </div>
      ` : ''}
      
      <!-- Contact Information -->
      <div style="text-align: center; margin: 0 0 24px 0; padding: 20px 0;">
        <p style="margin: 0; font-size: 14px; color: #6b7280;">
          Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: ${brandColor}; text-decoration: none; font-weight: 500;">resales@gmgva.com</a>
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f9fafb; padding: 24px 20px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="margin: 0; font-size: 12px; color: #6b7280; line-height: 1.6;">
        <strong style="color: ${brandColor}; font-weight: 600;">Goodman Management Group</strong><br>
        Professional HOA Management & Resale Services
      </p>
    </div>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <!-- Dark Mode Support -->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-container {
        background-color: #1f2937 !important;
        color: #f9fafb !important;
      }
      .email-content {
        background-color: #111827 !important;
        color: #f9fafb !important;
      }
      .email-card {
        background-color: #1f2937 !important;
        border-color: #374151 !important;
      }
      .email-text {
        color: #d1d5db !important;
      }
      .email-text-muted {
        color: #9ca3af !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        padding: 0 !important;
      }
      .email-content {
        padding: 20px 16px !important;
      }
      .email-header {
        padding: 24px 16px !important;
      }
      .email-header h1 {
        font-size: 24px !important;
      }
      table[role="presentation"] {
        width: 100% !important;
      }
      td {
        display: block !important;
        width: 100% !important;
        text-align: left !important;
        padding: 8px 0 !important;
        border-bottom: none !important;
      }
      td[style*="text-align: right"] {
        text-align: left !important;
      }
    }
  </style>
</body>
</html>
      `;

    // Minify HTML to reduce email size and prevent Gmail clipping (102KB threshold)
    const minifiedHtml = minifyEmailHtml(html);
    const htmlSize = getEmailSize(minifiedHtml);
    
    if (htmlSize > 100) {
      console.warn(`[EmailService] Invoice receipt email size is ${htmlSize}KB, approaching Gmail's 102KB clipping threshold`);
    } else {
      console.log(`[EmailService] Invoice receipt email size: ${htmlSize}KB`);
    }

    return await sendEmail({
      to: normalizedTo,
      subject,
      html: minifiedHtml,
      context: 'InvoiceReceipt'
    });
  } catch (error) {
    console.error('Error sending invoice/receipt email:', error);
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
    
    // Get the base URL for confirmation link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
    const confirmationUrl = `${baseUrl}/auth/confirm-email?token=${confirmationToken}`;
    
    // Logo URL from Supabase storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';
    const brandColorLight = '#1a5f47';
    
    const subject = 'Verify Your Email Address - GMG ResaleFlow';
    
    const displayName = firstName ? escapeHtml(firstName) : 'there';
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Verify Your Email</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6; color: #333333;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td>
  <![endif]-->
  <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header with Logo -->
    <div class="email-header" style="background-color: ${brandColor}; padding: 30px 20px; position: relative;">
      <!-- Logo - Top Left -->
      <div style="margin-bottom: 16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height: 42px; width: auto; max-width: 140px; display: block; border: 0; outline: none; text-decoration: none;" />
      </div>
      <!-- Title - Centered -->
      <div style="text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Verify Your Email</h1>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="email-content" style="padding: 30px 20px; background-color: #ffffff;">
      <p class="email-text" style="margin: 0 0 16px 0; font-size: 16px; color: #333333;">Dear ${displayName},</p>
      <p class="email-text-muted" style="margin: 0 0 24px 0; font-size: 16px; color: #666666;">Thank you for registering with GMG ResaleFlow. To complete your account setup, please verify your email address by clicking the button below.</p>
      
      <!-- Verification Button Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb; text-align: center;">
        <a href="${confirmationUrl}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px; text-align: center; letter-spacing: 0.3px;">Verify Email Address</a>
      </div>
      
      <!-- Security Note -->
      <div style="margin: 0 0 24px 0; padding: 12px; background-color: #f0f9f4; border-radius: 6px; border-left: 4px solid ${brandColor};">
        <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
          <strong>Security Note:</strong> This verification link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="padding: 20px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
        &copy; ${new Date().getFullYear()} Goodman Management Group. All rights reserved.
      </p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: ${brandColor}; text-decoration: none;">resales@gmgva.com</a>
      </p>
    </div>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <!-- Dark Mode Support -->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-container {
        background-color: #1f2937 !important;
        color: #f9fafb !important;
      }
      .email-content {
        background-color: #111827 !important;
        color: #f9fafb !important;
      }
      .email-card {
        background-color: #1f2937 !important;
        border-color: #374151 !important;
      }
      .email-text {
        color: #d1d5db !important;
      }
      .email-text-muted {
        color: #9ca3af !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-header {
        padding: 20px 15px !important;
      }
      .email-content {
        padding: 20px 15px !important;
      }
      h1 {
        font-size: 24px !important;
      }
    }
  </style>
</body>
</html>
    `;

    const minifiedHtml = minifyEmailHtml(html);
    const htmlSize = getEmailSize(minifiedHtml);
    
    if (htmlSize > 100) {
      console.warn(`[EmailService] Email confirmation email size is ${htmlSize}KB, approaching Gmail's 102KB clipping threshold`);
    } else {
      console.log(`[EmailService] Email confirmation email size: ${htmlSize}KB`);
    }

    return await sendEmail({
      to: normalizedTo,
      subject,
      html: minifiedHtml,
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
    
    // Get the base URL for reset link
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app-url.com';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    // Logo URL from Supabase storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';
    const brandColorLight = '#1a5f47';
    
    const subject = 'Reset Your Password - GMG ResaleFlow';
    
    const displayName = firstName ? escapeHtml(firstName) : 'there';
    
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>Reset Your Password</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; line-height: 1.6; color: #333333;">
  <!--[if mso]>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td>
  <![endif]-->
  <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <!-- Header with Logo -->
    <div class="email-header" style="background-color: ${brandColor}; padding: 30px 20px; position: relative;">
      <!-- Logo - Top Left -->
      <div style="margin-bottom: 16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height: 42px; width: auto; max-width: 140px; display: block; border: 0; outline: none; text-decoration: none;" />
      </div>
      <!-- Title - Centered -->
      <div style="text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">Reset Your Password</h1>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="email-content" style="padding: 30px 20px; background-color: #ffffff;">
      <p class="email-text" style="margin: 0 0 16px 0; font-size: 16px; color: #333333;">Dear ${displayName},</p>
      <p class="email-text-muted" style="margin: 0 0 24px 0; font-size: 16px; color: #666666;">You're receiving this email because you requested a password reset for your GMG ResaleFlow account. Click the button below to create a new password.</p>
      
      <!-- Reset Button Card -->
      <div class="email-card" style="background-color: #f9fafb; padding: 24px; border-radius: 8px; margin: 0 0 24px 0; border: 1px solid #e5e7eb; text-align: center;">
        <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 6px; text-align: center; letter-spacing: 0.3px;">Reset Password</a>
      </div>
      
      <!-- Security Note -->
      <div style="margin: 0 0 24px 0; padding: 12px; background-color: #f0f9f4; border-radius: 6px; border-left: 4px solid ${brandColor};">
        <p style="margin: 0; font-size: 13px; color: #065f46; line-height: 1.5;">
          <strong>Security Note:</strong> This password reset link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="padding: 20px; text-align: center; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #6b7280;">
        &copy; ${new Date().getFullYear()} Goodman Management Group. All rights reserved.
      </p>
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: ${brandColor}; text-decoration: none;">resales@gmgva.com</a>
      </p>
    </div>
  </div>
  <!--[if mso]>
      </td>
    </tr>
  </table>
  <![endif]-->
  
  <!-- Dark Mode Support -->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-container {
        background-color: #1f2937 !important;
        color: #f9fafb !important;
      }
      .email-content {
        background-color: #111827 !important;
        color: #f9fafb !important;
      }
      .email-card {
        background-color: #1f2937 !important;
        border-color: #374151 !important;
      }
      .email-text {
        color: #d1d5db !important;
      }
      .email-text-muted {
        color: #9ca3af !important;
      }
    }
    @media only screen and (max-width: 600px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
      }
      .email-header {
        padding: 20px 15px !important;
      }
      .email-content {
        padding: 20px 15px !important;
      }
      h1 {
        font-size: 24px !important;
      }
    }
  </style>
</body>
</html>
    `;

    const minifiedHtml = minifyEmailHtml(html);
    const htmlSize = getEmailSize(minifiedHtml);
    
    if (htmlSize > 100) {
      console.warn(`[EmailService] Password reset email size is ${htmlSize}KB, approaching Gmail's 102KB clipping threshold`);
    } else {
      console.log(`[EmailService] Password reset email size: ${htmlSize}KB`);
    }

    return await sendEmail({
      to: normalizedTo,
      subject,
      html: minifiedHtml,
      context: 'PasswordReset'
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};
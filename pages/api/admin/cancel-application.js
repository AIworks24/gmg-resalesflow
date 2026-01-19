import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendEmail } from '../../../lib/emailService';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create server-side Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated and has admin role
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin role (only admins can reject applications)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin role required' });
    }

    const { applicationId, comments, action } = req.body; // action: 'cancel' or 'reject'

    if (!applicationId || !action) {
      return res.status(400).json({ error: 'Application ID and action are required' });
    }

    if (!['cancel', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be either "cancel" or "reject"' });
    }

    // Fetch the application with all necessary fields
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        property_address,
        submitter_name,
        submitter_email,
        total_amount,
        status,
        notes,
        stripe_payment_intent_id,
        payment_status,
        hoa_properties(name, property_owner_email, property_owner_name)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if already cancelled/rejected
    if (application.status === 'cancelled' || application.status === 'rejected') {
      return res.status(400).json({ error: `Application is already ${application.status}` });
    }

    // Update application status
    const newStatus = action === 'cancel' ? 'cancelled' : 'rejected';
    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    // Store cancellation/rejection comments in notes field
    // Append to existing notes if any
    const existingNotes = application.notes || '';
    const actionLabel = action === 'cancel' ? 'Cancelled' : 'Rejected';
    const timestamp = new Date().toLocaleString();
    const newNote = `\n\n--- ${actionLabel} on ${timestamp} ---\n${comments || 'No reason provided'}`;
    updateData.notes = existingNotes + newNote;

    // Add cancelled_at or rejected_at timestamp
    if (action === 'cancel') {
      updateData.cancelled_at = new Date().toISOString();
    } else {
      updateData.rejected_at = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('applications')
      .update(updateData)
      .eq('id', applicationId);

    if (updateError) {
      console.error('Error updating application:', updateError);
      throw updateError;
    }

    // Send email to requestor and resales@gmgva.com
    const submitterEmail = application.submitter_email;
    const resalesEmail = process.env.NODE_ENV === 'production' 
      ? 'resales@gmgva.com' 
      : 'ianrizhehehe@gmail.com'; // For testing

    // Prepare email content
    const actionTitle = action === 'cancel' ? 'Application Cancelled' : 'Application Rejected';
    const actionMessage = action === 'cancel' 
      ? 'Your application has been cancelled.'
      : 'Your application has been rejected.';

    // Logo URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
    const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
    const brandColor = '#0f4734';

    const emailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
        <style>
          @media screen and (max-width: 600px) {
            .content { padding: 20px !important; }
            .header { padding: 30px 20px !important; }
            .reason-box { padding: 20px !important; }
            .mobile-stack { display: block !important; width: 100% !important; text-align: left !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
          <tr>
            <td align="center">
              <!--[if mso]>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600">
              <tr>
              <td>
              <![endif]-->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background-color: #0f4734; background: linear-gradient(135deg, #0f4734 0%, #1a5f47 100%); padding: 40px 30px;" class="header">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="left" style="padding-bottom: 24px;">
                          <img src="${logoUrl}" alt="Goodman Management Group" width="140" style="height: auto; display: block; border: 0;" />
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.2;">${actionTitle}</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px; background-color: #ffffff;" class="content">
                    <p style="margin: 0 0 24px 0; color: #1e293b; font-size: 17px; line-height: 1.6; font-weight: 500;">Dear ${escapeHtml(application.submitter_name)},</p>
                    <p style="margin: 0 0 32px 0; color: #475569; font-size: 16px; line-height: 1.6;">
                      Thank you for your interest in our resale services. We have completed the review of your application for <strong>${escapeHtml(application.property_address)}</strong>. At this time, your application has been declined.
                    </p>
                    
                    ${comments ? `
                    <!-- Rejection Reason -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff1f2; border-radius: 12px; border: 1px solid #fecdd3; margin-bottom: 32px;">
                      <tr>
                        <td style="padding: 24px;" class="reason-box">
                          <div style="color: #e11d48; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Rejection Reason:</div>
                          <p style="margin: 0; color: #9f1239; font-size: 17px; line-height: 1.6; font-weight: 500; font-style: italic;">"${escapeHtml(comments)}"</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                    <!-- Application Details Summary -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top: 1px solid #f1f5f9; padding-top: 24px;">
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #94a3b8; text-align: left;">Application Reference</td>
                        <td style="padding: 10px 0; font-size: 15px; color: #1e293b; font-weight: 600; text-align: right;">#${application.id}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #94a3b8; text-align: left;">Property Address</td>
                        <td style="padding: 10px 0; font-size: 15px; color: #1e293b; font-weight: 600; text-align: right;">${escapeHtml(application.property_address)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; font-size: 14px; color: #94a3b8; text-align: left;">HOA Community</td>
                        <td style="padding: 10px 0; font-size: 15px; color: #1e293b; font-weight: 600; text-align: right;">${escapeHtml(application.hoa_properties?.name || 'N/A')}</td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 40px;">
                      <tr>
                        <td style="padding: 24px; background-color: #f8fafc; border-radius: 12px; text-align: center;">
                          <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px; font-weight: 500;">Need assistance or clarification?</p>
                          <p style="margin: 0; color: #64748b; font-size: 14px;">
                            Contact our support team at <a href="mailto:resales@gmgva.com" style="color: #0f4734; text-decoration: none; font-weight: 700;">resales@gmgva.com</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 32px; text-align: center; border-top: 1px solid #f1f5f9;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5; font-weight: 500;">
                      &copy; ${new Date().getFullYear()} <strong style="color: #64748b;">Goodman Management Group</strong><br>
                      Professional HOA Management & Resale Services
                    </p>
                  </td>
                </tr>
                
              </table>
              <!--[if mso]>
              </td>
              </tr>
              </table>
              <![endif]-->
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const subject = `${actionTitle} - Application #${application.id}`;

    // Admin version of the email HTML
    const adminEmailHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <!--[if mso]>
        <noscript>
          <xml>
            <o:OfficeDocumentSettings>
              <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
          </xml>
        </noscript>
        <![endif]-->
        <style>
          @media screen and (max-width: 600px) {
            .content { padding: 20px !important; }
            .header { padding: 30px 20px !important; }
            .reason-box { padding: 20px !important; }
            .mobile-stack { display: block !important; width: 100% !important; text-align: left !important; }
          }
        </style>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; padding: 40px 10px;">
          <tr>
            <td align="center">
              <!--[if mso]>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600">
              <tr>
              <td>
              <![endif]-->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                
                <!-- Header -->
                <tr>
                  <td style="background-color: #0f4734; background: linear-gradient(135deg, #0f4734 0%, #1a5f47 100%); padding: 40px 30px;" class="header">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td align="left" style="padding-bottom: 24px;">
                          <img src="${logoUrl}" alt="Goodman Management Group" width="140" style="height: auto; display: block; border: 0;" />
                        </td>
                      </tr>
                      <tr>
                        <td align="center">
                          <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px; line-height: 1.2;">[Admin] ${actionTitle}</h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px; background-color: #ffffff;" class="content">
                    <div style="background-color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 32px; border: 1px solid #e2e8f0;">
                      <h3 style="margin: 0 0 12px 0; color: #0f4734; font-size: 20px; font-weight: 600;">Internal Notification</h3>
                      <p style="margin: 0; color: #666666; font-size: 16px; line-height: 1.6;">
                        This is an administrative notification that application <strong>#${application.id}</strong> has been declined.
                      </p>
                    </div>

                    <!-- Application Details Summary -->
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 24px; margin-bottom: 24px; width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: left; width: 160px;"><strong style="color: #374151;">Property Address:</strong></td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(application.property_address)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: left;"><strong style="color: #374151;">HOA Community:</strong></td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(application.hoa_properties?.name || 'N/A')}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: left;"><strong style="color: #374151;">Requester:</strong></td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">${escapeHtml(application.submitter_name)} (${escapeHtml(application.submitter_email)})</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: left;"><strong style="color: #374151;">Application ID:</strong></td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #111827; text-align: right; font-weight: 500;">#${application.id}</td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px; color: #6b7280; text-align: left;"><strong style="color: #374151;">Application Amount:</strong></td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; font-size: 20px; color: #0f4734; text-align: right; font-weight: 700;">
                          ${application.total_amount > 0 ? `$${application.total_amount.toFixed(2)}` : 'Free (Standard Processing)'}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; font-size: 14px; color: #6b7280; text-align: left;"><strong style="color: #374151;">Payment Reference:</strong></td>
                        <td style="padding: 12px 0; font-size: 14px; color: #111827; text-align: right; font-weight: 500; font-family: monospace;">
                          ${application.stripe_payment_intent_id || (application.total_amount > 0 ? 'N/A' : 'None - Free Transaction')}
                        </td>
                      </tr>
                    </table>
                    
                    ${comments ? `
                    <!-- Rejection Reason -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff1f2; border-radius: 12px; border: 1px solid #fecdd3; margin-bottom: 32px;">
                      <tr>
                        <td style="padding: 24px;" class="reason-box">
                          <div style="color: #e11d48; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Admin Rejection Reason:</div>
                          <p style="margin: 0; color: #9f1239; font-size: 17px; line-height: 1.6; font-weight: 500; font-style: italic;">"${escapeHtml(comments)}"</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 40px;">
                      <tr>
                        <td style="padding: 24px; background-color: #f8fafc; border-radius: 12px; text-align: center;">
                          <p style="margin: 0; color: #64748b; font-size: 14px; font-weight: 500;">
                            This is an automated administrative notification.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background-color: #f8fafc; padding: 32px; text-align: center; border-top: 1px solid #f1f5f9;">
                    <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5; font-weight: 500;">
                      &copy; ${new Date().getFullYear()} <strong style="color: #64748b;">Goodman Management Group</strong><br>
                      Internal Admin Notification
                    </p>
                  </td>
                </tr>
                
              </table>
              <!--[if mso]>
              </td>
              </tr>
              </table>
              <![endif]-->
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    // Normalize emails to lowercase for comparison (to prevent duplicates)
    const normalizedSubmitterEmail = submitterEmail?.toLowerCase().trim();
    const normalizedResalesEmail = resalesEmail?.toLowerCase().trim();

    // Build list of unique email recipients
    const emailRecipients = [];
    
    // Add submitter email
    if (normalizedSubmitterEmail) {
      emailRecipients.push({
        email: normalizedSubmitterEmail,
        subject,
        html: emailHtml,
        context: `Application${action === 'cancel' ? 'Cancellation' : 'Rejection'}`,
      });
    }
    
    // Add resales email only if it's different from submitter email
    if (normalizedResalesEmail && normalizedResalesEmail !== normalizedSubmitterEmail) {
      emailRecipients.push({
        email: normalizedResalesEmail,
        subject: `[Admin] ${actionTitle} - Application #${application.id}`,
        html: adminEmailHtml,
        context: `Application${action === 'cancel' ? 'Cancellation' : 'Rejection'}Admin`,
      });
    }

    // Send emails to unique recipients only
    const emailPromises = emailRecipients.map(recipient =>
      sendEmail({
        to: recipient.email,
        subject: recipient.subject,
        html: recipient.html,
        context: recipient.context,
      })
    );

    await Promise.allSettled(emailPromises);

    return res.status(200).json({
      success: true,
      message: `Application ${action === 'cancel' ? 'cancelled' : 'rejected'} successfully`,
    });

  } catch (error) {
    console.error('Error cancelling/rejecting application:', error);
    return res.status(500).json({ 
      error: 'Failed to cancel/reject application',
      message: error.message 
    });
  }
}

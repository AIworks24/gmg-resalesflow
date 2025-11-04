import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application details
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (!application.lender_questionnaire_completed_file_path) {
      return res.status(400).json({ error: 'Completed lender questionnaire form must be uploaded first' });
    }

    // Get signed URL for the completed form
    const EXPIRY_30_DAYS = 30 * 24 * 60 * 60; // 30 days in seconds
    const { data: signedUrlData, error: urlError } = await supabase.storage
      .from('bucket0')
      .createSignedUrl(application.lender_questionnaire_completed_file_path, EXPIRY_30_DAYS); // 30 days expiry

    if (urlError || !signedUrlData?.signedUrl) {
      return res.status(500).json({ error: 'Failed to generate download link for completed form' });
    }

    // Use nodemailer directly for email sending
    const nodemailer = await import('nodemailer');
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

    const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0;">Lender Questionnaire Ready</h1>
          <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
        </div>
        
        <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <p>Dear ${application.submitter_name || 'Valued Customer'},</p>
          
          <p>Your lender questionnaire for <strong>${application.property_address}</strong> has been completed and is ready for download.</p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #10B981;">
            <h3 style="color: #10B981; margin-top: 0;">Download Your Completed Form</h3>
            <p style="margin-bottom: 15px;">Click the button below to download your completed lender questionnaire:</p>
            <div style="text-align: center;">
              <a href="${signedUrlData.signedUrl}" 
                 style="display: inline-block; padding: 12px 24px; background-color: #10B981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Download Completed Form
              </a>
            </div>
            <p style="margin-top: 15px; font-size: 12px; color: #6B7280;">
              This link will expire in 30 days. Please download and save the file.
            </p>
          </div>
          
          <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #D97706; margin-top: 0;">Important Information</h4>
            <ul style="margin: 0; padding-left: 20px; color: #92400E;">
              <li>Please review the completed form for accuracy</li>
              <li>Download and save the file for your records</li>
              <li>Contact us if you need any corrections</li>
            </ul>
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

    await transporter.sendMail({
      from: `"GMG ResaleFlow" <${emailFrom}>`,
      to: application.submitter_email,
      subject: `Lender Questionnaire Ready - ${application.property_address}`,
      html: emailHtml,
    });

    // Create notification record
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        application_id: applicationId,
        recipient_email: application.submitter_email,
        recipient_name: application.submitter_name,
        notification_type: 'application_approved',
        subject: `Lender Questionnaire Ready - ${application.property_address}`,
        message: `Your lender questionnaire for ${application.property_address} has been completed and is ready for download.`,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the request if notification creation fails
    }

    // Update application status
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        status: 'approved',
        email_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Failed to update application status:', updateError);
      // Don't fail the request if status update fails
    }

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Error in send-lender-questionnaire-email:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


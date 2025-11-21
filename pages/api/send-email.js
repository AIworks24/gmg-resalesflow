import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendApplicationSubmissionEmail, sendApprovalEmail, sendPaymentConfirmationEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { emailType, ...emailData } = req.body;

    if (!emailType) {
      return res.status(400).json({ error: 'Email type is required' });
    }

    let result;

    switch (emailType) {
      case 'application_submission':
        const {
          applicationId,
          customerName,
          customerEmail,
          propertyAddress,
          packageType,
          totalAmount,
          hoaName,
          submitterType,
          applicationType,
        } = emailData;

        // Validate required fields
        if (!applicationId || !customerName || !propertyAddress || !customerEmail) {
          return res.status(400).json({ 
            error: 'Missing required fields: applicationId, customerName, propertyAddress, customerEmail' 
          });
        }

        result = await sendApplicationSubmissionEmail({
          to: customerEmail, // Use the submitter email from application data
          applicationId,
          customerName,
          propertyAddress,
          packageType,
          totalAmount,
          hoaName,
          submitterType,
          applicationType,
        });
        break;

      case 'payment_confirmation':
        // For admin use or webhook calls - require authentication
        const supabase = createPagesServerClient({ req, res });
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          return res.status(401).json({ error: 'Unauthorized - Admin access required for payment confirmations' });
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (profile?.role !== 'admin' && profile?.role !== 'staff') {
          return res.status(403).json({ error: 'Forbidden - Admin access required for payment confirmations' });
        }

        result = await sendPaymentConfirmationEmail(emailData);
        break;

      case 'approval':
        // Redirect to existing approval email API
        return res.status(400).json({ 
          error: 'Use /api/send-approval-email for approval emails' 
        });

      default:
        return res.status(400).json({ error: 'Invalid email type' });
    }

    return res.status(200).json({ 
      success: true, 
      message: `${emailType} email sent successfully`,
      result 
    });

  } catch (error) {
    console.error(`Error sending ${req.body.emailType || 'unknown'} email:`, error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
} 
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { sendApprovalEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Supabase client
    const supabase = createPagesServerClient({ req, res });

    // Check if user is authenticated and is admin
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

    if (profile?.role !== 'admin' && profile?.role !== 'staff') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Get application data
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(
        `
        *,
        hoa_properties(name, property_owner_email, property_owner_name)
      `
      )
      .eq('id', applicationId)
      .single();

    if (appError) {
      throw appError;
    }

    // Use the existing PDF in storage
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'pdfs';
    const outputPdfPath = `resale-certificates/${applicationId}/resale-certificate-${applicationId}.pdf`;
    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
    if (!publicUrl) {
      return res.status(400).json({ error: 'PDF has not been generated yet' });
    }

    // Create notification record with public URL (for internal use)
    const { error: notifError } = await supabase.from('notifications').insert([
      {
        application_id: applicationId,
        recipient_email: application.submitter_email,
        recipient_name: application.submitter_name,
        notification_type: 'resale_certificate_request',
        subject: `Resale Certificate Ready - ${application.property_address}`,
        message: `Your Resale Certificate for ${application.property_address} in ${application.hoa_properties.name} is now ready. You can download it using the link provided in the email.`,
        status: 'sent',
        sent_at: new Date().toISOString(),
        metadata: {
          pdf_url: publicUrl, // Store the public URL in metadata
          property_address: application.property_address,
          hoa_name: application.hoa_properties.name,
        },
      },
    ]);

    if (notifError) {
      throw notifError;
    }

    // Update application status
    const { error: updateError } = await supabase
      .from('applications')
      .update({ status: 'approved' })
      .eq('id', applicationId);

    if (updateError) {
      throw updateError;
    }

    return res.status(200).json({ success: true, pdfUrl: publicUrl });
  } catch (error) {
    console.error('Failed to send approval email:', error);
    return res
      .status(500)
      .json({ error: error.message || 'Failed to send approval email' });
  }
}

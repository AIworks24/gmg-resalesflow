import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

// Disable body parsing, we'll handle it with formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse form data
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const applicationId = Array.isArray(fields.applicationId) ? fields.applicationId[0] : fields.applicationId;

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!applicationId) {
      return res.status(400).json({ error: 'No application ID provided' });
    }

    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = '.' + file.originalFilename.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.' });
    }

    // Validate file size (10MB max)
    const stats = fs.statSync(file.filepath);
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `lender_questionnaire_${timestamp}_${sanitizedName}`;
    const filePath = `lender_questionnaires/${applicationId}/${fileName}`;

    // Read file data
    const fileData = fs.readFileSync(file.filepath);

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, fileData, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file: ' + uploadError.message });
    }

    // Calculate deletion date (30 days from now)
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + 30);

    // Update application record with file path and deletion date
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        lender_questionnaire_file_path: filePath,
        lender_questionnaire_deletion_date: deletionDate.toISOString(),
        status: 'under_review',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    if (updateError) {
      console.error('Error updating application:', updateError);
      // Try to delete the uploaded file if database update fails
      await supabase.storage.from('bucket0').remove([filePath]);
      return res.status(500).json({ error: 'Failed to update application: ' + updateError.message });
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    // Send confirmation email
    try {
      // Get application details for email
      const { data: application, error: appError } = await supabase
        .from('applications')
        .select(`
          submitter_name, 
          submitter_email, 
          property_address, 
          id,
          package_type,
          total_amount,
          hoa_property_id,
          hoa_properties (
            name
          )
        `)
        .eq('id', applicationId)
        .single();

      if (!appError && application) {
        // Calculate expected completion date
        const processingDays = application.package_type === 'rush' ? 3 : 10;
        const expectedDate = new Date();
        expectedDate.setDate(expectedDate.getDate() + processingDays);

        // Use nodemailer directly for simple email
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

        const hoaName = application.hoa_properties?.name || 'Unknown HOA';
        const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
        
        await transporter.sendMail({
          from: `"GMG ResaleFlow" <${emailFrom}>`,
          to: application.submitter_email,
          subject: `Lender Questionnaire Received - #${applicationId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0;">Lender Questionnaire form was successfully received</h1>
                <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
              </div>
              
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                <p>Dear ${application.submitter_name || 'Valued Customer'},</p>
                
                <p>Thank you for uploading your lender's questionnaire form. We have received your request and will begin processing it immediately.</p>
                
                <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="color: #10B981; margin-top: 0;">Application Details</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${application.property_address || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>HOA Community:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${hoaName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${application.package_type === 'rush' ? 'Rush (3 business days)' : 'Standard (10 calendar days)'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Amount:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${application.total_amount || 'N/A'}</td>
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
                    <li>We'll begin processing your lender questionnaire request</li>
                    <li>Our staff will complete the form you uploaded</li>
                    <li>You'll receive email updates throughout the process</li>
                    <li>The completed form will be delivered electronically</li>
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
          `,
        });
      }
    } catch (emailError) {
      console.error('Error sending confirmation email:', emailError);
      // Don't fail the request if email fails
    }

    return res.status(200).json({
      success: true,
      message: 'Lender questionnaire uploaded successfully',
      filePath: filePath,
    });
  } catch (error) {
    console.error('Error in upload-lender-questionnaire:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


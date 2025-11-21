import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

// Disable body parsing, we'll handle it with formidable
export const config = {
  api: {
    bodyParser: false,
  },
};

// Service role client for admin operations (file storage)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create authenticated client to verify user session
    // IMPORTANT: Do this BEFORE parsing form data to ensure cookies are available
    const supabase = createPagesServerClient({ req, res });

    // Verify user is authenticated BEFORE parsing form data
    // This ensures session cookies are read before formidable consumes the request
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      return res.status(401).json({ error: 'Unauthorized - Please log in to upload files' });
    }

    const userId = session.user.id;

    // Parse form data AFTER auth check
    // Note: formidable may consume the request stream, but we've already read the session
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

    // Verify the user owns this application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, user_id, application_type')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Verify user owns the application
    if (application.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden - You do not have permission to upload to this application' });
    }

    // Verify it's a lender questionnaire application
    if (application.application_type !== 'lender_questionnaire') {
      return res.status(400).json({ error: 'Invalid application type for this upload endpoint' });
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

    // Generate unique filename (always use .pdf extension)
    const timestamp = Date.now();
    const sanitizedName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const baseFileName = sanitizedName.replace(/\.[^/.]+$/, ''); // Remove original extension
    const fileName = `lender_questionnaire_${timestamp}_${baseFileName}.pdf`;
    const filePath = `lender_questionnaires/${applicationId}/${fileName}`;

    // Convert non-PDF files to PDF
    let fileData;
    let wasConverted = false;
    
    if (fileExt === '.pdf') {
      // Read PDF file directly
      fileData = fs.readFileSync(file.filepath);
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      // Convert DOCX/DOC to PDF
      try {
        const { convertOfficeToPdf } = require('../../lib/docxToPdfConverter');
        console.log(`Converting ${fileExt} file to PDF: ${file.originalFilename}`);
        fileData = await convertOfficeToPdf(file.filepath, fileExt);
        wasConverted = true;
        console.log(`Successfully converted ${fileExt} to PDF`);
      } catch (conversionError) {
        console.error('Error converting file to PDF:', conversionError);
        // Clean up temporary file
        fs.unlinkSync(file.filepath);
        return res.status(500).json({ 
          error: `Failed to convert ${fileExt} to PDF: ${conversionError.message}. Please try converting the file to PDF first.` 
        });
      }
    } else {
      // This shouldn't happen due to validation above, but just in case
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Unsupported file type for conversion.' });
    }

    // Upload to Supabase storage (always as PDF after conversion)
    // Use admin client for storage operations
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('bucket0')
      .upload(filePath, fileData, {
        contentType: 'application/pdf', // Always PDF after conversion
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
    // Use authenticated client to update (ensures user owns the application)
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        lender_questionnaire_file_path: filePath,
        lender_questionnaire_deletion_date: deletionDate.toISOString(),
        status: 'under_review',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('user_id', userId); // Double-check ownership

    if (updateError) {
      console.error('Error updating application:', updateError);
      // Try to delete the uploaded file if database update fails
      await supabaseAdmin.storage.from('bucket0').remove([filePath]);
      return res.status(500).json({ error: 'Failed to update application: ' + updateError.message });
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    // Create notifications for property owner (in-app and email)
    try {
      const { createNotifications } = await import('./notifications/create');
      await createNotifications(applicationId, supabaseAdmin);
    } catch (notificationError) {
      console.error('[Lender Questionnaire] Error creating notifications:', notificationError);
      // Don't fail the request if notification creation fails
    }

    // Send confirmation email
    try {
      // Get application details for email (use authenticated client)
      const { data: applicationData, error: appError } = await supabase
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
        .eq('user_id', userId) // Ensure we only get user's own applications
        .single();

      if (!appError && applicationData) {
        // Calculate expected completion date
        const processingDays = applicationData.package_type === 'rush' ? 3 : 10;
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

        const hoaName = applicationData.hoa_properties?.name || 'Unknown HOA';
        const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USERNAME || process.env.GMAIL_USER;
        
        await transporter.sendMail({
          from: `"GMG ResaleFlow" <${emailFrom}>`,
          to: applicationData.submitter_email,
          subject: `Lender Questionnaire Received - #${applicationId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0;">Lender Questionnaire form was successfully received</h1>
                <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
              </div>
              
              <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                <p>Dear ${applicationData.submitter_name || 'Valued Customer'},</p>
                
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
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${applicationData.property_address || 'N/A'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>HOA Community:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${hoaName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${applicationData.package_type === 'rush' ? 'Rush (3 business days)' : 'Standard (10 calendar days)'}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Amount:</strong></td>
                      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${applicationData.total_amount || 'N/A'}</td>
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
      message: wasConverted 
        ? `Lender questionnaire uploaded and converted to PDF successfully` 
        : 'Lender questionnaire uploaded successfully',
      filePath: filePath,
      wasConverted: wasConverted,
    });
  } catch (error) {
    console.error('Error in upload-lender-questionnaire:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}


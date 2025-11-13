import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';

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
    const allowedTypes = ['.pdf'];
    const fileExt = '.' + file.originalFilename.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      return res.status(400).json({ error: 'Invalid file type. Only PDF files are allowed.' });
    }

    // Validate file size (10MB max)
    const stats = fs.statSync(file.filepath);
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `lender_questionnaire_edited_${timestamp}_${sanitizedName}`;
    const filePath = `lender_questionnaires/${applicationId}/${fileName}`;

    // Read file data
    const fileData = fs.readFileSync(file.filepath);

    // Upload to Supabase storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, fileData, {
        contentType: 'application/pdf',
        upsert: true, // Allow replacing existing edited files
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return res.status(500).json({ error: 'Failed to upload file: ' + uploadError.message });
    }

    // Update application record with edited file path
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        lender_questionnaire_edited_file_path: filePath,
        lender_questionnaire_edited_at: new Date().toISOString(),
        // Also update completed file path if no uploaded file exists
        // This allows the edited PDF to be used as the completed form
        ...(!fields.skipCompletedUpdate && {
          lender_questionnaire_completed_file_path: filePath,
          lender_questionnaire_completed_uploaded_at: new Date().toISOString(),
        }),
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

    return res.status(200).json({
      success: true,
      message: 'Edited lender questionnaire uploaded successfully',
      filePath: filePath,
    });
  } catch (error) {
    console.error('Error in upload-lender-questionnaire-edited:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}







import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import { isJsonRequest, readJsonBody } from '../../lib/readJsonBody';

// Disable body parsing, we'll handle it with formidable (multipart) or read the
// raw JSON body ourselves (direct-to-storage mode).
export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Records the completed file path on the application. Shared by both upload
// modes so the database side-effects stay identical.
async function finalize(res, applicationId, filePath, wasConverted) {
  const { error: updateError } = await supabase
    .from('applications')
    .update({
      lender_questionnaire_completed_file_path: filePath,
      lender_questionnaire_completed_uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  if (updateError) {
    console.error('Error updating application:', updateError);
    return res.status(500).json({ error: 'Failed to update application: ' + updateError.message });
  }

  return res.status(200).json({
    success: true,
    message: wasConverted
      ? 'Completed lender questionnaire uploaded and converted to PDF successfully'
      : 'Completed lender questionnaire uploaded successfully',
    filePath,
    wasConverted,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // JSON mode: the PDF was uploaded directly to storage by the browser and we
    // only need to record its path. The tiny JSON body never hits the ~4.5MB
    // serverless body limit that breaks large multipart uploads.
    if (isJsonRequest(req)) {
      const body = await readJsonBody(req);
      const applicationId = body.applicationId;
      const filePath = body.filePath;

      if (!applicationId) {
        return res.status(400).json({ error: 'No application ID provided' });
      }
      if (!filePath || !filePath.startsWith(`lender_questionnaires/${applicationId}/`)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      return await finalize(res, applicationId, filePath, false);
    }

    // Multipart mode: file streamed through the function (DOC/DOCX needing
    // server-side conversion to PDF).
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
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.' });
    }

    // Validate file size (10MB max)
    const stats = fs.statSync(file.filepath);
    if (stats.size > 10 * 1024 * 1024) {
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
    }

    // Generate unique filename (always use .pdf extension)
    const timestamp = Date.now();
    const sanitizedName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const baseFileName = sanitizedName.replace(/\.[^/.]+$/, ''); // Remove original extension
    const fileName = `lender_questionnaire_completed_${timestamp}_${baseFileName}.pdf`;
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
          error: `Failed to convert ${fileExt} to PDF: ${conversionError.message}. Please try converting the file to PDF first.`,
        });
      }
    } else {
      // This shouldn't happen due to validation above, but just in case
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Unsupported file type for conversion.' });
    }

    // Upload to Supabase storage (always as PDF after conversion)
    const { error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, fileData, {
        contentType: 'application/pdf', // Always PDF after conversion
        upsert: true, // Allow replacing existing completed files
      });

    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      fs.unlinkSync(file.filepath);
      return res.status(500).json({ error: 'Failed to upload file: ' + uploadError.message });
    }

    // Clean up temporary file
    fs.unlinkSync(file.filepath);

    return await finalize(res, applicationId, filePath, wasConverted);
  } catch (error) {
    console.error('Error in upload-lender-questionnaire-completed:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import { isJsonRequest, readJsonBody } from '../../../lib/readJsonBody';

export const config = {
  api: {
    bodyParser: false,
  },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Verifies the application and records the original file path. Shared by both
// upload modes so the database side-effects stay identical.
async function finalize(res, applicationId, filePath, wasConverted) {
  // Verify application exists and is a lender questionnaire
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, application_type, notes')
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    return res.status(404).json({ error: 'Application not found' });
  }

  if (application.application_type !== 'lender_questionnaire') {
    return res.status(400).json({ error: 'Application is not a lender questionnaire' });
  }

  const deletionDate = new Date();
  deletionDate.setDate(deletionDate.getDate() + 30);

  const auditNote = `[${new Date().toISOString()}] Original LQ file uploaded by admin on behalf of requester (emailed document).`;
  const updatedNotes = application.notes ? `${application.notes}\n\n${auditNote}` : auditNote;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('applications')
    .update({
      lender_questionnaire_file_path: filePath,
      lender_questionnaire_deletion_date: deletionDate.toISOString(),
      // Admin already has the file — mark as downloaded so Step 2 unlocks immediately
      lender_questionnaire_downloaded_at: now,
      notes: updatedNotes,
      updated_at: now,
    })
    .eq('id', applicationId);

  if (updateError) {
    return res.status(500).json({ error: 'Failed to update application: ' + updateError.message });
  }

  return res.status(200).json({
    success: true,
    message: wasConverted
      ? 'Original file uploaded and converted to PDF successfully'
      : 'Original file uploaded successfully',
    filePath,
    wasConverted,
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // JSON mode: the PDF was uploaded directly to storage by the browser; we
    // only record its path (no serverless body-size limit on this tiny body).
    if (isJsonRequest(req)) {
      const body = await readJsonBody(req);
      const applicationId = body.applicationId;
      const filePath = body.filePath;

      if (!applicationId) return res.status(400).json({ error: 'No application ID provided' });
      if (!filePath || !filePath.startsWith(`lender_questionnaires/${applicationId}/`)) {
        return res.status(400).json({ error: 'Invalid file path' });
      }

      return await finalize(res, applicationId, filePath, false);
    }

    // Multipart mode: file streamed through the function (DOC/DOCX needing conversion).
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const applicationId = Array.isArray(fields.applicationId) ? fields.applicationId[0] : fields.applicationId;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!applicationId) return res.status(400).json({ error: 'No application ID provided' });

    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const fileExt = '.' + file.originalFilename.split('.').pop().toLowerCase();
    if (!allowedTypes.includes(fileExt)) {
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'Invalid file type. Only PDF, DOC, and DOCX files are allowed.' });
    }

    const stats = fs.statSync(file.filepath);
    if (stats.size > 10 * 1024 * 1024) {
      fs.unlinkSync(file.filepath);
      return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
    }

    const timestamp = Date.now();
    const sanitizedName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const baseFileName = sanitizedName.replace(/\.[^/.]+$/, '');
    const fileName = `lender_questionnaire_original_admin_${timestamp}_${baseFileName}.pdf`;
    const filePath = `lender_questionnaires/${applicationId}/${fileName}`;

    let fileData;
    let wasConverted = false;

    if (fileExt === '.pdf') {
      fileData = fs.readFileSync(file.filepath);
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      try {
        const { convertOfficeToPdf } = require('../../../lib/docxToPdfConverter');
        fileData = await convertOfficeToPdf(file.filepath, fileExt);
        wasConverted = true;
      } catch (conversionError) {
        fs.unlinkSync(file.filepath);
        return res.status(500).json({
          error: `Failed to convert ${fileExt} to PDF: ${conversionError.message}. Please convert to PDF first.`,
        });
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('bucket0')
      .upload(filePath, fileData, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      fs.unlinkSync(file.filepath);
      return res.status(500).json({ error: 'Failed to upload file: ' + uploadError.message });
    }

    fs.unlinkSync(file.filepath);

    return await finalize(res, applicationId, filePath, wasConverted);
  } catch (error) {
    console.error('Error in admin upload-lender-questionnaire-original:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

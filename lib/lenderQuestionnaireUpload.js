// Client-side helpers for uploading lender questionnaire files.
//
// Why this exists: lender questionnaire upload API routes run as Vercel
// serverless functions, which reject any request body larger than ~4.5MB at the
// platform edge (returning a plain-text 413 "Request Entity Too Large" before
// the function code runs). PDFs can therefore be too large to stream through the
// function. To avoid the limit, PDFs are uploaded directly from the browser to
// Supabase Storage, and only the resulting storage path is POSTed (as a tiny
// JSON body) to the API route to be recorded. DOC/DOCX files still go through
// the function because they require server-side conversion to PDF.

export const LQ_BUCKET = 'bucket0';

// Keep DOC/DOCX (which must pass through the serverless function for conversion)
// comfortably under Vercel's ~4.5MB request-body limit.
export const LQ_SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

export function getFileExt(filename = '') {
  const parts = filename.split('.');
  return parts.length > 1 ? '.' + parts.pop().toLowerCase() : '';
}

export function isPdf(filename) {
  return getFileExt(filename) === '.pdf';
}

// Mirrors the server-side filename/path convention so recorded paths stay
// consistent regardless of which upload mode produced them.
//   kind: 'completed' | 'original_admin' | '' (requester's original upload)
export function buildLqPath(applicationId, kind, originalFilename) {
  const timestamp = Date.now();
  const sanitizedName = (originalFilename || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
  const baseFileName = sanitizedName.replace(/\.[^/.]+$/, '');
  const prefix = kind ? `lender_questionnaire_${kind}` : 'lender_questionnaire';
  const fileName = `${prefix}_${timestamp}_${baseFileName}.pdf`;
  return `lender_questionnaires/${applicationId}/${fileName}`;
}

// Uploads a PDF straight to Supabase Storage from the browser, bypassing the
// serverless function size limit. Returns the storage path on success.
export async function uploadLqPdfDirect(supabase, { applicationId, kind, file, upsert = true }) {
  const filePath = buildLqPath(applicationId, kind, file.name);
  const { error } = await supabase.storage
    .from(LQ_BUCKET)
    .upload(filePath, file, { contentType: 'application/pdf', upsert });
  if (error) {
    throw new Error(error.message || 'Failed to upload file to storage');
  }
  return filePath;
}

const TOO_LARGE_MESSAGE =
  'File is too large to upload (Word documents must be under ~4MB). Please upload a PDF instead — PDFs of any size are supported.';

// Safely extracts an error message from a fetch Response that may NOT be JSON
// (e.g. a plain-text 413 from the Vercel edge). This prevents the
// "Unexpected token 'R', "Request En"... is not valid JSON" crash that occurs
// when calling response.json() on a non-JSON error body.
export async function parseUploadError(response) {
  if (response.status === 413) {
    return TOO_LARGE_MESSAGE;
  }
  let text = '';
  try {
    text = await response.text();
  } catch {
    return `Upload failed (status ${response.status})`;
  }
  try {
    const data = JSON.parse(text);
    return data.error || data.message || `Upload failed (status ${response.status})`;
  } catch {
    if (/request entity too large/i.test(text)) {
      return TOO_LARGE_MESSAGE;
    }
    return `Upload failed (status ${response.status})`;
  }
}

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { mapFormDataToPDFFields, generateAndUploadPDF } from '../../lib/pdfService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { formData, applicationId } = req.body;
    const fields = mapFormDataToPDFFields(formData);
    const apiKey = process.env.PDFCO_API_KEY;
    const outputPdfPath = `resale-certificates/${applicationId}/resale-certificate-${applicationId}.pdf`;
    const supabase = createPagesServerClient({ req, res });
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'pdfs';

    const { publicURL } = await generateAndUploadPDF(fields, outputPdfPath, apiKey, supabase, bucketName);

    // Restore: Update the applications table with the new PDF URL
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        pdf_url: publicURL,
        pdf_generated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);
    if (updateError) {
      console.error('Failed to update pdf_url:', updateError);
    }

    return res.status(200).json({ success: true, pdfUrl: publicURL });
  } catch (error) {
    console.error('Failed to regenerate PDF:', error);
    return res.status(500).json({ error: error.message });
  }
} 
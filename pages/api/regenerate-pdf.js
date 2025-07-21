import { createClient } from '@supabase/supabase-js';
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
    
    // Use service role key for server-side operations (no auth required)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const bucketName = 'bucket0';

    const { publicURL } = await generateAndUploadPDF(fields, outputPdfPath, apiKey, supabase, bucketName);

    // Update the applications table with the new PDF URL
    const generatedAt = new Date();
    
    const { error: updateError } = await supabase
      .from('applications')
      .update({
        pdf_url: publicURL,
        pdf_generated_at: generatedAt.toISOString(),
        pdf_completed_at: generatedAt.toISOString(),
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
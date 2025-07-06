import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { applicationId } = req.query;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const supabase = createPagesServerClient({ req, res });
    const bucketName = process.env.SUPABASE_BUCKET_NAME || 'pdfs';
    const outputPdfPath = `resale-certificates/${applicationId}/resale-certificate-${applicationId}.pdf`;

    // Get the public URL for the existing PDF
    const { data: { publicUrl } } = supabase.storage.from(bucketName).getPublicUrl(outputPdfPath);
    if (!publicUrl) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Download the PDF from Supabase and send as response
    const pdfRes = await fetch(publicUrl);
    if (!pdfRes.ok) {
      return res.status(404).json({ error: 'PDF not found in storage' });
    }
    const pdfBuffer = await pdfRes.arrayBuffer();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="resale-certificate-${applicationId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Failed to download PDF:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * API route to generate PDF from form structure
 * This runs server-side where @react-pdf/renderer works properly
 */

import { generateFormPDF } from '../../../lib/formBuilder/formPdfGenerator';
import { loadGMGLogo } from '../../../lib/formBuilder/loadLogo';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { formStructure, previewData, formTitle } = req.body;

    if (!formStructure || !formStructure.sections || formStructure.sections.length === 0) {
      return res.status(400).json({ error: 'Form structure is required' });
    }

    // Load logo (server-side)
    const logoBase64 = await loadGMGLogo();

    // Generate PDF (server-side)
    const pdfBytes = await generateFormPDF(
      formStructure,
      previewData || {},
      formTitle || 'Form Preview',
      logoBase64
    );

    // Return PDF as binary
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="form-preview.pdf"');
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('PDF generation API error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate PDF',
      message: error.message 
    });
  }
}


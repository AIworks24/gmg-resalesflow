/**
 * Debug endpoint to inspect PDF template fields
 * Helps identify field names and types in the actual PDF
 */

import { PDFDocument } from 'pdf-lib';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });
    const bucketName = 'bucket0';
    const templatePath = 'templates/ResaleCertificate_Template.pdf';
    
    // Download template from Supabase storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .download(templatePath);
    
    if (error) {
      throw new Error(`Failed to download PDF template from Supabase: ${error.message}`);
    }
    
    // Convert blob to array buffer
    const arrayBuffer = await data.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    // Organize fields by type
    const fieldsByType = {
      text: [],
      checkbox: [],
      radio: [],
      dropdown: [],
      other: []
    };
    
    fields.forEach(field => {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;
      
      const fieldInfo = {
        name: fieldName,
        type: fieldType
      };
      
      // Add additional info based on type
      if (fieldType === 'PDFCheckBox') {
        fieldInfo.isChecked = field.isChecked();
        fieldsByType.checkbox.push(fieldInfo);
      } else if (fieldType === 'PDFRadioGroup') {
        try {
          fieldInfo.options = field.getOptions();
          fieldInfo.selected = field.getSelected();
        } catch (e) {
          fieldInfo.options = [];
        }
        fieldsByType.radio.push(fieldInfo);
      } else if (fieldType === 'PDFTextField') {
        try {
          fieldInfo.text = field.getText();
        } catch (e) {}
        fieldsByType.text.push(fieldInfo);
      } else if (fieldType === 'PDFDropdown') {
        try {
          fieldInfo.options = field.getOptions();
          fieldInfo.selected = field.getSelected();
        } catch (e) {}
        fieldsByType.dropdown.push(fieldInfo);
      } else {
        fieldsByType.other.push(fieldInfo);
      }
    });
    
    return res.status(200).json({
      totalFields: fields.length,
      fieldsByType,
      allFields: fields.map(f => ({
        name: f.getName(),
        type: f.constructor.name
      }))
    });
  } catch (error) {
    console.error('Error inspecting PDF fields:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
}








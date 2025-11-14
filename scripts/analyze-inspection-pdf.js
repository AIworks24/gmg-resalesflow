/**
 * Analyze the property inspection form sample PDF
 */

const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function analyzePDF() {
  try {
    const pdfPath = path.join(__dirname, '../assets/property_inspection_form_sample.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('PDF file not found:', pdfPath);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    console.log('\n=== PDF Analysis ===');
    console.log('Total pages:', data.numpages);
    console.log('Info:', JSON.stringify(data.info, null, 2));
    
    const pages = data.text.split('\f');
    console.log('\n=== First Page Content (First 4000 chars) ===');
    console.log(pages[0].substring(0, 4000));
    
    if (pages.length > 1) {
      console.log('\n=== Second Page Content (First 2000 chars) ===');
      console.log(pages[1].substring(0, 2000));
    }
    
  } catch (error) {
    console.error('Error analyzing PDF:', error);
  }
}

analyzePDF();


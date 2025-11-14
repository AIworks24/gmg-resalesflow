/**
 * Extract layout information from the example PDF
 */

const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

async function extractLayout() {
  try {
    const pdfPath = path.join(__dirname, '../assets/take a look at this.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('PDF file not found:', pdfPath);
      return;
    }
    
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdf(dataBuffer);
    
    console.log('\n=== PDF Text Content (First Page) ===');
    const pages = data.text.split('\f');
    console.log(pages[0].substring(0, 2000)); // First 2000 chars of first page
    
    console.log('\n=== PDF Metadata ===');
    console.log('Pages:', data.numpages);
    console.log('Info:', data.info);
    
  } catch (error) {
    console.error('Error extracting PDF:', error);
  }
}

extractLayout();


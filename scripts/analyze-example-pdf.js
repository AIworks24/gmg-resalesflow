/**
 * Analyze the example PDF to understand its layout and spacing
 */

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function analyzePDF() {
  try {
    const pdfPath = path.join(__dirname, '../assets/take a look at this.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('PDF file not found:', pdfPath);
      return;
    }
    
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const pages = pdfDoc.getPages();
    console.log(`\n=== PDF Analysis ===`);
    console.log(`Total pages: ${pages.length}\n`);
    
    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      console.log(`Page ${index + 1}:`);
      console.log(`  Size: ${width} x ${height} (${width === 612 && height === 792 ? 'Letter' : 'Custom'})`);
      
      // Try to get content stream (this is limited with pdf-lib)
      console.log(`  Content: [PDF content streams - layout analysis would require different tools]`);
    });
    
    console.log('\n=== Recommendations ===');
    console.log('To match this PDF layout exactly, we should:');
    console.log('1. Use the same page size (likely Letter: 612x792 points)');
    console.log('2. Match the exact margins and padding');
    console.log('3. Match the spacing between sections');
    console.log('4. Match font sizes and line heights');
    
  } catch (error) {
    console.error('Error analyzing PDF:', error);
  }
}

analyzePDF();


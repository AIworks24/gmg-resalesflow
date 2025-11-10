const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function inspectPDF() {
  try {
    const templatePath = path.join(__dirname, '../assets/ResaleCertificate_Template.pdf');
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`\n=== PDF Field Inspection ===`);
    console.log(`Total fields: ${fields.length}\n`);
    
    // Group fields by type
    const fieldsByType = {
      PDFTextField: [],
      PDFCheckBox: [],
      PDFRadioGroup: [],
      PDFDropdown: [],
      other: []
    };
    
    fields.forEach(field => {
      const type = field.constructor.name;
      if (fieldsByType[type]) {
        fieldsByType[type].push(field.getName());
      } else {
        fieldsByType.other.push({ name: field.getName(), type });
      }
    });
    
    console.log(`Field counts:`);
    Object.keys(fieldsByType).forEach(type => {
      if (fieldsByType[type].length > 0) {
        console.log(`  ${type}: ${fieldsByType[type].length}`);
      }
    });
    
    // Show all radio groups with their options
    console.log(`\n=== Radio Groups ===`);
    const radioGroups = fields.filter(f => f.constructor.name === 'PDFRadioGroup');
    radioGroups.forEach(field => {
      try {
        const rg = form.getRadioGroup(field.getName());
        const options = rg.getOptions();
        console.log(`\nGroup: "${field.getName()}"`);
        console.log(`  Options: [${options.map(o => `"${o}"`).join(', ')}]`);
      } catch (e) {
        console.log(`\nGroup: "${field.getName()}" - Error: ${e.message}`);
      }
    });
    
    // Show all checkboxes
    console.log(`\n=== Checkboxes ===`);
    fieldsByType.PDFCheckBox.forEach(name => {
      console.log(`  "${name}"`);
    });
    
    // Show fields that match our expected patterns
    console.log(`\n=== Fields matching "Group" pattern ===`);
    fields.forEach(field => {
      const name = field.getName();
      if (name.includes('Group') || name.includes('Choice')) {
        console.log(`  "${name}" (${field.constructor.name})`);
      }
    });
    
    // Show fields that match "Check Box" pattern
    console.log(`\n=== Fields matching "Check Box" pattern ===`);
    fields.forEach(field => {
      const name = field.getName();
      if (name.includes('Check') || name.includes('Box')) {
        console.log(`  "${name}" (${field.constructor.name})`);
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

inspectPDF();








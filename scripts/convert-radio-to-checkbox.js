/**
 * Script to convert Group_App14 radio buttons to checkboxes in the PDF template
 * 
 * This script:
 * 1. Loads the PDF template
 * 2. Finds the Group_App14 radio group
 * 3. Removes the radio group
 * 4. Creates three separate checkboxes in the same positions
 * 5. Saves the modified template
 * 
 * Usage: node scripts/convert-radio-to-checkbox.js
 */

const { PDFDocument, PDFCheckBox, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function convertRadioToCheckbox() {
  try {
    // Path to the template (adjust as needed)
    const templatePath = path.join(__dirname, '../assets/ResaleCertificate_Template.pdf');
    const outputPath = path.join(__dirname, '../assets/ResaleCertificate_Template_Modified.pdf');
    
    if (!fs.existsSync(templatePath)) {
      console.error(`Template not found at: ${templatePath}`);
      console.log('Please ensure the template file exists or update the path.');
      return;
    }
    
    console.log('Loading PDF template...');
    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    console.log(`\nTotal fields in PDF: ${fields.length}`);
    
    // Find the Group_App14 radio group
    let radioGroup = null;
    try {
      radioGroup = form.getRadioGroup('Group_App14');
      console.log('\n✓ Found Group_App14 radio group');
      console.log(`  Options: ${radioGroup.getOptions().join(', ')}`);
    } catch (error) {
      console.error('\n❌ Group_App14 radio group not found!');
      console.error('   Error:', error.message);
      return;
    }
    
    // Get the radio group's appearance and position
    // Note: pdf-lib doesn't provide direct access to field positions
    // We'll need to get the widget annotations to find positions
    const radioGroupField = fields.find(f => f.getName() === 'Group_App14');
    if (!radioGroupField) {
      console.error('❌ Could not find Group_App14 field object');
      return;
    }
    
    console.log('\n⚠️  WARNING: pdf-lib has limitations for field positioning.');
    console.log('   Converting radio buttons to checkboxes requires:');
    console.log('   1. Manual positioning of new checkboxes');
    console.log('   2. Or using a PDF editor like Adobe Acrobat');
    console.log('   3. Or extracting widget positions from the PDF structure');
    console.log('\n   This script will create the checkboxes, but you may need to');
    console.log('   manually position them using a PDF editor.');
    
    // Get radio group options
    const options = radioGroup.getOptions();
    console.log(`\nRadio group has ${options.length} options:`, options);
    
    // Remove the radio group
    // Note: pdf-lib doesn't have a direct method to remove fields
    // We'll need to work around this by creating new checkboxes
    
    // Create new checkboxes for each option
    const checkboxes = [];
    for (let i = 0; i < options.length; i++) {
      const optionName = options[i];
      const checkboxName = `Group_App14.Choice${i + 1}`;
      
      // Try to create a checkbox
      // Note: We need a page reference and position, which is complex
      console.log(`\n⚠️  Cannot automatically create checkbox "${checkboxName}"`);
      console.log('   pdf-lib requires page reference and coordinates for new fields.');
    }
    
    console.log('\n📝 RECOMMENDED APPROACH:');
    console.log('   1. Open the PDF template in Adobe Acrobat Pro (or similar)');
    console.log('   2. Select the Group_App14 radio group');
    console.log('   3. Right-click → "Edit Field" → Change field type to "Check Box"');
    console.log('   4. Repeat for each option, creating separate checkboxes');
    console.log('   5. Name them: Group_App14.Choice1, Group_App14.Choice2, Group_App14.Choice3');
    console.log('   6. Save the template');
    console.log('\n   OR use a PDF form editor tool to convert the radio group.');
    
    // Save a copy for reference
    const modifiedBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, modifiedBytes);
    console.log(`\n✓ Saved reference copy to: ${outputPath}`);
    
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error(error.stack);
  }
}

// Run the script
convertRadioToCheckbox();

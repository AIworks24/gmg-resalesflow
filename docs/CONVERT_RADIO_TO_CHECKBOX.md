# Converting Radio Buttons to Checkboxes in PDF Template

## Problem
The `Group_App14` radio group in the PDF template only allows one selection at a time, but we need to be able to select multiple options (e.g., both "Provides insurance" and "Recommends owner coverage" can be true simultaneously).

## Solution Options

### Option 1: Manual Conversion (Recommended)
**Using Adobe Acrobat Pro or similar PDF editor:**

#### Step 0: Remove PDF Security Restrictions (If you see "security settings" error)

If you get an error like "You cannot edit this file as a form due to its security settings", follow these steps:

**Method 1: Remove Password Protection**
1. Open the PDF in Adobe Acrobat Pro
2. Go to **File** → **Properties** (or press `Cmd+Option+D` on Mac / `Ctrl+D` on Windows)
3. Click the **Security** tab
4. If there's a "Security Method" set to "Password Security", click **Change Settings**
5. Enter the password if prompted
6. Change "Security Method" to **"No Security"**
7. Click **OK** and save the document

**Method 2: Remove Document Restrictions**
1. Open the PDF in Adobe Acrobat Pro
2. Go to **File** → **Properties** → **Security** tab
3. Look for restrictions like:
   - "Changes Allowed: None" → Change to "Any Except Extracting Pages"
   - "Content Copying: Not Allowed" → Change to "Allowed"
   - "Commenting: Not Allowed" → Change to "Allowed"
4. Click **OK** and save

**Method 3: Print to PDF (Workaround)**
If you can't remove restrictions:
1. Open the PDF in Adobe Acrobat Pro
2. Go to **File** → **Print**
3. Choose **"Adobe PDF"** as the printer
4. Click **Print**
5. Save with a new name (e.g., `ResaleCertificate_Template_Unlocked.pdf`)
6. This creates a new PDF without restrictions

#### Step 1: Open and Prepare Form
1. Open `ResaleCertificate_Template.pdf` in Adobe Acrobat Pro (after removing restrictions)
2. Go to **Tools** → **Prepare Form**
3. If prompted, select **"Use the current document"**

#### Step 2: Find and Convert Radio Group
1. Find the `Group_App14` radio group (should have 3 options)
2. For each radio button option:
   - Right-click the radio button
   - Select **"Edit Field"** or **"Properties"**
   - Change the field type from **"Radio Button"** to **"Check Box"**
   - Set the field name to:
     - `Group_App14.Choice1` (for "Insurance coverage provided by the association...")
     - `Group_App14.Choice2` (for "Any other insurance coverage recommended...")
     - `Group_App14.Choice3` (for "Not applicable")
3. Position each checkbox in the same location as the original radio button
4. Save the template

### Option 2: Programmatic Conversion (Complex)
**Using pdf-lib with widget position extraction:**

This requires:
- Extracting widget annotations from the PDF
- Getting the exact coordinates of each radio button
- Creating new checkbox fields at those positions
- Removing the old radio group

This is complex because pdf-lib doesn't provide easy access to field positions.

### Option 3: Create New Template
**Start fresh with checkboxes:**

1. Create a new PDF form with checkboxes instead of radio buttons
2. Name the fields: `Group_App14.Choice1`, `Group_App14.Choice2`, `Group_App14.Choice3`
3. Replace the old template with the new one

## After Conversion

Once converted, the code will automatically detect them as checkboxes and allow multiple selections:

- **Case 1: Both TRUE** → Both Choice1 and Choice2 will be checked ✅
- **Case 2: Provide=NO, Recommend=YES** → Only Choice2 checked ✅
- **Case 3: Provide=YES, Recommend=NO** → Only Choice1 checked ✅
- **Case 4: Both NO** → Only Choice3 checked ✅

## Verification

After converting, run the inspection script to verify:

```bash
node scripts/inspect-pdf-fields.js
```

Look for:
- `Group_App14.Choice1` as `PDFCheckBox`
- `Group_App14.Choice2` as `PDFCheckBox`
- `Group_App14.Choice3` as `PDFCheckBox`

If you see them as checkboxes, the conversion was successful!

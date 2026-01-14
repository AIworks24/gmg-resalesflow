# PDF Field Debugging Guide

## Quick Fix Checklist for PDF Fields Not Updating

When a form field (especially checkboxes) isn't updating in the PDF, follow this systematic approach:

### Step 1: Verify Form Data is Being Saved ✅
**Check:** `components/admin/AdminResaleCertificateForm.js` or relevant form component
- [ ] Form data is saved to database with correct structure
- [ ] Checkbox value is boolean `true`/`false`, not string `"true"`/`"false"`
- [ ] Nested objects (like `disclosures.operatingBudget.budgetAttached`) are preserved

**Quick Fix:**
```javascript
// Ensure deep merge when loading form data
const deepMerge = (target, source) => {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};
```

### Step 2: Verify Form Data is Passed to Regenerate ✅
**Check:** `components/admin/AdminApplications.js` - `handleGeneratePDF`
- [ ] Current `formData` is passed, not `originalSupabaseData`
- [ ] Form data structure matches what the API expects

**Quick Fix:**
```javascript
// Use current formData, not old data
handleGeneratePDF({ 
  resaleCertificate: resaleForm?.form_data  // Current data, not originalSupabaseData
}, applicationId);
```

### Step 3: Verify Field Mapping Exists ✅
**Check:** `lib/pdfFieldMapper.js` - `FIELD_TO_FORMDATA`
- [ ] Field name in mapping matches exactly (case-sensitive, including periods/spaces)
- [ ] Mapping function uses `isTruthy()` for robust value checking
- [ ] Both variations are mapped if field name might differ (e.g., "Check Box11" and "Check Box11.")

**Quick Fix:**
```javascript
// Add mapping for both variations
"Check Box11": (formData) => {
  const value = formData.disclosures?.operatingBudget?.budgetAttached;
  return isTruthy(value) ? "True" : "False";
},
"Check Box11.": (formData) => {
  const value = formData.disclosures?.operatingBudget?.budgetAttached;
  return isTruthy(value) ? "True" : "False";
},
```

### Step 4: Verify Field Name Matches PDF Template ✅
**Check:** `lib/pdfService.js` - Field lookup
- [ ] Field name in code matches PDF template exactly
- [ ] Check for variations: with/without periods, different spacing, case differences

**Quick Fix:**
```javascript
// Add fallback for field name variations
if (!pdfField && fieldName === 'Check Box11.') {
  pdfField = fieldMap.get('Check Box11'); // Try without period
}
if (!pdfField && fieldName === 'Check Box11') {
  pdfField = fieldMap.get('Check Box11.'); // Try with period
}
```

### Step 5: Verify Cache is Bypassed ✅
**Check:** `lib/pdfService.js` - `generateAndUploadPDF`
- [ ] Cache is bypassed when regenerating (`bypassCache: true`)
- [ ] Check logs for: `[PDF Service] ⚠️ PDF served from cache`

**Quick Fix:**
```javascript
// In regenerate-pdf.js
const result = await generateAndUploadPDF(
  fields, 
  outputPdfPath, 
  supabase, 
  bucketName, 
  null, 
  true  // ← bypassCache = true for regeneration
);
```

### Step 6: Add Debugging Logs ✅
**Add logs at each step to trace the data flow:**

```javascript
// 1. In regenerate-pdf.js - Check incoming data
console.log('[regenerate-pdf] Form data received:', {
  budgetAttached: actualFormData?.disclosures?.operatingBudget?.budgetAttached
});

// 2. In pdfFieldMapper.js - Check mapping
console.log('[PDF Field Mapper] Field mapped:', {
  fieldName: 'Check Box11',
  value: mappedValue,
  boolValue: boolValue
});

// 3. In pdfService.js - Check field lookup
console.log('[PDF Service] Field found:', {
  requested: fieldName,
  found: pdfField?.getName(),
  type: fieldType
});

// 4. In pdfService.js - Check checkbox setting
console.log('[PDF Service] Checkbox set:', {
  fieldName: checkBox.getName(),
  isChecked: isChecked,
  success: true
});
```

## Common Issues & Quick Fixes

### Issue: Checkbox always unchecked
**Causes:**
1. Field name mismatch (most common)
2. Cache serving old PDF
3. Form data not being passed correctly

**Fix:**
1. Check field name in PDF template vs code
2. Bypass cache when regenerating
3. Verify form data structure

### Issue: Field not found in PDF
**Causes:**
1. Field name typo or variation
2. Field doesn't exist in PDF template

**Fix:**
```javascript
// Log all fields in PDF to find the correct name
const allFields = Array.from(fieldMap.keys());
console.log('All PDF fields:', allFields.filter(f => f.includes('Box11')));
```

### Issue: Value is correct but checkbox not checked
**Causes:**
1. Using wrong field object (calling `getCheckBox()` instead of using found `pdfField`)
2. Checkbox operation failing silently

**Fix:**
```javascript
// Use the already-found pdfField
const checkBox = pdfField; // Don't call getCheckBox() again

// Add error handling
try {
  if (isChecked) {
    checkBox.check();
  } else {
    checkBox.uncheck();
  }
} catch (error) {
  console.error('Error setting checkbox:', error);
}
```

## Debugging Command Sequence

When debugging, check logs in this order:

1. **Form Data:** `[regenerate-pdf] Form data received`
2. **Mapping:** `[PDF Field Mapper] Field mapped`
3. **Cache:** `[PDF Service] Cache bypassed` or `PDF served from cache`
4. **Field Lookup:** `[PDF Service] Field found` or `Field NOT FOUND`
5. **Checkbox Setting:** `[PDF Service] Checkbox set` or `Error setting checkbox`

## Quick Reference: Files to Check

- **Form Component:** `components/admin/AdminResaleCertificateForm.js`
- **Form Data Loading:** `components/admin/AdminResaleCertificateForm.js` - `useEffect`
- **PDF Generation Trigger:** `components/admin/AdminApplications.js` - `handleGeneratePDF`
- **API Endpoint:** `pages/api/regenerate-pdf.js`
- **Field Mapping:** `lib/pdfFieldMapper.js` - `FIELD_TO_FORMDATA`
- **PDF Field Setting:** `lib/pdfService.js` - `fillPDFFields()`
- **Field Definitions:** `lib/fields.js`

## Testing Checklist

After making fixes:
- [ ] Check checkbox in form
- [ ] Save form
- [ ] Regenerate PDF
- [ ] Check console logs for each step
- [ ] Verify checkbox is checked in PDF
- [ ] Test with checkbox unchecked to ensure it unchecks too

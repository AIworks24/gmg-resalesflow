# Testing Document Expiration Email Alerts

This guide explains how to test the document expiration email notification system.

## Quick Test Methods

### Method 1: Using the Test API Endpoint (Recommended)

The easiest way to test is using the test endpoint:

```bash
# Test with default settings (30 days)
curl -X POST "http://localhost:3000/api/test-expiring-documents?test=true"

# Test with custom days (e.g., 60 days)
curl -X POST "http://localhost:3000/api/test-expiring-documents?test=true&days=60"

# Test with custom email recipient
curl -X POST "http://localhost:3000/api/test-expiring-documents?test=true&testEmail=your-email@example.com"
```

Or using Postman/Thunder Client:
- **Method**: POST
- **URL**: `http://localhost:3000/api/test-expiring-documents?test=true`
- **Optional Query Params**:
  - `days=30` - Number of days to check ahead (default: 30)
  - `testEmail=your-email@example.com` - Override recipient email

### Method 2: Using the Production Endpoint

The production endpoint requires authentication:

```bash
curl -X POST "http://localhost:3000/api/check-expiring-documents" \
  -H "x-cron-auth: YOUR_CRON_SECRET"
```

## Setting Up Test Data

### Option 1: Create Test Documents via Admin UI

1. Go to **Properties** → **Manage Documents** for a property
2. Upload a document and set an expiration date within the next 30 days
3. Upload multiple documents with different expiration dates to test multiple documents

### Option 2: Create Test Documents via SQL

Run this SQL in your Supabase SQL editor:

```sql
-- First, find a property ID
SELECT id, name, property_owner_email FROM hoa_properties LIMIT 1;

-- Then create test documents with expiration dates
-- Replace {property_id} with an actual property ID

-- Document expiring in 5 days (urgent)
INSERT INTO property_documents (
  property_id,
  document_key,
  document_name,
  file_path,
  file_name,
  display_name,
  expiration_date,
  is_not_applicable
) VALUES (
  {property_id},
  'architectural_guidelines',
  'VA Appendix 02/Architectural Guidelines',
  'property_files/{property_id}/test_file_1.pdf',
  'Test_Contract_2024.pdf',
  'Test Contract 2024',
  CURRENT_DATE + INTERVAL '5 days',
  false
);

-- Document expiring in 15 days (warning)
INSERT INTO property_documents (
  property_id,
  document_key,
  document_name,
  file_path,
  file_name,
  display_name,
  expiration_date,
  is_not_applicable
) VALUES (
  {property_id},
  'budget',
  'VA Appendix 11/Budget',
  'property_files/{property_id}/test_file_2.pdf',
  'Budget_2024.pdf',
  'Budget 2024',
  CURRENT_DATE + INTERVAL '15 days',
  false
);

-- Document expiring in 25 days (normal)
INSERT INTO property_documents (
  property_id,
  document_key,
  document_name,
  file_path,
  file_name,
  display_name,
  expiration_date,
  is_not_applicable
) VALUES (
  {property_id},
  'balance_sheet',
  'VA Appendix 10/Balance Sheet & Income/Expense Statement-Current Unaudited',
  'property_files/{property_id}/test_file_3.pdf',
  'Balance_Sheet_Q1_2024.pdf',
  'Balance Sheet Q1 2024',
  CURRENT_DATE + INTERVAL '25 days',
  false
);
```

### Option 3: Quick Test Script

Create a simple test script to set expiration dates on existing documents:

```sql
-- Set expiration dates on existing documents (if any exist)
UPDATE property_documents
SET expiration_date = CURRENT_DATE + INTERVAL '7 days',
    is_not_applicable = false
WHERE property_id = {property_id}
  AND file_path IS NOT NULL
LIMIT 3;
```

## Testing Scenarios

### Scenario 1: Single Document Expiring
- Create one document with expiration date in 10 days
- Run test endpoint
- Verify email shows single document

### Scenario 2: Multiple Documents from Same Section
- Create multiple documents in the same section (e.g., 3 "Architectural Guidelines" documents)
- Set different expiration dates (5, 15, 25 days)
- Run test endpoint
- Verify email shows all 3 documents with their specific file names

### Scenario 3: Multiple Documents from Different Sections
- Create documents in different sections
- Set expiration dates within 30 days
- Run test endpoint
- Verify email groups all documents together

### Scenario 4: Documents with N/A Status
- Create documents with `is_not_applicable = true`
- These should NOT appear in expiration emails
- Verify they are excluded

## Expected Results

### Successful Test Response

```json
{
  "success": true,
  "test": true,
  "message": "Test completed: 3 expiring documents across 1 properties",
  "dateRange": {
    "from": "2024-01-15",
    "to": "2024-02-14",
    "days": 30
  },
  "summary": {
    "properties_found": 1,
    "documents_expiring": 3,
    "emails_sent": 1,
    "emails_failed": 0
  },
  "emailResults": [
    {
      "property": "Test Property",
      "recipient": "owner@example.com",
      "documents": 3,
      "messageId": "...",
      "status": "sent"
    }
  ]
}
```

### No Expiring Documents Response

```json
{
  "success": true,
  "test": true,
  "message": "No expiring documents found in the specified date range",
  "dateRange": {
    "from": "2024-01-15",
    "to": "2024-02-14",
    "days": 30
  },
  "suggestion": "Create test documents with expiration dates within the next 30 days to test the email alerts."
}
```

## Email Content Verification

When you receive the test email, verify:

1. ✅ **Header** shows document count
2. ✅ **Document Type** is shown (e.g., "VA Appendix 02/Architectural Guidelines")
3. ✅ **Specific File Name** is shown (e.g., "Test_Contract_2024.pdf")
4. ✅ **Expiration Date** is formatted correctly
5. ✅ **Days Remaining** is color-coded:
   - Red: ≤7 days
   - Amber: 8-14 days
   - Green: 15-30 days
6. ✅ **Multiple Documents Note** appears when there are multiple documents
7. ✅ **Test Indicator** appears in test mode (if using testEmail parameter)

## Troubleshooting

### No Emails Sent

1. **Check Environment Variables**:
   ```bash
   SMTP_HOST=...
   SMTP_PORT=...
   EMAIL_USERNAME=...
   EMAIL_APP_PASSWORD=...
   ```

2. **Check Property Owner Email**:
   ```sql
   SELECT id, name, property_owner_email 
   FROM hoa_properties 
   WHERE id = {property_id};
   ```

3. **Check Documents**:
   ```sql
   SELECT id, document_name, expiration_date, is_not_applicable
   FROM property_documents
   WHERE property_id = {property_id}
     AND expiration_date IS NOT NULL
     AND is_not_applicable = false;
   ```

### Email Delivery Issues

- Check spam/junk folder
- Verify SMTP credentials are correct
- Test SMTP connection separately
- Check email service logs

### Clean Up Test Data

After testing, you can clean up:

```sql
-- Delete test documents
DELETE FROM property_documents
WHERE file_path LIKE '%test_file%'
   OR display_name LIKE '%Test%';

-- Or reset expiration dates
UPDATE property_documents
SET expiration_date = NULL
WHERE expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';
```

## Production Testing

For production testing, use the actual endpoint with proper authentication:

```bash
curl -X POST "https://your-domain.com/api/check-expiring-documents" \
  -H "x-cron-auth: YOUR_CRON_SECRET"
```

The cron job runs daily at 9 AM (configured in `vercel.json`).


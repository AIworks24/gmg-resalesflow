# Multi-Community Property-Specific PDF Generation and Email Sending

## 🎯 **Feature Overview**

Added individual "Generate PDF" and "Send Email" tasks for each property in multi-community applications, similar to how it works in standard applications. The send email button is only active when all forms for that specific property are completed.

## 🔧 **Implementation Details**

### **1. Database Schema Updates**

**New Fields Added to `application_property_groups` Table:**
- `pdf_url` - URL to the generated PDF for this property
- `pdf_status` - Status of PDF generation (`not_started`, `in_progress`, `completed`, `failed`)
- `pdf_completed_at` - Timestamp when PDF was completed
- `email_status` - Status of email sending (`not_started`, `in_progress`, `completed`, `failed`)
- `email_completed_at` - Timestamp when email was sent
- `form_data` - Property-specific form data for PDF generation

**Migration Files:**
- `database/add_property_group_pdf_email_fields_migration.sql`
- `pages/api/admin/run-property-group-pdf-email-migration.js`

### **2. Frontend Updates**

**AdminApplications.js Component:**
- Added **Task C: Generate PDF** for each property
- Added **Task D: Send Email** for each property
- Added helper functions:
  - `canGeneratePDFForProperty(group)` - Checks if both forms are completed
  - `canSendEmailForProperty(group)` - Checks if PDF is generated
  - `handleGeneratePDFForProperty(applicationId, group)` - Generates PDF for specific property
  - `handleSendEmailForProperty(applicationId, group)` - Sends email for specific property

**Task Logic:**
- **Primary Property**: Both inspection and resale forms must be completed before PDF generation
- **Secondary Properties**: Only resale form needs to be completed before PDF generation
- **Email Sending**: PDF must be generated first for any property

### **3. API Updates**

**Updated `pages/api/regenerate-pdf.js`:**
- Added support for `propertyGroupId` and `propertyName` parameters
- Generates different file paths for property-specific vs application-wide PDFs
- Updates appropriate table (`application_property_groups` vs `applications`)
- Returns property-specific information in response

**Updated `pages/api/send-approval-email.js`:**
- Added support for `propertyGroupId`, `propertyName`, and `pdfUrl` parameters
- Creates property-specific notification records
- Updates appropriate table based on email type
- Handles both property-specific and application-wide emails

### **4. Task Workflow**

**For Each Property in Multi-Community Applications:**

1. **Property Inspection Form** (Primary only)
   - Must be completed before PDF generation for primary property
   - Not applicable for secondary properties

2. **Virginia Resale Certificate** (All properties)
   - Must be completed before PDF generation for any property
   - Each property has its own form instance

3. **Generate PDF** (All properties)
   - Button disabled until required forms are completed
   - Generates property-specific PDF with unique filename
   - Updates property group status

4. **Send Email** (All properties)
   - Button disabled until PDF is generated
   - Sends property-specific email with PDF attachment
   - Updates property group email status

## 🎨 **UI/UX Features**

### **Task Status Indicators:**
- **Not Started** - Gray background, clock icon
- **In Progress** - Blue background, spinning refresh icon
- **Completed** - Green background, checkmark icon
- **Failed** - Red background, alert triangle icon

### **Button States:**
- **Generate PDF**: Disabled until forms are completed
- **Send Email**: Disabled until PDF is generated
- **View PDF**: Available when PDF is generated
- **Loading States**: Shows "Generating..." or "Sending..." during operations

### **Success Messages:**
- Property-specific success messages (e.g., "PDF generated successfully for Property A!")
- Clear feedback for each property's progress

## 🔄 **Data Flow**

### **PDF Generation Flow:**
1. User clicks "Generate PDF" for a property
2. Frontend calls `handleGeneratePDFForProperty()`
3. API receives `propertyGroupId` and `propertyName`
4. PDF generated with property-specific filename
5. Property group updated with PDF URL and status
6. UI refreshes to show PDF link

### **Email Sending Flow:**
1. User clicks "Send Email" for a property
2. Frontend calls `handleSendEmailForProperty()`
3. API receives `propertyGroupId`, `propertyName`, and `pdfUrl`
4. Email sent with property-specific PDF attachment
5. Property group updated with email status
6. UI refreshes to show completion status

## 🚀 **Benefits**

### **For Users:**
- **Individual Control**: Each property can be processed independently
- **Clear Progress**: Visual indicators show status for each property
- **Flexible Workflow**: Can complete properties in any order
- **Property-Specific Files**: Each property gets its own PDF and email

### **For Administrators:**
- **Better Organization**: Clear separation of tasks per property
- **Status Tracking**: Easy to see which properties are complete
- **Error Handling**: Failed operations don't affect other properties
- **Audit Trail**: Complete history of actions per property

## 🧪 **Testing**

### **Test Scenarios:**
1. **Primary Property Workflow**: Complete inspection → resale → PDF → email
2. **Secondary Property Workflow**: Complete resale → PDF → email
3. **Mixed Completion**: Some properties complete, others pending
4. **Error Handling**: PDF generation fails, email sending fails
5. **Status Persistence**: Refresh page, verify status maintained

### **Expected Results:**
- ✅ Each property shows individual task status
- ✅ Buttons disabled/enabled based on prerequisites
- ✅ Property-specific PDFs generated with unique filenames
- ✅ Property-specific emails sent with correct attachments
- ✅ Status updates persist across page refreshes
- ✅ Multi-community context maintained throughout workflow

## 📁 **Files Modified**

1. **`components/admin/AdminApplications.js`** - Added property-specific tasks and handlers
2. **`pages/api/regenerate-pdf.js`** - Added property-specific PDF generation
3. **`pages/api/send-approval-email.js`** - Added property-specific email sending
4. **`database/add_property_group_pdf_email_fields_migration.sql`** - Database schema updates
5. **`pages/api/admin/run-property-group-pdf-email-migration.js`** - Migration API endpoint

## 🎉 **Result**

Multi-community applications now have **individual PDF generation and email sending tasks for each property**, providing the same level of control and workflow as standard applications while maintaining the multi-community context throughout the process!
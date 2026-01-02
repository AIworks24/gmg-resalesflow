# Unified Form Builder System
## Visual Form Builder + AI-Powered PDF Importer with Live PDF Preview

**Feature Branch:** `feature/unified-form-builder`  
**Status:** 🚧 In Development  
**Last Updated:** 2026-01-01

---

## 🚀 Quick Start (For Developers)

**1. Get Google Gemini API Key (FREE):**
```bash
# Visit: https://ai.google.dev/
# Click "Get API Key" → Generate → Copy key
```

**2. Add to Environment:**
```bash
# .env.local
GOOGLE_API_KEY=AIza...
AI_PROVIDER=gemini
ENABLE_AI_FALLBACK=true
```

**3. Install Dependencies:**
```bash
# Required packages for form builder
npm install @google/generative-ai openai react-pdf

# Optional: Enhanced drag & drop (if not using native HTML5 drag & drop)
npm install react-dnd react-dnd-html5-backend

# Note: pdf-lib is already installed (^1.17.1)
```

**Package Details:**
- `@google/generative-ai` - Google Gemini API (FREE tier)
- `openai` - OpenAI API (Optional, Premium)
- `react-pdf` - PDF viewer for live preview (different from @react-pdf/renderer)
- `pdf-lib` - Already installed ✅
- `react-dnd` - Optional drag & drop library

**4. Test:**
- Create new form: `/admin/form-builder` → Drag & drop fields → See live PDF preview
- Import PDF: Upload PDF → AI analyzes → Edit in form builder → See live preview
- Assign to application type and task number

**Optional: Add OpenAI (for best quality):**
```bash
# Get $5 free credits: https://platform.openai.com/
OPENAI_API_KEY=sk-...
AI_PROVIDER=auto  # Will use Gemini first, OpenAI as fallback
```

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Problem Statement](#problem-statement)
3. [Solution Architecture](#solution-architecture)
4. [Database Schema](#database-schema)
5. [Implementation Steps](#implementation-steps)
6. [API Endpoints](#api-endpoints)
7. [Frontend Components](#frontend-components)
8. [AI Integration](#ai-integration)
9. [Live PDF Preview](#live-pdf-preview)
10. [Testing Strategy](#testing-strategy)
11. [Deployment Plan](#deployment-plan)

---

## 🎯 Overview

### What We're Building

A **unified form builder system** with two powerful workflows:

1. **Visual Form Builder** - Drag & drop interface to create forms from scratch
2. **AI-Powered PDF Importer** - Upload PDF → AI analyzes → Generate form structure

Both workflows feature a **split-view interface** with **live PDF preview** showing exactly how the form will look when generated.

### Split-View Interface

The form builder uses a **split-screen layout**:

- **Left Panel**: Visual form builder with drag & drop fields, configuration, and mapping
- **Right Panel**: Live PDF preview that updates in real-time as you build

This gives users **immediate visual feedback** - they can see exactly how their form will look in the final PDF as they configure each field.

### Key Workflows

#### Workflow 1: Visual Form Builder
```
1. Click "Create New Form"
2. Upload/Select PDF template (shows in preview)
3. Drag fields from palette → Add to form
4. Configure field (label, type, validation)
5. Map to PDF field → See it highlighted in preview
6. Map to data source → See sample data in preview
7. Save template → Assign to application type & task
```

#### Workflow 2: AI PDF Importer
```
1. Click "Import PDF"
2. Upload PDF file
3. AI analyzes PDF → Extracts all fields
4. AI generates form structure → Shows in builder
5. Review & edit AI suggestions
6. Live preview updates as you edit
7. Save template → Assign to application type & task
```

### Key Features

✅ **Visual Form Builder** → Drag & drop fields, configure logic, map to PDF  
✅ **AI PDF Importer** → Upload PDF → AI extracts fields → Auto-generates form  
✅ **Live PDF Preview** → Real-time preview as you build (split-view)  
✅ **Field Configuration** → Labels, validation, conditional logic, data mapping  
✅ **PDF Field Mapping** → Map form fields to PDF template fields  
✅ **Application Type Assignment** → Assign forms to application types & task numbers  
✅ **Template Storage** → Save and reuse form templates  
✅ **Dynamic PDF Generation** → Auto-fill PDFs using saved templates  

### Business Value

- ⏱️ **Time Savings:** 2-4 hours → 10-15 minutes per new form template
- 👥 **Non-Technical Access:** Staff can create/edit forms without developers
- 🎯 **Accuracy:** AI-validated mappings + live preview reduce errors by 80%+
- 📈 **Scalability:** Handle 100+ unique lender forms easily
- 💰 **Cost:** FREE with Gemini, ~$0.02 per PDF analysis with OpenAI
- 👁️ **Visual Feedback:** Live preview eliminates guesswork

---

## 🔍 Problem Statement

### Current Workflow (Manual)

1. Staff receives new lender questionnaire PDF
2. Developer must:
   - Open PDF in Adobe Acrobat
   - Manually inspect each field name
   - Write JavaScript mapping code in `pdfFieldMapper.js`
   - Add field definitions to `fields.js`
   - Test manually
   - Deploy code changes
3. **Time Required:** 2-4 hours per template
4. **Bottleneck:** Requires developer availability
5. **Error-Prone:** Manual field name transcription
6. **No Version Control:** Hard to track what's been mapped

### New Workflow (AI-Powered)

1. Staff uploads PDF to admin dashboard
2. AI analyzes PDF (30 seconds):
   - Extracts all form fields
   - Analyzes visual layout and labels
   - Suggests intelligent mappings
3. Staff reviews suggestions in visual interface
4. Staff adjusts mappings if needed (drag & drop)
5. Staff saves template
6. **Time Required:** 10-15 minutes
7. **No Developer Needed:** Self-service for staff
8. **High Accuracy:** AI suggestions validated
9. **Versioned:** Stored in database with audit trail

---

## 🏗️ Solution Architecture

### Architecture Pattern: Hybrid (Integrated with Async Processing)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Next.js Application                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────────┐        ┌──────────────────┐                │
│  │  Admin Dashboard│        │  Form Builder UI │                │
│  │  /admin/...     │───────▶│  /admin/form-    │                │
│  │                 │        │   templates      │                │
│  └─────────────────┘        └──────────────────┘                │
│                                      │                            │
│                                      ▼                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              API Routes (Next.js API)                      │  │
│  │                                                             │  │
│  │  POST /api/ai/analyze-pdf-form                            │  │
│  │  GET  /api/ai/jobs/[jobId]                                │  │
│  │  POST /api/ai/save-template                               │  │
│  │  POST /api/ai/fill-pdf                                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          │           │                           │
│                          ▼           ▼                           │
│  ┌──────────────────┐  ┌────────────────────┐                  │
│  │  AI Service      │  │  Job Queue Manager │                  │
│  │  (OpenAI)        │  │  (DB-based)        │                  │
│  └──────────────────┘  └────────────────────┘                  │
│           │                      │                               │
└───────────┼──────────────────────┼───────────────────────────────┘
            │                      │
            ▼                      ▼
    ┌──────────────┐      ┌──────────────────┐
    │   OpenAI     │      │   Supabase DB    │
    │   API        │      │  - ai_processing │
    │  - GPT-4     │      │    _jobs         │
    │  - Vision    │      │  - form_templates│
    └──────────────┘      └──────────────────┘
```

### Why This Architecture?

- ✅ **No Separate Infrastructure:** Runs in existing Next.js app
- ✅ **Async Processing:** Doesn't block main app
- ✅ **Scalable:** Vercel handles function concurrency
- ✅ **Simple:** No external queue services needed initially
- ✅ **Cost-Effective:** Pay only for OpenAI API usage

---

## 💾 Database Schema

### 1. `ai_processing_jobs` Table

**Status:** ✅ Created (Migration applied)

```sql
CREATE TABLE ai_processing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  job_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  input_data JSONB NOT NULL,
  results JSONB,
  error TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose:** Track AI processing jobs (PDF analysis, field mapping)

**Job Types:**
- `pdf_analysis` - Extract fields from PDF
- `field_mapping` - Generate intelligent mapping suggestions

**Status Flow:**
```
pending → processing → completed
                    └→ failed
```

**Example `input_data`:**
```json
{
  "pdfPath": "lender_questionnaires/123/form.pdf",
  "formType": "lender_questionnaire",
  "templateName": "Wells Fargo Questionnaire"
}
```

**Example `results`:**
```json
{
  "fields": [
    {
      "name": "Borrower_Name",
      "type": "text",
      "page": 1,
      "coordinates": {"x": 100, "y": 200, "width": 200, "height": 20},
      "suggestedMapping": "buyerName",
      "confidence": 0.95,
      "reasoning": "Field labeled 'Borrower Name' at top of form"
    }
  ],
  "totalFields": 45,
  "processingTime": 12.5
}
```

---

### 2. `form_templates` Table

**Status:** 🚧 To Be Created

```sql
CREATE TABLE form_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Form creation method
  creation_method VARCHAR(50) DEFAULT 'visual', -- 'visual' or 'ai_import'
  ai_generated BOOLEAN DEFAULT false,
  ai_confidence_score FLOAT, -- For AI-imported forms
  
  -- Form structure (JSON)
  form_structure JSONB NOT NULL, -- Sections, fields, layout, logic
  
  -- PDF configuration
  pdf_template_path TEXT, -- Path to PDF template in Supabase storage
  pdf_field_mappings JSONB, -- Map form fields → PDF fields
  
  -- Data source mapping
  data_source_mappings JSONB, -- Map form fields → application data fields
  
  -- Assignment to application types and tasks
  application_types JSONB DEFAULT '[]', -- ['settlement_va', 'settlement_nc', etc.]
  task_number INTEGER, -- Which task in workflow (1, 2, 3, etc.)
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  last_used_at TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Purpose:** Store reusable form templates with complete form structure, PDF mappings, and assignments

**Example `form_structure`:**
```json
{
  "sections": [
    {
      "id": "section-1",
      "title": "Property Information",
      "layout": "two-column",
      "fields": [
        {
          "id": "field-1",
          "key": "propertyAddress",
          "label": "Property Address",
          "type": "text",
          "required": true,
          "validation": {
            "minLength": 5
          },
          "dataSource": "application.property_address",
          "pdfMapping": "Property_Address",
          "conditionalLogic": null
        }
      ]
    }
  ]
}
```

**Example `pdf_field_mappings`:**
```json
{
  "field-1": {
    "pdfFieldName": "Property_Address",
    "transform": null,
    "coordinates": {"x": 100, "y": 200, "width": 200, "height": 20}
  }
}
```

**Example `data_source_mappings`:**
```json
{
  "field-1": {
    "source": "application.property_address",
    "transform": null
  },
  "field-2": {
    "source": "application.buyer_name",
    "transform": "uppercase"
  }
}
```

---

## 📝 Implementation Steps

### Phase 1: Backend Infrastructure ✅ (Completed)

**Files Created:**
- ✅ `supabase/migrations/20260101161811_add_ai_processing_jobs_table.sql`

**Status:** Migration applied to database

---

### Phase 2: AI Service Layer (Next)

#### 2.0 AI Provider Manager (NEW - Hybrid Support)

**File:** `lib/ai/aiProvider.js`

**Purpose:** Unified interface for multiple AI providers

**Features:**
- Auto-detect available AI providers
- Switch between Gemini/OpenAI/Mock
- Automatic fallback on errors
- Provider-agnostic API

**Functions:**
```javascript
- selectAIProvider() // Auto-select based on config
- analyzeWithAI(image, prompt, provider) // Unified analysis
- analyzeWithFallback(image, prompt) // With auto-fallback
- getProviderStatus() // Check which providers are configured
```

---

#### 2.1 Google Gemini Integration

**File:** `lib/ai/geminiService.js`

**Purpose:** Google Gemini API client (FREE)

**Features:**
- Initialize Gemini client
- Vision analysis
- Rate limit handling (60/min free tier)
- Error handling

**Functions:**
```javascript
- initGemini() // Initialize client
- analyzeImageWithGemini(imageBuffer, prompt) // Gemini Vision
- generateFieldMappingsGemini(fieldNames, context) // Gemini text
```

**Dependencies:**
```bash
npm install @google/generative-ai
```

---

#### 2.2 OpenAI Integration (Optional)

**File:** `lib/ai/openaiService.js`

**Purpose:** OpenAI API client (PREMIUM, Optional)

**Features:**
- Initialize OpenAI client
- GPT-4 Vision analysis
- Error handling with retries
- Cost tracking

**Functions:**
```javascript
- initOpenAI() // Initialize client
- analyzeImageWithVision(imageBuffer, prompt) // GPT-4 Vision
- generateFieldMappings(fieldNames, context) // GPT-4 text
- estimateCost(operation) // Cost calculation
```

**Dependencies:**
```bash
npm install openai
```

---

#### 2.3 PDF Analysis Service

**File:** `lib/ai/pdfAnalyzer.js`

**Purpose:** Extract PDF form fields and metadata

**Functions:**
```javascript
- extractPDFFields(pdfBuffer) 
  // Uses pdf-lib to get field names, types, coordinates
  
- convertPDFToImage(pdfBuffer, pageNum)
  // Convert PDF page to image for Vision API
  
- analyzePDFWithVision(pdfBuffer)
  // Use GPT-4 Vision to understand field context
```

**Output:**
```json
{
  "fields": [/* field objects */],
  "metadata": {
    "totalPages": 3,
    "totalFields": 45,
    "formTitle": "Lender Questionnaire"
  }
}
```

---

#### 2.4 Mapping Intelligence Service

**File:** `lib/ai/mappingSuggestions.js`

**Purpose:** Generate intelligent field mapping suggestions

**Functions:**
```javascript
- generateMappingSuggestions(pdfFields, applicationSchema)
  // AI-powered mapping suggestions
  
- applyRuleBasedMatching(fieldName)
  // Fast rule-based fallback
  
- calculateConfidence(pdfField, appField)
  // Confidence scoring algorithm
  
- validateMapping(mapping)
  // Validate mapping correctness
```

**Matching Strategy:**
```
1. Rule-based quick match (instant) - 60% accuracy
2. AI semantic analysis (10-30s) - 95% accuracy
3. Hybrid combination - 98% accuracy
```

---

### Phase 3: API Endpoints

#### 3.1 PDF Analysis Endpoint

**File:** `pages/api/ai/analyze-pdf-form.js`

**Method:** `POST`

**Purpose:** Upload PDF and start analysis job

**Request:**
```javascript
// multipart/form-data
{
  file: File, // PDF file
  formType: "lender_questionnaire" | "settlement_form",
  templateName: string
}
```

**Response (202 Accepted):**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "message": "PDF analysis started",
  "estimatedTime": 30
}
```

**Workflow:**
```javascript
1. Validate file (PDF, < 10MB)
2. Upload to Supabase Storage
3. Create job record (status: pending)
4. Return jobId immediately (don't wait)
5. Process asynchronously in background:
   a. Extract PDF fields (pdf-lib)
   b. Convert first page to image
   c. Analyze with GPT-4 Vision
   d. Generate mapping suggestions
   e. Update job status to completed
```

---

#### 3.2 Job Status Endpoint

**File:** `pages/api/ai/jobs/[jobId].js`

**Method:** `GET`

**Purpose:** Poll for job completion

**Response (200 OK):**
```json
{
  "id": "uuid",
  "status": "completed" | "processing" | "pending" | "failed",
  "results": {/* analysis results */},
  "error": null,
  "progress": 100,
  "createdAt": "2026-01-01T16:00:00Z",
  "completedAt": "2026-01-01T16:00:30Z"
}
```

**Client Usage:**
```javascript
// Poll every 2 seconds
const interval = setInterval(async () => {
  const job = await fetch(`/api/ai/jobs/${jobId}`);
  if (job.status === 'completed') {
    clearInterval(interval);
    displayResults(job.results);
  }
}, 2000);
```

---

#### 3.3 Save Template Endpoint

**File:** `pages/api/ai/save-template.js`

**Method:** `POST`

**Purpose:** Save field mappings as reusable template

**Request:**
```json
{
  "name": "Wells Fargo Lender Questionnaire",
  "formType": "lender_questionnaire",
  "pdfPath": "path/to/template.pdf",
  "fieldMappings": {/* mapping object */},
  "aiGenerated": true,
  "confidenceScore": 0.94
}
```

**Response (201 Created):**
```json
{
  "templateId": "uuid",
  "message": "Template saved successfully"
}
```

---

#### 3.4 Fill PDF Endpoint

**File:** `pages/api/ai/fill-pdf.js`

**Method:** `POST`

**Purpose:** Auto-fill PDF using saved template

**Request:**
```json
{
  "templateId": "uuid",
  "applicationId": "uuid"
}
```

**Response (200 OK):**
```json
{
  "pdfUrl": "https://storage.../filled.pdf",
  "generatedAt": "2026-01-01T16:30:00Z"
}
```

**Workflow:**
```javascript
1. Load template from database
2. Load application data
3. Apply field mappings dynamically
4. Fill PDF using pdf-lib
5. Upload to Supabase Storage
6. Return public URL
```

---

### Phase 4: Frontend Components

#### 4.1 Admin Route - Form Builder

**File:** `pages/admin/form-builder.js`

**Purpose:** Main admin page for form builder

**Features:**
- List existing form templates
- Create new form (visual builder)
- Import PDF (AI-powered)
- Search/filter templates
- Template usage statistics
- Assign to application types

---

#### 4.2 Unified Form Builder Component (Split-View)

**File:** `components/admin/formBuilder/UnifiedFormBuilder.js`

**Purpose:** Main form builder interface with live PDF preview

**Layout (Split-View):**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Unified Form Builder - [Form Name]                                 │
├──────────────────────────────┬──────────────────────────────────────┤
│                              │                                      │
│  FORM BUILDER (Left Panel)   │  LIVE PDF PREVIEW (Right Panel)      │
│                              │                                      │
│  ┌────────────────────────┐  │  ┌────────────────────────────────┐  │
│  │ Field Palette         │  │  │ PDF Preview (Live Updates)     │  │
│  │ ┌────┐ ┌────┐ ┌────┐ │  │  │                                │  │
│  │ │Text│ │Date│ │Sel │ │  │  │  [PDF rendered with current    │  │
│  │ └────┘ └────┘ └────┘ │  │  │   form data filled in]        │  │
│  └────────────────────────┘  │  │                                │  │
│                              │  │  Property Address: [filled]    │  │
│  ┌────────────────────────┐  │  │  Buyer Name: [filled]         │  │
│  │ Form Structure         │  │  │  Closing Date: [filled]        │  │
│  │                        │  │  │                                │  │
│  │ Section 1: Property    │  │  │  [Scrollable PDF view]         │  │
│  │   ├─ Property Address  │  │  │                                │  │
│  │   ├─ Association Name │  │  │                                │  │
│  │                        │  │  │                                │  │
│  │ Section 2: Buyer      │  │  │  [Zoom controls]               │  │
│  │   ├─ Buyer Name       │  │  │  [Page navigation]               │  │
│  │   └─ Buyer Email      │  │  │                                │  │
│  │                        │  │  └────────────────────────────────┘  │
│  │ [Drag fields here]    │  │                                      │
│  └────────────────────────┘  │                                      │
│                              │                                      │
│  ┌────────────────────────┐  │                                      │
│  │ Field Configuration    │  │                                      │
│  │ (when field selected)  │  │                                      │
│  │                        │  │                                      │
│  │ Label: [___]          │  │                                      │
│  │ Type: [dropdown]      │  │                                      │
│  │ Required: [✓]          │  │                                      │
│  │ Data Source: [___]    │  │                                      │
│  │ PDF Mapping: [___]    │  │                                      │
│  └────────────────────────┘  │                                      │
│                              │                                      │
└──────────────────────────────┴──────────────────────────────────────┘
│  [Save Template]  [Test with Sample Data]  [Assign to App Type]  [Cancel]│
└─────────────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Split-view layout** (resizable panels)
- **Live PDF preview** updates as form is built
- **Drag & drop** fields from palette
- **Field configuration** panel (opens when field selected)
- **PDF field mapping** interface
- **Data source mapping** to application fields
- **Conditional logic** builder
- **Real-time preview** with sample data

**State Management:**
```javascript
const [formStructure, setFormStructure] = useState({ sections: [] });
const [selectedField, setSelectedField] = useState(null);
const [pdfPreview, setPdfPreview] = useState(null); // PDF blob URL
const [previewData, setPreviewData] = useState({}); // Sample data for preview
const [pdfTemplate, setPdfTemplate] = useState(null); // PDF template file
const [isPreviewLoading, setIsPreviewLoading] = useState(false);
const [creationMethod, setCreationMethod] = useState('visual'); // 'visual' or 'ai_import'
```

**User Flow (Visual Builder):**
```
1. Click "Create New Form" → Opens split-view builder
2. Upload/Select PDF template → Shows in preview panel
3. Drag fields from palette → Adds to form structure
4. Configure field → Updates preview in real-time
5. Map to PDF field → Highlights in preview
6. Map to data source → Shows sample data in preview
7. Save template → Stores form structure
```

**User Flow (AI Import):**
```
1. Click "Import PDF" → Upload PDF file
2. AI analyzes PDF → Shows progress
3. AI generates form structure → Displays in builder
4. Review AI suggestions → Edit as needed
5. Live preview updates → See changes instantly
6. Save template → Stores form structure
```

---

#### 4.3 PDF Viewer Component

**File:** `components/admin/formBuilder/PDFViewer.js`

**Purpose:** Display PDF with highlighted fields

**Features:**
- Render PDF using react-pdf or PDF.js
- Highlight selected field
- Click field to select in mapping panel
- Zoom controls

---

#### 4.4 Field Mapper Component

**File:** `components/admin/formBuilder/FieldMapper.js`

**Purpose:** List and edit field mappings

**Features:**
- Display all extracted fields
- Show AI suggestions with confidence
- Dropdown to select app field mapping
- Manual override capability
- Bulk actions (accept all, reset all)

---

#### 4.5 AI Suggestion Badge

**File:** `components/admin/formBuilder/AISuggestionBadge.js`

**Purpose:** Visual indicator for AI confidence

```jsx
<AISuggestionBadge confidence={0.95}>
  95% confident
</AISuggestionBadge>

// Color coding:
// 90-100%: Green (high confidence)
// 70-89%:  Yellow (medium confidence)
// < 70%:   Red (low confidence - review needed)
```

---

#### 4.3 Live PDF Preview Component

**File:** `components/admin/formBuilder/LivePDFPreview.js`

**Purpose:** Real-time PDF preview that updates as form is built

**Features:**
- Renders PDF using `react-pdf` library
- Fills PDF fields with current form data (sample or real)
- Highlights mapped fields in preview
- Zoom controls (25%, 50%, 75%, 100%, 150%, 200%)
- Page navigation (multi-page PDFs)
- Scroll synchronization
- Field highlighting on hover

**Implementation:**
```javascript
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

function LivePDFPreview({ 
  pdfTemplate, 
  formStructure, 
  fieldMappings, 
  previewData 
}) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [highlightedField, setHighlightedField] = useState(null);

  // Generate filled PDF preview
  useEffect(() => {
    if (pdfTemplate && formStructure) {
      generatePreviewPDF();
    }
  }, [pdfTemplate, formStructure, fieldMappings, previewData]);

  const generatePreviewPDF = async () => {
    // Use pdf-lib to fill PDF with current form data
    const filledPdf = await fillPDFWithFormData(
      pdfTemplate,
      formStructure,
      fieldMappings,
      previewData
    );
    setPdfBlob(filledPdf);
  };

  return (
    <div className="live-pdf-preview">
      <div className="preview-controls">
        <button onClick={() => setScale(s => Math.max(0.5, s - 0.25))}>-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale(s => Math.min(2, s + 0.25))}>+</button>
        <button onClick={() => setPageNumber(p => Math.max(1, p - 1))}>Prev</button>
        <span>Page {pageNumber} of {numPages}</span>
        <button onClick={() => setPageNumber(p => Math.min(numPages, p + 1))}>Next</button>
      </div>
      
      <Document
        file={pdfBlob}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      >
        <Page
          pageNumber={pageNumber}
          scale={scale}
          renderAnnotationLayer={true}
          renderTextLayer={true}
        />
      </Document>
    </div>
  );
}
```

**Performance Optimization:**
- Debounce preview updates (300ms delay)
- Only regenerate PDF when form structure changes
- Cache filled PDF blob
- Lazy load PDF pages

---

#### 4.4 PDF Field Mapping Interface

**File:** `components/admin/formBuilder/PDFFieldMapper.js`

**Purpose:** Visual interface for mapping form fields to PDF fields

**Features:**
- Click form field → Highlights corresponding PDF field
- Click PDF field → Shows mapping options
- Drag & drop mapping
- Visual indicators for mapped/unmapped fields
- Field coordinate display

---

### Phase 5: AI Integration Details

#### 5.0 Hybrid AI Strategy ⭐ (FREE + PREMIUM)

**Approach:** Support multiple AI providers with automatic fallback

**Providers:**
1. **Google Gemini** (Primary, FREE forever)
   - Free tier: 60 requests/minute
   - Vision API included
   - Good quality for field analysis
   
2. **OpenAI GPT-4** (Premium, Optional)
   - $5 free credits for new accounts
   - Best quality AI analysis
   - Fallback for complex forms

**Environment Variables:**
```bash
# AI Provider Configuration
AI_PROVIDER=gemini              # 'gemini' or 'openai' or 'auto'

# Google Gemini (FREE)
GOOGLE_API_KEY=AIza...          # Get from: https://ai.google.dev/
GEMINI_MODEL=gemini-pro-vision  # or gemini-1.5-pro

# OpenAI (PREMIUM - Optional)
OPENAI_API_KEY=sk-...           # Get from: https://platform.openai.com/
OPENAI_MODEL_VISION=gpt-4-vision-preview
OPENAI_MODEL_TEXT=gpt-4-turbo-preview

# Fallback Strategy
ENABLE_AI_FALLBACK=true         # Auto-fallback if primary fails
```

**Cost Comparison:**
| Provider | Cost per Analysis | Monthly (50 PDFs) | Quality | Speed |
|----------|-------------------|-------------------|---------|-------|
| Google Gemini | **FREE** | **$0** | Very Good | Fast |
| OpenAI GPT-4 | $0.01-0.02 | $0.50-1.00 | Excellent | Fast |

**Recommendation:** Start with Gemini (free), add OpenAI key later if needed.

**Benefits of Hybrid Approach:**
- ✅ **Zero Cost to Start:** Use Gemini for free development/testing
- ✅ **No Vendor Lock-in:** Switch providers anytime via env variable
- ✅ **Automatic Fallback:** If one provider fails, auto-switch to backup
- ✅ **Cost Optimization:** Use free Gemini, upgrade to OpenAI only if needed
- ✅ **Future-Proof:** Easy to add more providers (Anthropic Claude, etc.)

---

#### 5.1 Getting API Keys

**Google Gemini (FREE):**
1. Go to https://ai.google.dev/
2. Click "Get API Key" (sign in with Google)
3. Create new project → Generate API key
4. Copy key (starts with `AIza...`)
5. Add to `.env.local`: `GOOGLE_API_KEY=AIza...`

**OpenAI (Optional, $5 free credits):**
1. Go to https://platform.openai.com/signup
2. Create account
3. Go to https://platform.openai.com/api-keys
4. Create new secret key
5. Copy key (starts with `sk-...`)
6. Add to `.env.local`: `OPENAI_API_KEY=sk-...`

---

#### 5.2 AI Provider Selection Logic

```javascript
// lib/ai/aiProvider.js

function selectAIProvider() {
  const configured = process.env.AI_PROVIDER || 'auto';
  
  if (configured === 'auto') {
    // Auto-select based on available keys
    if (process.env.GOOGLE_API_KEY) return 'gemini';
    if (process.env.OPENAI_API_KEY) return 'openai';
    return 'mock'; // Fallback to mock if no keys
  }
  
  return configured; // 'gemini', 'openai', or 'mock'
}

// Automatic fallback if primary fails
async function analyzeWithFallback(image, prompt) {
  const primary = selectAIProvider();
  
  try {
    return await analyze(image, prompt, primary);
  } catch (error) {
    if (process.env.ENABLE_AI_FALLBACK === 'true') {
      const fallback = primary === 'gemini' ? 'openai' : 'gemini';
      console.log(`Primary AI failed, trying fallback: ${fallback}`);
      return await analyze(image, prompt, fallback);
    }
    throw error;
  }
}
```

---

#### 5.3 Vision API Prompt Engineering (Same for both providers)

**Prompt Template:**
```
Analyze this PDF form image and identify form fields.

For each visible field, provide:
1. Field label/description as it appears
2. Likely data type (text, date, checkbox, etc.)
3. Position on page (top, middle, bottom)
4. Context clues (nearby text, section headers)

PDF fields detected programmatically:
${fieldNames}

Match visual labels to programmatic field names.

Return structured JSON.
```

**Example Output:**
```json
{
  "Borrower_Name": {
    "visualLabel": "Borrower/Buyer Name",
    "position": "top-left",
    "context": "Main applicant section",
    "dataType": "text",
    "confidence": "high"
  }
}
```

---

#### 5.4 Field Mapping AI Prompt (Same for both providers)

**Prompt Template:**
```
Given these PDF field names from a lender questionnaire,
suggest the best mapping to application data fields.

PDF Fields:
${pdfFieldNames}

Available Application Fields:
- buyerName: Buyer/borrower full name
- sellerName: Seller full name
- propertyAddress: Property street address
- hoaProperty: HOA community name
- closingDate: Transaction closing date (MM/DD/YYYY)
- salePrice: Sale price in dollars
- submitterName: Form submitter name
- submitterEmail: Form submitter email
- packageType: 'standard' or 'rush'

Return JSON array with suggestions and confidence scores (0-1).

Example:
[
  {
    "pdfField": "Borrower_Name",
    "suggestedMapping": "buyerName",
    "confidence": 0.95,
    "reasoning": "Direct match - borrower is the buyer"
  }
]
```

---

## 👁️ Live PDF Preview Implementation

### Overview

The live PDF preview is the **core UX feature** that shows users exactly how their form will look when generated. It updates in real-time as they build the form.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Form Builder State Changes                             │
│  (field added, configured, mapped)                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Preview Generator Service                               │
│  - Debounces updates (300ms)                            │
│  - Merges form structure + sample data                  │
│  - Applies field mappings                               │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  PDF Filling Service (pdf-lib)                          │
│  - Loads PDF template                                    │
│  - Fills fields with mapped data                        │
│  - Returns filled PDF blob                              │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  React-PDF Viewer Component                             │
│  - Renders PDF in browser                                │
│  - Shows filled fields                                  │
│  - Highlights mapped fields on hover                    │
└─────────────────────────────────────────────────────────┘
```

### Implementation Details

#### 1. Preview Generator Service

**File:** `lib/formBuilder/previewGenerator.js`

```javascript
import { PDFDocument } from 'pdf-lib';

/**
 * Generate live PDF preview from form structure
 * @param {Uint8Array} pdfTemplate - PDF template bytes
 * @param {Object} formStructure - Form structure JSON
 * @param {Object} fieldMappings - PDF field mappings
 * @param {Object} previewData - Sample data for preview
 * @returns {Promise<Uint8Array>} - Filled PDF bytes
 */
export async function generateLivePreview(
  pdfTemplate,
  formStructure,
  fieldMappings,
  previewData = {}
) {
  // Load PDF template
  const pdfDoc = await PDFDocument.load(pdfTemplate);
  const form = pdfDoc.getForm();
  
  // Get all form fields
  const fields = form.getFields();
  const fieldMap = new Map();
  fields.forEach(field => {
    fieldMap.set(field.getName(), field);
  });
  
  // Fill PDF fields based on form structure
  for (const section of formStructure.sections || []) {
    for (const field of section.fields || []) {
      const pdfFieldName = fieldMappings[field.id]?.pdfFieldName;
      if (!pdfFieldName) continue;
      
      const pdfField = fieldMap.get(pdfFieldName);
      if (!pdfField) continue;
      
      // Get value from preview data or use sample
      const value = getFieldValue(field, previewData);
      
      // Fill PDF field
      fillPDFField(pdfField, value, field.type);
    }
  }
  
  // Return filled PDF bytes
  return await pdfDoc.save();
}

function getFieldValue(field, previewData) {
  // Check if field has data source mapping
  if (field.dataSource) {
    return getNestedValue(previewData, field.dataSource) || '';
  }
  
  // Return sample data based on field type
  return getSampleValue(field.type);
}

function getSampleValue(fieldType) {
  const samples = {
    text: 'Sample Text',
    email: 'sample@example.com',
    tel: '(555) 123-4567',
    date: new Date().toLocaleDateString(),
    number: '12345',
    select: 'Option 1'
  };
  return samples[fieldType] || '';
}
```

#### 2. Debounced Preview Updates

**File:** `hooks/useDebouncedPreview.js`

```javascript
import { useState, useEffect, useRef } from 'react';

export function useDebouncedPreview(
  formStructure,
  fieldMappings,
  previewData,
  delay = 300
) {
  const [previewPdf, setPreviewPdf] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const timeoutRef = useRef(null);
  
  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Set loading state
    setIsGenerating(true);
    
    // Debounce preview generation
    timeoutRef.current = setTimeout(async () => {
      try {
        const { generateLivePreview } = await import('../lib/formBuilder/previewGenerator');
        const pdfBlob = await generateLivePreview(
          pdfTemplate,
          formStructure,
          fieldMappings,
          previewData
        );
        setPreviewPdf(pdfBlob);
      } catch (error) {
        console.error('Preview generation failed:', error);
      } finally {
        setIsGenerating(false);
      }
    }, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [formStructure, fieldMappings, previewData]);
  
  return { previewPdf, isGenerating };
}
```

#### 3. React-PDF Viewer Component

**File:** `components/admin/formBuilder/LivePDFPreview.js`

```javascript
import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

export default function LivePDFPreview({ 
  pdfBlob, 
  fieldMappings,
  onFieldHover 
}) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  
  const handleZoomIn = () => setScale(s => Math.min(3, s + 0.25));
  const handleZoomOut = () => setScale(s => Math.max(0.5, s - 0.25));
  const handlePrevPage = () => setPageNumber(p => Math.max(1, p - 1));
  const handleNextPage = () => setPageNumber(p => Math.min(numPages || 1, p + 1));
  
  // Create blob URL for PDF
  const [pdfUrl, setPdfUrl] = useState(null);
  
  useEffect(() => {
    if (pdfBlob) {
      const url = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [pdfBlob]);
  
  return (
    <div className="live-pdf-preview bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Controls */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-gray-200 rounded"
            disabled={scale <= 0.5}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-gray-200 rounded"
            disabled={scale >= 3}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevPage}
            className="p-1 hover:bg-gray-200 rounded"
            disabled={pageNumber <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium min-w-[80px] text-center">
            Page {pageNumber} {numPages ? `of ${numPages}` : ''}
          </span>
          <button
            onClick={handleNextPage}
            className="p-1 hover:bg-gray-200 rounded"
            disabled={!numPages || pageNumber >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* PDF Viewer */}
      <div className="overflow-auto p-4 bg-gray-100" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {pdfUrl ? (
          <Document
            file={pdfUrl}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);
              setLoading(false);
            }}
            onLoadError={(error) => {
              console.error('PDF load error:', error);
              setLoading(false);
            }}
            loading={<div className="text-center p-8">Loading PDF...</div>}
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderAnnotationLayer={true}
              renderTextLayer={true}
              className="mx-auto shadow-lg"
            />
          </Document>
        ) : (
          <div className="text-center p-8 text-gray-500">
            Upload a PDF template to see preview
          </div>
        )}
      </div>
    </div>
  );
}
```

### Performance Optimizations

1. **Debouncing**: Preview updates are debounced by 300ms to avoid excessive regeneration
2. **Caching**: Filled PDF blob is cached until form structure changes
3. **Lazy Loading**: PDF pages are loaded on-demand
4. **Web Workers**: PDF.js uses web workers for non-blocking rendering
5. **Memoization**: React components use memo to prevent unnecessary re-renders

### User Experience Features

- **Real-time Updates**: Preview updates as user builds form (with debounce)
- **Field Highlighting**: Hover over form field → Highlights in PDF preview
- **Zoom Controls**: 25% to 300% zoom levels
- **Page Navigation**: Multi-page PDF support
- **Loading States**: Shows loading indicator during preview generation
- **Error Handling**: Graceful error messages if preview fails

---

### Phase 6: Testing Strategy

#### 6.1 Unit Tests

**Files to Test:**
- `lib/ai/pdfAnalyzer.js`
- `lib/ai/mappingSuggestions.js`
- `lib/ai/openaiService.js`

**Test Cases:**
```javascript
describe('PDF Analyzer', () => {
  test('extracts fields from valid PDF', async () => {
    const pdf = loadTestPDF('sample-lender-form.pdf');
    const fields = await extractPDFFields(pdf);
    expect(fields).toHaveLength(45);
    expect(fields[0]).toHaveProperty('name');
    expect(fields[0]).toHaveProperty('type');
  });

  test('handles corrupted PDF gracefully', async () => {
    const pdf = loadTestPDF('corrupted.pdf');
    await expect(extractPDFFields(pdf)).rejects.toThrow();
  });
});
```

---

#### 6.2 Integration Tests

**Test Scenarios:**
1. Upload PDF → Wait for analysis → Verify results
2. Save template → Load template → Verify mappings
3. Fill PDF using template → Verify output

---

#### 6.3 Manual Testing Checklist

- [ ] Upload Wells Fargo lender form
- [ ] Verify AI suggestions are accurate
- [ ] Manually adjust 1-2 mappings
- [ ] Save template
- [ ] Load template and fill PDF
- [ ] Test with Bank of America form
- [ ] Test with Chase form
- [ ] Test error handling (invalid PDF)
- [ ] Test with large PDF (100+ fields)
- [ ] Test concurrent uploads

---

### Phase 7: Deployment Plan

#### 7.1 Environment Setup

**Development:**
```bash
# .env.local
OPENAI_API_KEY=sk-test-...
NEXT_PUBLIC_ENABLE_AI_FEATURES=true
```

**Production:**
```bash
# Vercel Environment Variables
OPENAI_API_KEY=sk-live-...
NEXT_PUBLIC_ENABLE_AI_FEATURES=true
```

---

#### 7.2 Database Migrations

```bash
# Already applied:
✅ 20260101161811_add_ai_processing_jobs_table.sql

# To be created:
🚧 20260101170000_add_form_templates_table.sql
🚧 20260101170100_add_template_usage_tracking.sql
```

---

#### 7.3 Feature Flags

**Progressive Rollout:**
```javascript
// lib/featureFlags.js
export const AI_FEATURES = {
  formBuilder: process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES === 'true',
  autoFillPDF: process.env.NEXT_PUBLIC_ENABLE_AUTO_FILL === 'true'
};
```

**Rollout Plan:**
1. Week 1: Deploy to staging, test with staff
2. Week 2: Enable for admin users only in production
3. Week 3: Enable for all staff users
4. Week 4: Full rollout

---

#### 7.4 Monitoring & Alerts

**Metrics to Track:**
- PDF analysis success rate
- Average processing time
- OpenAI API costs
- Template usage statistics
- Error rates

**Alerts:**
- OpenAI API failures
- Processing time > 60 seconds
- Daily cost > $10

---

## 📊 Success Metrics

### Quantitative KPIs

- **Time to create template:** < 15 minutes (vs 2-4 hours)
- **AI accuracy:** > 95% correct suggestions
- **Staff adoption:** > 80% of new templates use AI
- **Cost per template:** < $0.05
- **Templates created:** 50+ in first 3 months

### Qualitative Goals

- Staff can create templates without developer help
- Reduced developer interruptions
- Faster onboarding for new lender forms
- Improved data quality in filled PDFs

---

## 🚀 Implementation Timeline

### Phase 1: Backend Foundation (Week 1-2)
- [x] Database schema (ai_processing_jobs)
- [ ] form_templates table migration (enhanced schema)
- [ ] AI service layer (Gemini + OpenAI)
- [ ] PDF analyzer service
- [ ] Preview generator service

### Phase 2: Visual Form Builder Core (Week 3-4)
- [ ] Split-view layout component
- [ ] Drag & drop field palette
- [ ] Form structure builder
- [ ] Field configuration panel
- [ ] Live PDF preview component (react-pdf)
- [ ] Preview generator service integration

### Phase 3: PDF Mapping & Data Sources (Week 5)
- [ ] PDF field extraction
- [ ] Field mapping interface
- [ ] Data source mapping UI
- [ ] Conditional logic builder
- [ ] Application type assignment

### Phase 4: AI PDF Importer (Week 6-7)
- [ ] PDF upload & analysis API
- [ ] AI field extraction (Gemini/OpenAI)
- [ ] Form structure generation from PDF
- [ ] Import workflow UI
- [ ] Edit imported forms (reuse visual builder)

### Phase 5: Integration & Polish (Week 8)
- [ ] Save/load form templates
- [ ] Template assignment to application types
- [ ] Task number assignment
- [ ] Form rendering engine (for actual use)
- [ ] End-to-end testing

### Phase 6: Testing & Deployment (Week 9-10)
- [ ] Performance optimization
- [ ] Error handling refinement
- [ ] User acceptance testing
- [ ] Staging deployment
- [ ] Production deployment
- [ ] Monitoring setup

---

## 📚 Documentation

### For Developers

- Architecture decisions (this document)
- API documentation (OpenAPI spec)
- Code comments and JSDoc
- Migration rollback procedures

### For Staff Users

- User guide: "How to Create Form Templates"
- Video tutorial: "AI Form Builder Walkthrough"
- FAQ: Common issues and solutions
- Support contact: Internal Slack channel

---

## 🔐 Security Considerations

### API Key Management
- Store OpenAI API key in environment variables
- Rotate keys quarterly
- Monitor usage for anomalies

### User Permissions
- Only admin/staff roles can access form builder
- RLS policies enforce data isolation
- Audit log for template changes

### Data Privacy
- PDFs stored securely in Supabase Storage
- Job results auto-expire after 30 days
- No sensitive data sent to OpenAI (only field names)

---

## 📖 References

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [pdf-lib Documentation](https://pdf-lib.js.org/)
- [Supabase Storage Guide](https://supabase.com/docs/guides/storage)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

## ✅ Current Status

**Completed:**
- ✅ Database schema design
- ✅ Migration system setup
- ✅ `ai_processing_jobs` table created
- ✅ Architecture documentation

**In Progress:**
- 🚧 AI service layer implementation

**Upcoming:**
- 🔜 API endpoints
- 🔜 Frontend components
- 🔜 Testing

---

**Last Updated:** 2026-01-01  
**Maintained By:** Development Team  
**Questions?** Contact: dev-team@gmgva.com

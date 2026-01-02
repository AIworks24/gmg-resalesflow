# 📦 Form Builder - Package Installation Guide

## ✅ Already Installed

Your `package.json` already has:
- ✅ `pdf-lib` (^1.17.1) - PDF manipulation
- ✅ `@react-pdf/renderer` (^4.3.1) - PDF generation
- ✅ `pdfjs-dist` (^5.3.31) - PDF.js library

## 🆕 Packages to Install

### Required Packages

```bash
npm install @google/generative-ai openai react-pdf
```

**What each package does:**

1. **@google/generative-ai**
   - Google Gemini API client
   - FREE tier: 60 requests/minute
   - Used for: AI-powered PDF field extraction
   - Get API key: https://ai.google.dev/

2. **openai**
   - OpenAI API client (Optional but recommended)
   - Premium quality AI analysis
   - Used for: GPT-4 Vision fallback
   - Get API key: https://platform.openai.com/ ($5 free credits)

3. **react-pdf**
   - React component for viewing PDFs in browser
   - Different from `@react-pdf/renderer` (which generates PDFs)
   - Used for: Live PDF preview in split-view
   - Requires: PDF.js worker setup

### Optional: Enhanced Drag & Drop

```bash
npm install react-dnd react-dnd-html5-backend
```

**Note:** You can use native HTML5 drag & drop instead (no extra package needed)

## 📋 Complete Installation

Run this single command:

```bash
npm install @google/generative-ai openai react-pdf
```

## 🔍 Check Latest Versions

Before installing, you can check latest versions:

```bash
npm view @google/generative-ai version
npm view openai version  
npm view react-pdf version
```

## ⚙️ After Installation

### 1. Set up PDF.js Worker (for react-pdf)

Add this to your component that uses react-pdf:

```javascript
import { pdfjs } from 'react-pdf';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}
```

### 2. Add Environment Variables

Add to `.env.local`:

```bash
# Google Gemini (FREE - Required)
GOOGLE_API_KEY=AIza...

# OpenAI (Optional - Premium)
OPENAI_API_KEY=sk-...

# AI Provider Selection
AI_PROVIDER=gemini  # Options: 'gemini', 'openai', or 'auto'
ENABLE_AI_FALLBACK=true
```

### 3. Get API Keys

**Google Gemini (FREE):**
1. Visit: https://ai.google.dev/
2. Click "Get API Key"
3. Sign in with Google
4. Create new project → Generate API key
5. Copy key (starts with `AIza...`)

**OpenAI (Optional):**
1. Visit: https://platform.openai.com/signup
2. Create account (get $5 free credits)
3. Go to: https://platform.openai.com/api-keys
4. Create new secret key
5. Copy key (starts with `sk-...`)

## 📊 Package Comparison

| Package | Purpose | Status | Cost |
|---------|---------|--------|------|
| `@google/generative-ai` | AI PDF analysis | **Required** | FREE |
| `openai` | AI PDF analysis (premium) | Optional | ~$0.02/analysis |
| `react-pdf` | PDF viewer in browser | **Required** | FREE |
| `pdf-lib` | PDF manipulation | Already installed ✅ | FREE |
| `@react-pdf/renderer` | PDF generation | Already installed ✅ | FREE |

## 🚀 Quick Start

1. **Install packages:**
   ```bash
   npm install @google/generative-ai openai react-pdf
   ```

2. **Get Gemini API key** (FREE): https://ai.google.dev/

3. **Add to `.env.local`:**
   ```bash
   GOOGLE_API_KEY=AIza...
   AI_PROVIDER=gemini
   ```

4. **Start building!** 🎉

## 📚 Documentation Links

- **@google/generative-ai**: https://ai.google.dev/docs
- **openai**: https://platform.openai.com/docs
- **react-pdf**: https://react-pdf.org/
- **pdf-lib**: https://pdf-lib.js.org/


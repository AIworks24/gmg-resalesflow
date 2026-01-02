# Form Builder - Required NPM Packages

## 📦 Packages to Install

### AI Integration (Required)
```bash
npm install @google/generative-ai openai
```

**Packages:**
- **@google/generative-ai** - Google Gemini API client (FREE tier available)
  - Latest version: Check with `npm view @google/generative-ai version`
  - Purpose: AI-powered PDF field extraction and analysis
  
- **openai** - OpenAI API client (Optional, Premium)
  - Latest version: Check with `npm view openai version`
  - Purpose: GPT-4 Vision for high-quality PDF analysis (fallback option)

### PDF Viewing (Required for Live Preview)
```bash
npm install react-pdf
```

**Package:**
- **react-pdf** - React component for viewing PDFs in browser
  - Latest version: Check with `npm view react-pdf version`
  - Purpose: Live PDF preview in split-view interface
  - Note: Different from `@react-pdf/renderer` (already installed for PDF generation)

### Already Installed ✅
These packages are already in your `package.json`:
- **pdf-lib** (^1.17.1) - PDF manipulation and filling
- **@react-pdf/renderer** (^4.3.1) - PDF generation from React components
- **pdfjs-dist** (^5.3.31) - PDF.js library (may be used by react-pdf)

### Optional Enhancements
```bash
npm install react-dnd react-dnd-html5-backend
```

**Packages:**
- **react-dnd** - Drag and drop library for form builder
- **react-dnd-html5-backend** - HTML5 backend for react-dnd
  - Purpose: Enhanced drag & drop functionality for field palette

## 📋 Installation Command

Run this command to install all required packages:

```bash
npm install @google/generative-ai openai react-pdf
```

Or for development with drag & drop:

```bash
npm install @google/generative-ai openai react-pdf react-dnd react-dnd-html5-backend
```

## 🔍 Version Check

To check the latest versions before installing:

```bash
npm view @google/generative-ai version
npm view openai version
npm view react-pdf version
```

## 📝 Package Details

### @google/generative-ai
- **Repository**: https://github.com/google/generative-ai-nodejs
- **Documentation**: https://ai.google.dev/docs
- **Free Tier**: 60 requests/minute
- **Use Case**: Primary AI provider for PDF analysis

### openai
- **Repository**: https://github.com/openai/openai-node
- **Documentation**: https://platform.openai.com/docs
- **Free Credits**: $5 for new accounts
- **Use Case**: Premium fallback for complex PDF analysis

### react-pdf
- **Repository**: https://github.com/wojtekmaj/react-pdf
- **Documentation**: https://react-pdf.org/
- **Use Case**: Display PDF preview in browser
- **Note**: Requires PDF.js worker setup

## ⚙️ Configuration

After installation, you'll need to:

1. **Set up PDF.js worker** (for react-pdf):
   ```javascript
   import { pdfjs } from 'react-pdf';
   pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
   ```

2. **Environment variables** (add to `.env.local`):
   ```bash
   GOOGLE_API_KEY=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key  # Optional
   AI_PROVIDER=gemini  # or 'openai' or 'auto'
   ENABLE_AI_FALLBACK=true
   ```

## 🚀 Quick Start

1. Install packages:
   ```bash
   npm install @google/generative-ai openai react-pdf
   ```

2. Get API keys:
   - Google Gemini: https://ai.google.dev/ (FREE)
   - OpenAI: https://platform.openai.com/ (Optional, $5 free credits)

3. Add to `.env.local`:
   ```bash
   GOOGLE_API_KEY=AIza...
   AI_PROVIDER=gemini
   ```

4. Start building! 🎉


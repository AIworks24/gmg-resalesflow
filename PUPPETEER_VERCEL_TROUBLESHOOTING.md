# Puppeteer on Vercel - Troubleshooting Guide

## Current Issue
Error: `Failed to launch the browser process: libnss3.so: cannot open shared object file`

## What We've Tried

### Code Changes
- ✅ Switched from `puppeteer` to `puppeteer-core`
- ✅ Added `@sparticuz/chromium` package
- ✅ Tried multiple versions: 131.0.0, 119.0.2, 115.0.0, 110.0.0
- ✅ Used exact Vercel-compatible configuration pattern
- ✅ Added `experimental.serverComponentsExternalPackages` in next.config.js
- ✅ Added Node.js engine specification in package.json

### Current Configuration
- **Package**: `@sparticuz/chromium@^110.0.0`
- **Puppeteer**: `puppeteer-core@^24.29.1`
- **Configuration**: Using `chromium.args`, `chromium.defaultViewport`, `chromium.headless`

## Critical: Vercel Dashboard Settings

### 1. Node.js Version (MOST IMPORTANT)
**Location**: Project Settings → General → Node.js Version

**Action Required**:
- Set to **18.x** (NOT 20.x or 22.x)
- This is the #1 cause of this error
- The `engines` field in package.json is not enough - you MUST set it in Vercel dashboard

### 2. Environment Variables
**Location**: Project Settings → Environment Variables

**Add these variables**:
- `AWS_LAMBDA_JS_RUNTIME` = `nodejs18.x`
- Apply to: Production, Preview, and Development

### 3. Verify Function Settings
**Location**: Project Settings → Functions

- Ensure `generate-settlement-pdf.js` has `maxDuration: 60`
- Check that no other settings are overriding the runtime

## Alternative Solutions

If the error persists after checking all Vercel settings:

### Option 1: Use External PDF Service
- Use a service like PDF.co, Browserless, or similar
- Offload PDF generation to a dedicated service
- More reliable but adds external dependency

### Option 2: Use Different PDF Library
- Consider using `pdf-lib` for simpler PDFs (already in dependencies)
- Or use `jsPDF` for client-side generation
- May require restructuring HTML-to-PDF approach

### Option 3: Contact Vercel Support
- This might be a Vercel platform issue
- They may have specific guidance for your account/region

## Next Steps

1. **Verify Vercel Dashboard Settings** (Critical):
   - [ ] Node.js version set to 18.x
   - [ ] `AWS_LAMBDA_JS_RUNTIME` environment variable added
   - [ ] Settings saved and redeployed

2. **If Still Failing**:
   - Consider using an external PDF generation service
   - Or restructure to use `pdf-lib` for simpler PDFs
   - Contact Vercel support with error details

## References
- [Vercel Puppeteer Guide](https://vercel.com/guides/deploying-puppeteer-with-nextjs-on-vercel)
- [Stack Overflow Discussion](https://stackoverflow.com/questions/66214552/tmp-chromium-error-while-loading-shared-libraries-libnss3-so-cannot-open-sha)
- [Vercel Community Discussion](https://community.vercel.com/t/puppeteer-errors-when-fluid-compute-is-enabled/6037)


# Email Assets Upload Scripts

## Card Icons Upload Script

This script extracts SVG icons from the `react-svg-credit-card-payment-icons` package, converts them to optimized PNG images, and uploads them to Supabase storage for use in email templates.

## Why This Matters

According to [Litmus's guide on Gmail clipping](https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails), Gmail clips emails that exceed 102KB in HTML size. By hosting card icons externally instead of embedding them, we:

1. **Reduce email HTML size** - Icons are loaded from external URLs, not embedded
2. **Prevent Gmail clipping** - Keep emails under the 102KB threshold
3. **Improve email performance** - Smaller HTML means faster rendering
4. **Better compatibility** - PNG images work across all email clients

## Prerequisites

1. Install required dependencies:
   ```bash
   npm install --save-dev sharp
   ```

2. Set environment variables in your `.env.local`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## Usage

Run the script:
```bash
node scripts/upload-card-icons.js
```

The script will:
1. Extract SVG icons from `react-svg-credit-card-payment-icons` package
2. Convert them to optimized PNG images (120x80px, compressed)
3. Upload them to Supabase storage at `bucket0/assets/card-icons/`
4. Display a summary with public URLs

## Supported Card Brands

- Visa
- Mastercard
- American Express (AMEX)
- Discover
- Diners Club
- JCB

## Output

Icons are uploaded to:
```
{bucket0}/assets/card-icons/{brand-name}.png
```

Public URLs follow the pattern:
```
{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/bucket0/assets/card-icons/{brand-name}.png
```

## Email Integration

The `emailService.js` file has been updated to automatically use these hosted icons. The `getCardBrandDisplay()` function will:

1. First try to load the hosted PNG icon from Supabase
2. Fall back to a styled text badge if the icon is not available

This ensures emails always display something, even if icons haven't been uploaded yet.

## Company Logo Upload Script

The `upload-email-assets.js` script optimizes and uploads company logos to Supabase storage.

### Usage

```bash
node scripts/upload-email-assets.js
```

The script will:
1. Find logo files in `assets/` or `public/` directories
2. Optimize and compress them for email (max 200px width)
3. Upload them to Supabase storage at `bucket0/assets/`
4. Display optimization statistics

### What Gets Optimized

- **Company Logo (White)**: `company_logo_white.png`
  - Optimized for email headers
  - Max width: 200px (maintains aspect ratio)
  - PNG compression level 9
  - Palette optimization for smaller file size

## Troubleshooting

### Error: sharp is not installed
```bash
npm install --save-dev sharp
```

### Error: Missing environment variables
Make sure `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in your `.env.local` file.

### Error: Could not extract SVG
The script may need updates if the `react-svg-credit-card-payment-icons` package structure changes. Check the component files in `node_modules/react-svg-credit-card-payment-icons/dist/`.

### Icons not showing in emails
1. Verify icons were uploaded successfully (check Supabase storage)
2. Ensure `NEXT_PUBLIC_SUPABASE_URL` is set correctly in your production environment
3. Check that the storage bucket is public and accessible

## File Sizes

The script optimizes PNG images for email:
- **Dimensions**: 120x80px (maintains aspect ratio)
- **Format**: PNG with palette optimization
- **Compression**: Level 9 (maximum)
- **Expected size**: ~2-5 KB per icon

Total size for all 6 icons: ~15-30 KB (hosted externally, not counted in email HTML size)


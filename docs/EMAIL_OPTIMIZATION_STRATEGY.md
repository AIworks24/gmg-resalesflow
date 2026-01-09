# Email Optimization Strategy

## Overview

Our email system uses multiple strategies to keep email HTML size under Gmail's 102KB clipping threshold, as outlined in [Litmus's guide on Gmail clipping](https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails).

## Current Strategy

### 1. **External Asset Hosting** ✅
- **Images hosted on Supabase storage** instead of base64 embedding
- Logo: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/bucket0/assets/company_logo_white.png`
- Card icons: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/bucket0/assets/card-icons/{brand}.png`
- **Benefit**: Images don't count toward the 102KB HTML size limit

### 2. **HTML Minification** ✅ (NEW)
- Custom minifier (`lib/emailMinifier.js`) that:
  - Removes unnecessary whitespace and line breaks
  - Removes HTML comments (except Outlook conditional comments)
  - Preserves inline styles (required for email clients)
  - Optimizes CSS in style attributes
- **Applied to**: Invoice receipt emails (can be extended to all emails)
- **Benefit**: Reduces HTML size by 20-40% typically

### 3. **Compact Templates** (Partial)
- Some emails (confirmation, password reset) use compact single-line HTML
- Other emails (invoice receipt) use formatted HTML (now minified)
- **Status**: Inconsistent - should standardize

### 4. **Size Monitoring** ✅ (NEW)
- Logs email HTML size before sending
- Warns if approaching 100KB threshold
- Helps identify emails that need optimization

## Email Size Breakdown

According to Gmail's rules:
- **102KB limit**: HTML code size only (not including images)
- **Images**: Loaded externally, don't count toward limit
- **Clipping**: Happens wherever the limit is reached, can break layouts

## Implementation Details

### Minification Process

```javascript
// Before minification: ~15-20KB (formatted HTML)
// After minification: ~10-15KB (compressed HTML)
const minifiedHtml = minifyEmailHtml(html);
const htmlSize = getEmailSize(minifiedHtml);
```

### What Gets Minified

✅ **Removed:**
- HTML comments (except `<!--[if mso]>...<![endif]-->`)
- Unnecessary whitespace between tags
- Multiple spaces
- Spaces around equals signs in attributes

✅ **Preserved:**
- Conditional comments for Outlook/MSO
- Inline styles (required for email clients)
- Spaces in CSS values (e.g., "Arial, sans-serif")
- All HTML structure and content

### Example

**Before:**
```html
<div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
  <strong style="color: #374151;">Receipt Number:</strong>
</div>
```

**After:**
```html
<div style="padding:12px 0;border-bottom:1px solid #e5e7eb;"><strong style="color:#374151;">Receipt Number:</strong></div>
```

## Recommendations

### ✅ Already Implemented
1. External image hosting
2. HTML minification for invoice receipts
3. Size monitoring and warnings

### 🔄 Should Be Done
1. **Apply minification to ALL emails** (not just invoice receipts)
2. **Remove unnecessary HTML comments** from templates
3. **Audit email templates** for deprecated code fixes
4. **Review table structures** - remove unnecessary nesting
5. **Check ESP markup injection** - some providers add extra markup

### 📊 Monitoring

Check logs for:
```
[EmailService] Invoice receipt email size: 12.5KB
[EmailService] Invoice receipt email size is 105KB, approaching Gmail's 102KB clipping threshold
```

## Best Practices

1. **Always host images externally** - Never use base64 embedding
2. **Minify all email HTML** - Use the minifier for every email
3. **Monitor email sizes** - Log sizes and set up alerts
4. **Test in Gmail** - Verify emails don't get clipped
5. **Keep templates lean** - Only include necessary markup
6. **Use external CSS sparingly** - Inline styles are more reliable

## File Locations

- **Minifier**: `lib/emailMinifier.js`
- **Email Service**: `lib/emailService.js`
- **Card Icons Upload Script**: `scripts/upload-card-icons.js`
- **Documentation**: `scripts/README-card-icons.md`

## References

- [Litmus: How to Keep Gmail from Clipping Your Emails](https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails)
- Gmail clipping threshold: **102KB** (HTML code only, not images)


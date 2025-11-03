# Microsoft Account MFA Fix Guide

## Problem
When MFA (Multi-Factor Authentication) is enabled on a Microsoft account (Outlook/Office 365), regular passwords don't work for SMTP authentication. This breaks email sending in the application.

## Solution Options

### Option 1: Use App Password (RECOMMENDED - Keeps MFA Enabled)

This is the recommended approach because it maintains security while allowing SMTP access.

**Steps for Microsoft Account:**

1. Go to your Microsoft Account Security: https://account.microsoft.com/security
2. Sign in with your Microsoft account
3. Navigate to **Security** section
4. Under "Advanced security options", look for **App passwords** (or click **Additional security options**)
5. You may need to verify your identity
6. Click on **Create a new app password**
7. Enter a name like "ResaleFlow Application" or "GMG Resales"
8. Click **Next** or **Generate**
9. Microsoft will show you a password (like: `abcd-efgh-ijkl-mnop`)
10. **Copy this password immediately** - you won't be able to see it again!

**Update Environment Variables:**

Update your environment variables (in Vercel, .env.local, or wherever you store them):
- Set `SMTP_HOST` to Microsoft's SMTP server
- Set `SMTP_PASS` to the generated App Password
- Set `SMTP_USER` to your full Microsoft email address

**Environment Variables to Set:**
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com  (or @hotmail.com, @live.com, or your Office 365 domain)
SMTP_PASS=abcd-efgh-ijkl-mnop  (your App Password from Microsoft)
```

**Note:** If you're using a custom Office 365 domain, the SMTP host is still `smtp.office365.com`.

### Option 2: Turn Off MFA (NOT RECOMMENDED)

If you choose to turn off MFA for simplicity (less secure):

**Steps for Microsoft Account:**

1. Go to your Microsoft Account Security: https://account.microsoft.com/security
2. Sign in with your Microsoft account
3. Navigate to **Security** section
4. Find **Advanced security options** or **Two-step verification**
5. Turn OFF **Two-step verification** or **Multi-factor authentication**
6. Confirm the action

**After turning off MFA:**
- You can use your regular Microsoft account password in the `SMTP_PASS` environment variable
- Make sure to set `SMTP_HOST=smtp.office365.com` (or `smtp-mail.outlook.com`)
- Your account will be less secure

**⚠️ WARNING:** Turning off MFA reduces your account security. App Passwords are designed specifically for this use case and are more secure.

---

## Verification

After updating your environment variables:

1. Restart your application (if running locally)
2. Try sending a test email through your application
3. Check application logs for any authentication errors

## Troubleshooting

If emails still don't work after updating:

1. **Check environment variables are set correctly:**
   - Ensure no extra spaces in the App Password
   - Ensure email address is complete (with @outlook.com, @hotmail.com, etc.)
   - Verify `SMTP_HOST=smtp.office365.com` is set
   
2. **Verify SMTP settings:**
   - SMTP Host: `smtp.office365.com` (for Office 365/Outlook)
   - SMTP Port: `587` (with TLS/STARTTLS)
   - Alternative: `smtp-mail.outlook.com` (for personal Outlook accounts)

3. **Check Microsoft Account security alerts:**
   - Microsoft may send you a security alert - verify it's from your application
   - Check for any blocks in the Security dashboard

4. **Test SMTP connection:**
   - Try sending a test email manually to verify credentials work
   - Check for firewall/proxy issues blocking port 587

5. **For Office 365 Business/Enterprise:**
   - Contact your IT admin - they may need to enable SMTP AUTH in Exchange Online
   - Some organizations disable SMTP AUTH for security reasons

## Additional Notes

- App Passwords are account-specific and can be revoked at any time
- Each App Password can only be used by one application
- If you regenerate the App Password, you'll need to update your environment variables
- For Office 365 business accounts, SMTP AUTH may need to be enabled by an admin
- For production, consider implementing Microsoft Graph API or using a dedicated email service (SendGrid, Mailgun, etc.)

## Quick Configuration Summary

**For Microsoft Accounts with MFA (Recommended):**
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-app-password-from-microsoft
```

**For Microsoft Accounts without MFA:**
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-regular-password
```


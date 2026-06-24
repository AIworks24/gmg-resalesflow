import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

const ALERT_RECIPIENTS = [
  'matt@aiworks-consulting.com',
  'ianrizhmanago@gmail.com',
];

export const config = {
  schedule: '0 11 * * *', // 6am EST (11am UTC)
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Find applications where payment completed but status never advanced
    // Only check the last 30 days to avoid flagging old known exceptions
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: stuckApps, error } = await supabase
      .from('applications')
      .select('id, property_address, submitter_name, submitter_email, total_amount, payment_completed_at, application_type, package_type')
      .eq('payment_status', 'completed')
      .eq('status', 'pending_payment')
      .is('deleted_at', null)
      .gte('payment_completed_at', thirtyDaysAgo)
      .order('payment_completed_at', { ascending: true });

    if (error) {
      console.error('[StuckCheck] Supabase query failed:', error);
      return res.status(500).json({ error: 'Database query failed' });
    }

    console.log(`[StuckCheck] Found ${stuckApps?.length || 0} stuck application(s)`);

    if (!stuckApps || stuckApps.length === 0) {
      return res.status(200).json({ ok: true, stuckCount: 0, message: 'No stuck applications found' });
    }

    // Build alert email
    const rows = stuckApps.map(app => {
      const paidAt = app.payment_completed_at
        ? new Date(app.payment_completed_at).toLocaleString('en-US', { timeZone: 'America/New_York' })
        : 'Unknown';
      const amount = app.total_amount != null ? `$${parseFloat(app.total_amount).toFixed(2)}` : 'N/A';
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">#${app.id}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${app.property_address || '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${app.submitter_name || '—'}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${amount}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${paidAt} ET</td>
        </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:#b91c1c;padding:24px 28px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">⚠️ Stuck Applications Detected</h1>
      <p style="margin:8px 0 0;color:#fecaca;font-size:14px;">
        ${stuckApps.length} application${stuckApps.length > 1 ? 's have' : ' has'} a completed payment but ${stuckApps.length > 1 ? 'are' : 'is'} not showing in the dashboard.
      </p>
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600;">App #</th>
            <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600;">Property</th>
            <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600;">Submitter</th>
            <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600;">Amount</th>
            <th style="padding:8px 12px;text-align:left;color:#374151;font-weight:600;">Payment Time</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;padding:16px;background:#fef3c7;border-radius:6px;border-left:4px solid #f59e0b;">
        <p style="margin:0;font-size:13px;color:#92400e;">
          These applications are paid but stuck in <strong>pending_payment</strong> status. They need to be manually advanced to <strong>under_review</strong> and have their property owner forms created.
        </p>
      </div>
    </div>
    <div style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
      Sent automatically by ResalesFlow · Runs daily at 6am EST
    </div>
  </div>
</body>
</html>`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || process.env.GMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD,
      },
      tls: {
        ciphers: process.env.CIPHERS || 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    await transporter.sendMail({
      from: `"ResalesFlow Alerts" <${process.env.MICROSOFT_FROM_EMAIL || process.env.GMAIL_USER}>`,
      to: ALERT_RECIPIENTS.join(', '),
      subject: `⚠️ ${stuckApps.length} Stuck Application${stuckApps.length > 1 ? 's' : ''} — Action Required`,
      html,
    });

    console.log(`[StuckCheck] Alert sent for ${stuckApps.length} stuck application(s) to ${ALERT_RECIPIENTS.join(', ')}`);

    return res.status(200).json({
      ok: true,
      stuckCount: stuckApps.length,
      alertSentTo: ALERT_RECIPIENTS,
      appIds: stuckApps.map(a => a.id),
    });
  } catch (err) {
    console.error('[StuckCheck] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

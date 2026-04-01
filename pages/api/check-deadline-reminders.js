import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../lib/emailService';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Returns the calendar date string (YYYY-MM-DD) for a Date in Eastern time
function getEasternDateStr(date) {
  const eastern = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, '0');
  const d = String(eastern.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Business days deadline (Rush: 5 business days) — day-of-week evaluated in Eastern time
function calculateBusinessDaysDeadline(startDate, businessDays) {
  const date = new Date(startDate);
  let daysAdded = 0;
  while (daysAdded < businessDays) {
    date.setDate(date.getDate() + 1);
    const dayInEastern = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
    if (dayInEastern !== 0 && dayInEastern !== 6) {
      daysAdded++;
    }
  }
  return date;
}

// Calendar days deadline (Standard: 15 calendar days)
function calculateCalendarDaysDeadline(startDate, calendarDays) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + calendarDays);
  return date;
}

function isFakeEmail(email) {
  if (!email || typeof email !== 'string') return true;
  const normalized = email.toLowerCase().trim();
  const fakePatterns = [
    /^test@/i, /@example\./i, /@test\./i, /@placeholder\./i, /@dummy\./i,
    /^noreply@/i, /^no-reply@/i, /^fake@/i, /^placeholder@/i, /^dummy@/i,
    /^temp@/i, /^temporary@/i, /@localhost/i, /@test\.com$/i,
    /@example\.com$/i, /@example\.org$/i, /@example\.net$/i,
  ];
  return fakePatterns.some(pattern => pattern.test(normalized)) ||
         normalized.length < 5 || !normalized.includes('@') || !normalized.includes('.');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization
  const authHeader = req.headers['authorization'];
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Fetch all non-rejected applications with an assignee, including data needed for completion checks
    const { data: applications, error } = await supabase
      .from('applications')
      .select(`
        id,
        submitted_at,
        created_at,
        package_type,
        application_type,
        submitter_type,
        property_address,
        assigned_to,
        email_completed_at,
        pdf_url,
        pdf_completed_at,
        inspection_form_completed_at,
        resale_certificate_completed_at,
        settlement_form_completed_at,
        lender_questionnaire_file_path,
        lender_questionnaire_completed_file_path,
        status,
        hoa_properties(name),
        notifications(notification_type),
        property_owner_forms(id, form_type, status, property_group_id),
        application_property_groups(
          id,
          status,
          inspection_status,
          pdf_status,
          pdf_url,
          email_status,
          email_completed_at
        )
      `)
      .eq('status', 'under_review')
      .not('assigned_to', 'is', null);

    if (error) throw error;

    if (!applications || applications.length === 0) {
      return res.status(200).json({ success: true, message: 'No applications to check.', emails_sent: 0 });
    }

    // Mirror completion logic from admin/applications.js
    const isMultiCommunityCompleted = (app) => {
      const propertyGroups = app.application_property_groups || [];
      if (propertyGroups.length === 0) return false;
      const isSettlement = app.submitter_type === 'settlement' || app.application_type?.startsWith('settlement');
      let completedCount = 0;
      for (const group of propertyGroups) {
        let formsCompleted = false;
        if (isSettlement) {
          const form = app.property_owner_forms?.find(f => f.form_type === 'settlement_form' && f.property_group_id === group.id);
          formsCompleted = form?.status === 'completed';
        } else {
          formsCompleted = (group.inspection_status ?? 'not_started') === 'completed' && group.status === 'completed';
        }
        const pdfCompleted = group.pdf_status === 'completed' || !!group.pdf_url;
        const emailCompleted = group.email_status === 'completed' || !!group.email_completed_at;
        if (formsCompleted && pdfCompleted && emailCompleted) completedCount++;
      }
      return completedCount === propertyGroups.length;
    };

    const isRegularApplicationCompleted = (app) => {
      const isLender = app.application_type === 'lender_questionnaire';
      if (isLender) {
        const hasNotification = app.notifications?.some(n => n.notification_type === 'application_approved');
        return !!app.lender_questionnaire_file_path && !!app.lender_questionnaire_completed_file_path && (hasNotification || !!app.email_completed_at);
      }
      const isSettlement = app.submitter_type === 'settlement' || app.application_type?.startsWith('settlement');
      if (isSettlement) {
        const form = app.property_owner_forms?.find(f => f.form_type === 'settlement_form');
        const formDone = !!app.settlement_form_completed_at || form?.status === 'completed';
        const hasPdf = !!app.pdf_url || !!app.pdf_completed_at;
        const hasEmail = app.notifications?.some(n => n.notification_type === 'application_approved') || !!app.email_completed_at;
        return formDone && hasPdf && hasEmail;
      }
      const inspectionForm = app.property_owner_forms?.find(f => f.form_type === 'inspection_form');
      const resaleForm = app.property_owner_forms?.find(f => f.form_type === 'resale_certificate');
      const inspectionDone = inspectionForm?.status === 'completed' || !!app.inspection_form_completed_at;
      const resaleDone = resaleForm?.status === 'completed' || !!app.resale_certificate_completed_at;
      const hasPdf = !!app.pdf_url || !!app.pdf_completed_at;
      const hasEmail = app.notifications?.some(n => n.notification_type === 'application_approved') || !!app.email_completed_at;
      return inspectionDone && resaleDone && hasPdf && hasEmail;
    };

    const isCompleted = (app) => {
      const isMultiCommunity = (app.application_property_groups || []).length > 0;
      return isMultiCommunity ? isMultiCommunityCompleted(app) : isRegularApplicationCompleted(app);
    };

    // Exclude completed applications
    const pendingApplications = applications.filter(app => !isCompleted(app));

    const now = new Date();

    // "Tomorrow" window: deadline date (calendar date) equals tomorrow's date in Eastern time
    const nowEastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const tomorrowEastern = new Date(nowEastern);
    tomorrowEastern.setDate(tomorrowEastern.getDate() + 1);
    const tomorrowYear = tomorrowEastern.getFullYear();
    const tomorrowMonth = String(tomorrowEastern.getMonth() + 1).padStart(2, '0');
    const tomorrowDay = String(tomorrowEastern.getDate()).padStart(2, '0');
    const tomorrowDateStr = `${tomorrowYear}-${tomorrowMonth}-${tomorrowDay}`;

    // Collect application IDs approaching deadline tomorrow
    const approachingApps = pendingApplications.filter(app => {
      const submittedDate = new Date(app.submitted_at || app.created_at);
      const deadline = app.package_type === 'rush'
        ? calculateBusinessDaysDeadline(submittedDate, 5)
        : calculateCalendarDaysDeadline(submittedDate, 15);

      const deadlineDateStr = getEasternDateStr(deadline);
      return deadlineDateStr === tomorrowDateStr;
    });

    if (approachingApps.length === 0) {
      return res.status(200).json({ success: true, message: 'No deadlines approaching tomorrow.', emails_sent: 0 });
    }

    // Check which applications already had a deadline_reminder notification sent
    const appIds = approachingApps.map(a => a.id);
    const { data: existingReminders } = await supabase
      .from('notifications')
      .select('application_id')
      .in('application_id', appIds)
      .eq('notification_type', 'deadline_reminder');

    const alreadySentIds = new Set((existingReminders || []).map(n => n.application_id));

    // Filter out already-notified applications
    const toNotify = approachingApps.filter(app => !alreadySentIds.has(app.id));

    if (toNotify.length === 0) {
      return res.status(200).json({ success: true, message: 'All approaching deadlines already notified.', emails_sent: 0 });
    }

    let emailsSent = 0;
    const now_iso = new Date().toISOString();

    for (const app of toNotify) {
      const assigneeEmail = app.assigned_to?.toLowerCase().trim();
      if (!assigneeEmail || isFakeEmail(assigneeEmail)) continue;

      const submittedDate = new Date(app.submitted_at || app.created_at);
      const deadline = app.package_type === 'rush'
        ? calculateBusinessDaysDeadline(submittedDate, 5)
        : calculateCalendarDaysDeadline(submittedDate, 15);

      const deadlineFormatted = deadline.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const packageLabel = app.package_type === 'rush' ? 'Rush (5 business days)' : 'Standard (15 days)';
      const propertyName = app.hoa_properties?.name || 'N/A';
      const applicationUrl = `${baseUrl}/admin/login?applicationId=${app.id}`;

      const emailHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Deadline Tomorrow</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
          <div style="max-width: 620px; margin: 32px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.10);">

            <!-- Header -->
            <div style="background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); padding: 36px 32px; text-align: center;">
              <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 50%; width: 56px; height: 56px; line-height: 56px; font-size: 28px; margin-bottom: 16px;">⏰</div>
              <h1 style="margin: 0 0 8px; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.3px;">Deadline Tomorrow</h1>
              <p style="margin: 0; color: rgba(255,255,255,0.88); font-size: 15px;">Goodman Management Group · ResaleFlow</p>
            </div>

            <!-- Body -->
            <div style="padding: 32px;">
              <p style="margin: 0 0 20px; color: #374151; font-size: 16px; line-height: 1.6;">
                Dear Assignee,
              </p>
              <p style="margin: 0 0 24px; color: #374151; font-size: 16px; line-height: 1.6;">
                This is a reminder that the following application is <strong style="color: #c2410c;">due tomorrow</strong>. Please review and complete any outstanding steps before the deadline.
              </p>

              <!-- Application Details Card -->
              <div style="background-color: #fff7ed; border: 1px solid #fed7aa; border-radius: 10px; overflow: hidden; margin-bottom: 28px;">
                <div style="background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%); padding: 14px 20px; border-bottom: 1px solid #fed7aa;">
                  <p style="margin: 0; color: #9a3412; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Application Details</p>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #6b7280; font-size: 14px; font-weight: 600; width: 40%;">Application ID</td>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #111827; font-size: 14px; font-weight: 700;">#${app.id}</td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #6b7280; font-size: 14px; font-weight: 600;">Property</td>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #111827; font-size: 14px;">${propertyName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #6b7280; font-size: 14px; font-weight: 600;">Address</td>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #111827; font-size: 14px;">${app.property_address || 'N/A'}</td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #6b7280; font-size: 14px; font-weight: 600;">Processing Type</td>
                    <td style="padding: 14px 20px; border-bottom: 1px solid #fed7aa; color: #111827; font-size: 14px;">${packageLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 20px; color: #6b7280; font-size: 14px; font-weight: 600;">Deadline</td>
                    <td style="padding: 14px 20px; color: #c2410c; font-size: 14px; font-weight: 700;">${deadlineFormatted}</td>
                  </tr>
                </table>
              </div>

              <!-- Urgency Notice -->
              <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-left: 4px solid #dc2626; border-radius: 6px; padding: 16px 20px; margin-bottom: 28px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                  <strong style="font-size: 15px;">Action Required:</strong> This application must be completed by tomorrow. Please log in to the dashboard and finalize any pending steps.
                </p>
              </div>

              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 32px;">
                <a href="${applicationUrl}"
                   style="display: inline-block; background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%); color: #ffffff; text-decoration: none; padding: 15px 36px; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: 0.2px; box-shadow: 0 4px 12px rgba(194,65,12,0.35);">
                  View Application →
                </a>
              </div>

              <!-- Footer -->
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center;">
                This is an automated reminder from <strong>GMG ResaleFlow</strong>. You are receiving this because you are the assigned staff member for this application.<br/>
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #ea580c; text-decoration: none;">resales@gmgva.com</a>
              </p>
            </div>

          </div>
        </body>
        </html>
      `;

      try {
        await sendEmail({
          to: assigneeEmail,
          subject: `⏰ Deadline Tomorrow – Application #${app.id} | ${propertyName}`,
          html: emailHtml,
          context: 'DeadlineReminder',
        });

        // Record notification to prevent duplicate sends
        await supabase.from('notifications').insert({
          application_id: app.id,
          recipient_email: assigneeEmail,
          recipient_name: assigneeEmail,
          notification_type: 'deadline_reminder',
          subject: `Deadline Tomorrow – Application #${app.id}`,
          message: `Application #${app.id} for ${propertyName} (${app.property_address}) is due tomorrow (${deadlineFormatted}).`,
          status: 'unread',
          is_read: false,
          sent_at: now_iso,
          created_at: now_iso,
          metadata: {
            application_id: app.id,
            property_name: propertyName,
            property_address: app.property_address,
            deadline: deadline.toISOString(),
            package_type: app.package_type,
          },
        });

        emailsSent++;
        console.log(`✅ Deadline reminder sent to ${assigneeEmail} for application #${app.id}`);
      } catch (emailError) {
        console.error(`❌ Failed to send deadline reminder for application #${app.id}:`, emailError);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Checked ${approachingApps.length} application(s) with deadlines tomorrow. Sent ${emailsSent} reminder email(s).`,
      summary: {
        applications_approaching: approachingApps.length,
        already_notified: alreadySentIds.size,
        emails_sent: emailsSent,
      },
    });

  } catch (error) {
    console.error('Error checking deadline reminders:', error);
    return res.status(500).json({
      error: 'Failed to check deadline reminders',
      details: error.message,
    });
  }
}

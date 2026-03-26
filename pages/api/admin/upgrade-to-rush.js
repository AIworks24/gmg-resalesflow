import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getServerStripe } from '../../../lib/stripe';
import { sendEmail } from '../../../lib/emailService';

const CONVENIENCE_FEE_CENTS = 995; // $9.95 per property

// Count business days forward from a given date
function addBusinessDays(startDate, days) {
  const date = new Date(startDate);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const dow = date.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return date;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden - Admin role required' });
    }

    const {
      applicationId,
      waiveFee    = false, // true = upgrade immediately, no payment
      createInvoice = false, // true = create Stripe checkout and email customer
    } = req.body;

    if (!applicationId) {
      return res.status(400).json({ error: 'applicationId is required' });
    }

    // Fetch application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, application_type, package_type, payment_method, rush_fee, submitted_at, submitter_email, submitter_name, property_address, notes, is_test_transaction, stripe_session_id, correction_stripe_session_id, status')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Guard: must be standard to upgrade
    if (application.package_type !== 'standard') {
      return res.status(400).json({ error: 'Application is already on rush processing' });
    }

    // Guard: prevent double-invoicing
    if (createInvoice && application.correction_stripe_session_id) {
      return res.status(409).json({ error: 'A correction payment is already pending for this application' });
    }

    // Fetch property groups to get count
    const { data: groups } = await supabase
      .from('application_property_groups')
      .select('id')
      .eq('application_id', applicationId);

    const propCount          = (groups || []).length || 1;
    const rushFeePerProp     = Math.round((application.rush_fee || 0) * 100); // stored in dollars → cents
    const isCreditCard       = application.payment_method === 'credit_card';
    const convFeePerProp     = isCreditCard ? CONVENIENCE_FEE_CENTS : 0;
    const totalFeeCents      = (rushFeePerProp + convFeePerProp) * propCount;
    const totalFeeDisplay    = (totalFeeCents / 100).toFixed(2);

    // New deadline: 5 business days from submitted_at
    const newDeadline        = addBusinessDays(application.submitted_at, 5);
    const newDeadlineDate    = newDeadline.toISOString().split('T')[0];

    // Audit info
    const adminName          = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin';

    // ── WAIVE: upgrade immediately, no payment ────────────────────────────────
    if (waiveFee) {
      const auditNote = `[${new Date().toISOString()}] Package upgraded to rush by ${adminName}. Rush fee ($${totalFeeDisplay}) waived. New deadline: ${newDeadlineDate}.`;

      const { error: updateError } = await supabase
        .from('applications')
        .update({
          package_type:             'rush',
          rush_upgraded_at:         new Date().toISOString(),
          expected_completion_date: newDeadlineDate,
          notes: application.notes
            ? `${application.notes}\n\n${auditNote}`
            : auditNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to upgrade application' });
      }

      return res.status(200).json({
        success:          true,
        waived:           true,
        newDeadlineDate,
        totalFeeDisplay,
      });
    }

    // ── CREATE INVOICE: Stripe checkout + email ───────────────────────────────
    if (!createInvoice) {
      return res.status(400).json({ error: 'Either waiveFee or createInvoice must be true' });
    }

    // Build Stripe line items — one rush fee entry per property, optional conv fee
    const lineItems = [];
    for (let i = 0; i < propCount; i++) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Rush Processing Upgrade',
            description: `Expedited processing (5 business days) — ${application.property_address || 'Application #' + applicationId}`,
          },
          unit_amount: rushFeePerProp,
        },
        quantity: 1,
      });
      if (isCreditCard) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Credit Card Convenience Fee',
              description: 'Non-refundable convenience fee',
            },
            unit_amount: CONVENIENCE_FEE_CENTS,
          },
          quantity: 1,
        });
      }
    }

    let invoiceUrl   = null;
    let invoiceError = null;

    try {
      const isTestTransaction = !!application.is_test_transaction
        || (application.stripe_session_id || '').startsWith('cs_test_');
      const stripe  = getServerStripe(req, { forceTestMode: isTestTransaction });
      const session = await stripe.checkout.sessions.create({
        mode:                 'payment',
        payment_method_types: ['card'],
        line_items:           lineItems,
        success_url:          `${process.env.NEXT_PUBLIC_SITE_URL}/payment/correction-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:           `${process.env.NEXT_PUBLIC_SITE_URL}/payment/cancel`,
        customer_email:       application.submitter_email,
        metadata: {
          applicationId: String(applicationId),
          correctionType: 'rush_upgrade',
        },
      });

      invoiceUrl = session.url;

      // Store session ID on application so webhook can find it.
      // Note: we do NOT set processing_locked for rush upgrades — tasks can
      // still be processed while the customer pays. The webhook will apply
      // the deadline change and package_type update on payment.
      const auditNote = `[${new Date().toISOString()}] Rush upgrade invoice ($${totalFeeDisplay}) created and emailed to ${application.submitter_email} by ${adminName}. Pending customer payment. New deadline on payment: ${newDeadlineDate}.`;

      await supabase
        .from('applications')
        .update({
          correction_stripe_session_id: session.id,
          notes: application.notes
            ? `${application.notes}\n\n${auditNote}`
            : auditNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', applicationId);

    } catch (stripeErr) {
      console.error('upgrade-to-rush: Stripe session creation failed:', stripeErr);
      invoiceError = 'Failed to create Stripe checkout session';
    }

    // Send invoice email to customer
    if (invoiceUrl) {
      try {
        const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
        const logoUrl      = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
        const brandColor   = '#0f4734';
        const customerName = application.submitter_name || 'Valued Customer';

        const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Rush Processing Upgrade — Additional Payment Required</title>
  <!--[if mso]>
  <style type="text/css">body, table, td {font-family: Arial, sans-serif !important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;max-width:140px;display:block;border:0;" />
      </div>
      <div style="text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Rush Upgrade Payment Required</h1>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:30px 20px;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;font-size:16px;color:#333333;">Dear ${customerName},</p>
      <p style="margin:0 0 24px 0;font-size:16px;color:#666666;">
        Your resale certificate application has been upgraded to <strong>Rush Processing</strong>.
        An additional payment is required to confirm the expedited timeline.
      </p>

      <!-- Payment Due Card -->
      <div style="background-color:#fff8ed;border:1px solid #fed7aa;border-radius:8px;padding:24px;margin:0 0 24px 0;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;">Amount Due</p>
        <p style="margin:0 0 16px 0;font-size:40px;font-weight:700;color:#78350f;">$${totalFeeDisplay}</p>
        ${isCreditCard ? '<p style="margin:0 0 4px 0;font-size:13px;color:#92400e;">Includes credit card convenience fee</p>' : ''}
        <div style="margin-top:16px;">
          <a href="${invoiceUrl}" style="display:inline-block;padding:14px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Pay Now</a>
        </div>
        <p style="margin:12px 0 0 0;font-size:12px;color:#b45309;">&#128274; Secure payment powered by <strong>Stripe</strong></p>
      </div>

      <!-- Application Details -->
      <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:${brandColor};">Application Details</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><strong style="color:#374151;">Application ID:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">#${applicationId}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><strong style="color:#374151;">Property Address:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${application.property_address || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><strong style="color:#374151;">Previous Processing:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">Standard (15 calendar days)</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;"><strong style="color:#374151;">New Processing:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#92400e;text-align:right;font-weight:600;">Rush (5 business days)</td>
          </tr>
          <tr>
            <td style="padding:12px 0;font-size:14px;"><strong style="color:#374151;">New Completion Target:</strong></td>
            <td style="padding:12px 0;font-size:14px;color:#111827;text-align:right;font-weight:600;">${newDeadlineDate}</td>
          </tr>
        </table>
      </div>

      <!-- What Happens Next -->
      <div style="background-color:#f0f9ff;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #bae6fd;">
        <h3 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:${brandColor};">What Happens Next?</h3>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          ${[
            'Complete your payment using the secure link above.',
            'Your application will be immediately upgraded to Rush processing.',
            'Your new target completion date will be updated to reflect the expedited timeline.',
            'You will receive email updates as your documents are completed.',
          ].map((step, i) => `
          <tr>
            <td style="padding:0 0 12px 0;vertical-align:top;width:40px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="width:24px;height:24px;background-color:${brandColor};border-radius:50%;text-align:center;vertical-align:middle;padding:0;">
                    <span style="color:#ffffff;font-size:12px;font-weight:700;line-height:24px;display:block;">${i + 1}</span>
                  </td>
                </tr>
              </table>
            </td>
            <td style="padding:0 0 12px 12px;font-size:15px;color:#1e293b;line-height:1.6;vertical-align:top;">${step}</td>
          </tr>`).join('')}
        </table>
      </div>

      <!-- Note -->
      <div style="background-color:#f0f9f4;border-left:4px solid ${brandColor};border-radius:6px;padding:16px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:13px;color:#065f46;line-height:1.5;">
          <strong>Note:</strong> The payment link is secure and unique to your application. If you have any questions about this charge, please contact us before completing payment.
        </p>
      </div>

      <!-- Contact -->
      <div style="text-align:center;margin:0 0 24px 0;padding:20px 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;">
          Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color:${brandColor};text-decoration:none;font-weight:500;">resales@gmgva.com</a>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:#f9fafb;padding:24px 20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
        <strong style="color:${brandColor};font-weight:600;">Goodman Management Group</strong><br>
        Professional HOA Management &amp; Resale Services
      </p>
    </div>
  </div>
</body>
</html>`;

        await sendEmail({
          to:      application.submitter_email,
          subject: `Rush Processing Upgrade — Application #${applicationId}`,
          html:    invoiceHtml,
          context: 'RushUpgradeInvoice',
        });

      } catch (emailErr) {
        console.error('upgrade-to-rush: Invoice email failed:', emailErr);
        invoiceError = 'Stripe invoice created but email failed to send';
      }
    }

    return res.status(200).json({
      success:      true,
      invoiceUrl,
      invoiceError: invoiceError ?? null,
      newDeadlineDate,
      totalFeeDisplay,
    });

  } catch (error) {
    console.error('Error in upgrade-to-rush:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

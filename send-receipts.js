/**
 * Manually resend receipt emails.
 *
 * Usage:
 *   node send-receipts.js [--test] [--dry-run] [--to=email@example.com] [appId1 appId2 ...]
 *
 *   --test          Use test Supabase DB + test Stripe key
 *   --dry-run       Render the receipt to an HTML file instead of emailing it
 *   --to=EMAIL      Override recipient (send to this address instead of the submitter)
 *   No ids given    Defaults to live apps 2242 and 2248
 *
 * Examples:
 *   node send-receipts.js --dry-run 2779                     (writes HTML, sends nothing)
 *   node send-receipts.js --to=ianrizhmanago@gmail.com 2251
 *   node send-receipts.js                                    (sends to live 2242 + 2248)
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

const args = process.argv.slice(2);
const isTest = args.includes('--test');
const isDryRun = args.includes('--dry-run');
const toOverride = (args.find(a => a.startsWith('--to=')) || '').replace('--to=', '') || null;
const idArgs = args.filter(a => !a.startsWith('--')).map(Number).filter(Boolean);
const APPLICATION_IDS = idArgs.length > 0 ? idArgs : [2242, 2248];

function requireEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  console.error(`Missing required environment variable: ${names.join(' or ')}`);
  console.error('Set it in .env.local (see .env.local.example).');
  process.exit(1);
}

const supabaseUrl = isTest
  ? requireEnv('SUPABASE_URL_TEST', 'NEXT_PUBLIC_SUPABASE_URL')
  : requireEnv('SUPABASE_URL_LIVE', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = isTest
  ? requireEnv('SUPABASE_SERVICE_ROLE_KEY_TEST', 'SUPABASE_SERVICE_ROLE_KEY')
  : requireEnv('SUPABASE_SERVICE_ROLE_KEY_LIVE', 'SUPABASE_SERVICE_ROLE_KEY');
const stripeKey = isTest
  ? requireEnv('STRIPE_SECRET_KEY_TEST', 'STRIPE_SECRET_KEY')
  : requireEnv('STRIPE_SECRET_KEY_LIVE', 'STRIPE_SECRET_KEY');

// .env.local carries the test and live Supabase blocks stacked, one commented out. Toggling
// them by hand can leave a URL from one project paired with a service-role key from the
// other, and the URL wins — so the script would read a DIFFERENT database than the operator
// believes and resend a real customer a receipt built from the wrong application row.
// The service-role JWT names its project in the `ref` claim, so verify the pair agrees.
function supabaseProjectRef(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\./.exec(url || '');
  return m ? m[1] : null;
}

function serviceKeyProjectRef(key) {
  try {
    const payload = String(key).split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).ref || null;
  } catch {
    return null; // Non-JWT key format (e.g. sb_secret_*) — nothing to cross-check.
  }
}

const urlRef = supabaseProjectRef(supabaseUrl);
const keyRef = serviceKeyProjectRef(supabaseKey);
if (urlRef && keyRef && urlRef !== keyRef) {
  console.error('Refusing to run: Supabase URL and service-role key belong to different projects.');
  console.error(`  URL project: ${urlRef}`);
  console.error(`  Key project: ${keyRef}`);
  console.error('  Check the commented test/live blocks in .env.local.');
  process.exit(1);
}

console.log(`Mode:    ${isTest ? 'TEST (test DB + test Stripe)' : 'LIVE (production DB + live Stripe)'}`);
console.log(`Action:  ${isDryRun ? 'DRY RUN — rendering to file, NO email will be sent' : 'SEND — real emails will be delivered'}`);
console.log(`DB:      ${supabaseUrl}${urlRef ? ` (project ${urlRef})` : ''}`);
console.log(`Stripe:  ${stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_') ? 'LIVE' : 'TEST'} key`);
console.log(`App IDs: ${APPLICATION_IDS.join(', ')}`);
if (toOverride) console.log(`To:      ${toOverride} (override — not sending to actual submitter)`);
console.log('');

const supabase = createClient(supabaseUrl, supabaseKey);
const stripe = new Stripe(stripeKey);

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Mirror of resolveReceiptTotal() in lib/processing/steps.js — duplicated because that
// module is ESM and this is a standalone CommonJS script. Keep the two in sync.
//
// The receipt total must be what Stripe actually charged, NOT applications.total_amount:
// for multi_community that column holds refundable service fees only, excluding the
// $9.95 CC fee charged per association (ClickUp 86d44v1by).
function resolveReceiptTotal({ app, chargedCents, lineItems }) {
  const candidates = [
    { source: 'stripe charge', value: chargedCents != null ? chargedCents / 100 : null },
    { source: 'stripe_amount_total column', value: app.stripe_amount_total != null ? Number(app.stripe_amount_total) : null },
    {
      source: 'stripe line items',
      value: (lineItems || []).length > 0
        ? lineItems.reduce((sum, item) => sum + Number(item.amount), 0)
        : null,
    },
    { source: 'total_amount column (FALLBACK — not a Stripe figure)', value: app.total_amount != null ? Number(app.total_amount) : null },
  ];
  const resolved = candidates.find(c => c.value != null && Number.isFinite(c.value));
  if (!resolved) return { total: '0.00', source: 'none', fromStripe: false };
  return {
    total: resolved.value.toFixed(2),
    source: resolved.source,
    fromStripe: resolved.source !== candidates[3].source,
  };
}

function buildReceiptHtml({ customerName, propertyAddress, packageType, totalAmount, invoiceNumber, stripeChargeId, invoiceDate, applicationType, paymentMethod, lineItems }) {
  const formattedDate = invoiceDate
    ? new Date(invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let cardBrand = null, cardLast4 = null;
  if (paymentMethod) {
    const m = paymentMethod.match(/^([A-Z]+)\s*-\s*(\d+)$/);
    if (m) { cardBrand = m[1].toUpperCase(); cardLast4 = m[2]; }
  }

  const assetBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const logoUrl = `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
  const brandColor = '#0f4734';

  const iconMap = {
    VISA: `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/visa.png`,
    MASTERCARD: `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/mastercard.png`,
    AMEX: `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/americanexpress.png`,
    'AMERICAN EXPRESS': `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/americanexpress.png`,
    DISCOVER: `${assetBaseUrl}/storage/v1/object/public/bucket0/assets/card-icons/discover.png`,
  };

  function getCardBrandDisplay(brand) {
    if (!brand) return '';
    const iconUrl = iconMap[brand.toUpperCase()];
    if (iconUrl) {
      return `<img src="${iconUrl}" alt="${brand}" width="40" height="26" style="height:26px;width:auto;max-width:40px;display:inline-block;vertical-align:middle;border:0;" />`;
    }
    const brandColors = { VISA: '#1A1F71', MASTERCARD: '#EB001B', AMEX: '#006FCF', DISCOVER: '#FF6000' };
    const color = brandColors[brand.toUpperCase()] || brandColor;
    return `<span style="display:inline-block;background-color:${color};color:white;padding:4px 8px;border-radius:4px;font-weight:bold;font-size:11px;">${brand}</span>`;
  }

  const lineItemsHtml = lineItems && lineItems.length > 0 ? `
    <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:${brandColor};">Summary</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        ${lineItems.map(item => {
          const isCreditCardFee = /credit card processing fee/i.test(item.name);
          return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">
            <div style="font-weight:600;color:#111827;">${escapeHtml(item.name)}${item.quantity > 1 ? ` x ${item.quantity}` : ''}</div>
            ${item.description ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(item.description)}</div>` : ''}
            ${isCreditCardFee ? '<div style="font-size:12px;color:#6b7280;margin-top:2px;">Non-refundable.</div>' : ''}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:600;vertical-align:top;">$${item.amount}</td>
        </tr>`;
        }).join('')}
        <tr>
          <td style="padding:16px 0 0 0;font-size:16px;font-weight:600;color:#374151;">Amount paid</td>
          <td style="padding:16px 0 0 0;font-size:20px;color:${brandColor};text-align:right;font-weight:700;">$${totalAmount}</td>
        </tr>
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;max-width:140px;display:block;border:0;" />
      </div>
      <div style="text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:32px;font-weight:700;letter-spacing:-0.5px;">Payment Receipt</h1>
      </div>
    </div>

    <div style="padding:30px 20px;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;font-size:16px;color:#333333;">Dear ${escapeHtml(customerName)},</p>
      <p style="margin:0 0 24px 0;font-size:16px;color:#666666;">Thank you for your payment! Please find your receipt below.</p>

      <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 20px 0;font-size:20px;font-weight:600;color:${brandColor};">Receipt Details</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Receipt Number:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">#${escapeHtml(invoiceNumber)}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Payment Date:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${formattedDate}</td>
          </tr>
          ${propertyAddress ? `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Property Address:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${escapeHtml(propertyAddress)}</td>
          </tr>` : ''}
          ${applicationType !== 'info_packet' ? `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Processing Type:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (15 calendar days)'}</td>
          </tr>` : ''}
          ${cardBrand ? `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Payment Method:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;">
              ${getCardBrandDisplay(cardBrand)} <span style="margin-left:8px;font-weight:500;">•••• ${cardLast4}</span>
            </td>
          </tr>` : ''}
          ${stripeChargeId ? `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Payment Reference:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-family:monospace;">${stripeChargeId}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:12px 0;font-size:14px;color:#6b7280;"><strong style="color:#374151;">Total Amount Paid:</strong></td>
            <td style="padding:12px 0;font-size:20px;color:${brandColor};text-align:right;font-weight:700;">$${totalAmount}</td>
          </tr>
        </table>
      </div>

      ${lineItemsHtml}

      <div style="text-align:center;margin:0 0 24px 0;padding:20px 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;">
          Questions? Contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color:${brandColor};text-decoration:none;font-weight:500;">resales@gmgva.com</a>
        </p>
      </div>
    </div>

    <div style="background-color:#f9fafb;padding:24px 20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">
        <strong style="color:${brandColor};font-weight:600;">Goodman Management Group</strong><br>
        Professional HOA Management &amp; Resale Services
      </p>
    </div>
  </div>
</body>
</html>`;
}

async function sendViaGraph(to, subject, html) {
  const credential = new ClientSecretCredential(
    process.env.MICROSOFT_TENANT_ID,
    process.env.MICROSOFT_CLIENT_ID,
    process.env.MICROSOFT_CLIENT_SECRET
  );

  const client = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken('https://graph.microsoft.com/.default');
        return token.token;
      }
    }
  });

  const fromEmail = process.env.MICROSOFT_FROM_EMAIL;

  await client.api(`/users/${fromEmail}/sendMail`).post({
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
      from: { emailAddress: { address: fromEmail, name: 'GMG ResaleFlow' } },
    },
    saveToSentItems: true,
  });
}

async function resendReceipt(applicationId) {
  console.log(`Processing application #${applicationId}...`);

  const { data: app, error } = await supabase
    .from('applications')
    .select('id, submitter_email, submitter_name, property_address, package_type, total_amount, stripe_amount_total, payment_method, application_type, stripe_session_id, stripe_payment_intent_id, payment_completed_at, submitted_at')
    .eq('id', applicationId)
    .single();

  if (error || !app) {
    console.error(`  ❌ Not found:`, error?.message);
    return;
  }

  const recipient = toOverride || app.submitter_email;

  console.log(`  Submitter: ${app.submitter_email}`);
  console.log(`  Sending to: ${recipient}${toOverride ? ' (overridden)' : ''}`);
  console.log(`  Address:   ${app.property_address}`);
  console.log(`  Paid at:   ${app.payment_completed_at}`);

  let receiptUrl = null, receiptNumber = null, paymentMethod = null, lineItems = [];
  let chargedCents = null;

  if (app.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(app.stripe_payment_intent_id);
      if (pi.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        receiptUrl = charge.receipt_url;
        receiptNumber = charge.receipt_number;
        chargedCents = charge.amount;
        if (charge.payment_method_details?.card) {
          const { brand, last4 } = charge.payment_method_details.card;
          paymentMethod = `${(brand || 'CARD').toUpperCase()} - ${last4 || '****'}`;
        }
      }
      console.log(`  Method:    ${paymentMethod}`);
    } catch (err) {
      console.warn(`  ⚠️  Could not fetch charge: ${err.message}`);
    }
  }

  if (app.stripe_session_id) {
    try {
      const sessionItems = await stripe.checkout.sessions.listLineItems(app.stripe_session_id, {
        expand: ['data.price.product'],
      });
      if (sessionItems?.data?.length > 0) {
        lineItems = sessionItems.data.map(item => {
          let name = null, description = null;
          if (item.price?.product && typeof item.price.product !== 'string') {
            name = item.price.product.name;
            description = item.price.product.description;
          }
          if (!name) name = item.description || 'Service';
          if (!description) description = item.description;
          return { name, description, amount: (item.amount_total / 100).toFixed(2), quantity: item.quantity || 1 };
        });
        console.log(`  Items:     ${lineItems.map(i => i.name).join(', ')}`);
      }
    } catch (err) {
      console.warn(`  ⚠️  Could not fetch line items: ${err.message}`);
    }
  }

  const invoiceDate = app.payment_completed_at || app.submitted_at;
  const invoiceNumber = `PAY-${app.id}`;
  const { total: totalAmount, source, fromStripe } = resolveReceiptTotal({ app, chargedCents, lineItems });

  console.log(`  Amount:    $${totalAmount}  (source: ${source}; total_amount column: $${app.total_amount})`);
  if (Number(totalAmount) !== Number(app.total_amount)) {
    console.log(`  ⚠️  Receipting the Stripe-charged amount, not total_amount (expected for multi-community).`);
  }

  // Never email a total we could not confirm against Stripe — an unverified figure is the
  // whole defect this script exists to correct.
  if (!fromStripe && !isDryRun) {
    console.error(`  ❌ Refusing to send: could not obtain a Stripe amount for #${app.id}.`);
    console.error(`     Falling back to the total_amount column risks re-sending a wrong total.`);
    console.error(`     Check that this app's Stripe IDs belong to the ${isTest ? 'TEST' : 'LIVE'} Stripe account.\n`);
    return;
  }

  const html = buildReceiptHtml({
    customerName: app.submitter_name || 'Customer',
    propertyAddress: app.property_address || '',
    packageType: app.package_type || 'standard',
    totalAmount,
    invoiceNumber,
    stripeChargeId: app.stripe_payment_intent_id,
    invoiceDate,
    applicationType: app.application_type || 'single_property',
    paymentMethod,
    lineItems,
  });

  const subject = `Payment Receipt #${invoiceNumber}`;
  const displayDate = new Date(invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (isDryRun) {
    const outPath = path.join(os.tmpdir(), `receipt-${app.id}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`  📄 DRY RUN — nothing sent. Rendered to: ${outPath}`);
    console.log(`     Would have gone to ${recipient} | Date: ${displayDate}\n`);
    return;
  }

  await sendViaGraph(recipient, subject, html);
  console.log(`  ✅ Sent to ${recipient} | Date: ${displayDate}\n`);
}

async function main() {
  for (const id of APPLICATION_IDS) {
    await resendReceipt(id);
  }
  console.log('Done.');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

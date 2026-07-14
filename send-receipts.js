/**
 * Manually resend receipt emails.
 *
 * Usage:
 *   node send-receipts.js [--test] [--to=email@example.com] [appId1 appId2 ...]
 *
 *   --test          Use test Supabase DB + test Stripe key
 *   --to=EMAIL      Override recipient (send to this address instead of the submitter)
 *   No ids given    Defaults to live apps 2242 and 2248
 *
 * Examples:
 *   node send-receipts.js --to=ianrizhmanago@gmail.com 2251
 *   node send-receipts.js                                    (sends to live 2242 + 2248)
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');
const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

const args = process.argv.slice(2);
const isTest = args.includes('--test');
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
  ? requireEnv('SUPABASE_URL_TEST')
  : requireEnv('SUPABASE_URL_LIVE', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = isTest
  ? requireEnv('SUPABASE_SERVICE_ROLE_KEY_TEST')
  : requireEnv('SUPABASE_SERVICE_ROLE_KEY_LIVE', 'SUPABASE_SERVICE_ROLE_KEY');
const stripeKey = isTest
  ? requireEnv('STRIPE_SECRET_KEY_TEST', 'STRIPE_SECRET_KEY')
  : requireEnv('STRIPE_SECRET_KEY_LIVE', 'STRIPE_SECRET_KEY');

console.log(`Mode:    ${isTest ? 'TEST (test DB + test Stripe)' : 'LIVE (production DB + live Stripe)'}`);
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
    .select('id, submitter_email, submitter_name, property_address, package_type, total_amount, payment_method, application_type, stripe_session_id, stripe_payment_intent_id, payment_completed_at, submitted_at')
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
  console.log(`  Amount:    $${app.total_amount}`);
  console.log(`  Paid at:   ${app.payment_completed_at}`);

  let receiptUrl = null, receiptNumber = null, paymentMethod = null, lineItems = [];

  if (app.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(app.stripe_payment_intent_id);
      if (pi.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        receiptUrl = charge.receipt_url;
        receiptNumber = charge.receipt_number;
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

  const html = buildReceiptHtml({
    customerName: app.submitter_name || 'Customer',
    propertyAddress: app.property_address || '',
    packageType: app.package_type || 'standard',
    totalAmount: app.total_amount,
    invoiceNumber,
    stripeChargeId: app.stripe_payment_intent_id,
    invoiceDate,
    applicationType: app.application_type || 'single_property',
    paymentMethod,
    lineItems,
  });

  const subject = `Payment Receipt #${invoiceNumber}`;
  await sendViaGraph(recipient, subject, html);

  const displayDate = new Date(invoiceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

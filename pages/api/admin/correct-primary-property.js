import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { getServerStripe } from '../../../lib/stripe';
import { getConnectedAccountId } from '../../../lib/stripeMode';
import { sendEmail } from '../../../lib/emailService';
import { getPricing } from '../../../lib/pricingConfig';
import { parseEmails } from '../../../lib/emailUtils';

const CONVENIENCE_FEE_CENTS = 995;   // $9.95 per property
const TRANSFER_THRESHOLD_CENTS = 20000; // $200.00 — minimum base price to trigger transfer
const TRANSFER_AMOUNT_PER_PROPERTY_CENTS = 2100; // $21.00 per additional property

// Older applications were stored with application_type = 'standard' before the
// multi-type schema was introduced. Map them to 'single_property' for pricing.
function normalizeAppType(applicationType) {
  if (!applicationType || applicationType === 'standard') return 'single_property';
  return applicationType;
}

function getDocumentLabel(applicationType) {
  if (applicationType === 'settlement_va' || applicationType === 'settlement_nc') return 'Settlement Statement';
  if (applicationType === 'lender_questionnaire') return 'Lender Questionnaire';
  return 'Resale Certificate';
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
      newPrimaryPropertyId,
      dryRun = false,           // true = preview only, false = apply
      waiveDelta = false,       // true = apply correction without collecting delta payment
      createInvoice = false,    // true = create Stripe checkout for delta and email customer
      desiredPackageType = null, // 'standard' | 'rush' — if null, defaults to current package_type
    } = req.body;

    if (!applicationId || !newPrimaryPropertyId) {
      return res.status(400).json({ error: 'applicationId and newPrimaryPropertyId are required' });
    }

    // Fetch the application
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select('id, hoa_property_id, application_type, package_type, payment_method, total_amount, notes, submitter_email, submitter_name, property_address, is_test_transaction, stripe_session_id, correction_stripe_session_id, status, payment_status')
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Lender questionnaire applications are not supported by this flow
    if (application.application_type === 'lender_questionnaire') {
      return res.status(400).json({ error: 'Property correction is not supported for lender questionnaire applications' });
    }

    // Guard against double-invoicing: if a correction payment is already pending, reject
    if (!dryRun && createInvoice && application.correction_stripe_session_id) {
      return res.status(409).json({ error: 'A correction payment is already pending for this application' });
    }

    // Fetch old primary property name for audit trail
    const { data: oldPrimary } = await supabase
      .from('hoa_properties')
      .select('name')
      .eq('id', application.hoa_property_id)
      .single();
    const oldPrimaryName = oldPrimary?.name || `ID ${application.hoa_property_id}`;

    // Fetch new primary property
    const { data: newPrimary, error: propError } = await supabase
      .from('hoa_properties')
      .select('id, name, location, is_multi_community, property_owner_email')
      .eq('id', newPrimaryPropertyId)
      .is('deleted_at', null)
      .single();

    if (propError || !newPrimary) {
      return res.status(404).json({ error: 'New primary property not found' });
    }

    // Fetch linked properties for the new primary (empty array for non-MC properties)
    let newLinked = [];
    if (newPrimary.is_multi_community) {
      const { data: linkedData, error: linkedError } = await supabase
        .rpc('get_linked_properties', { property_id: newPrimaryPropertyId });
      if (linkedError) {
        return res.status(500).json({ error: 'Failed to fetch linked properties for new primary' });
      }
      newLinked = linkedData || [];
    }

    // Fetch current property groups — include email/name so we can save them before deletion
    const { data: currentGroups, error: groupsError } = await supabase
      .from('application_property_groups')
      .select('id, property_id, property_name, property_owner_email, is_primary')
      .eq('application_id', applicationId);

    if (groupsError) {
      return res.status(500).json({ error: 'Failed to fetch current property groups' });
    }

    // Single-property applications have no application_property_groups rows (those are only
    // created for multi-community apps). Treat the original hoa_property_id as 1 already-paid
    // property so delta and effectiveBasePerProp are derived from the actual amount paid
    // rather than falling back to the pricing-config default.
    const hasGroups      = (currentGroups || []).length > 0;
    const currentCount   = hasGroups ? currentGroups.length : 1;
    const newTotalCount  = 1 + (newLinked).length;
    const delta          = newTotalCount - currentCount;

    // Pricing — use desiredPackageType if provided, otherwise keep current
    const currentIsRush      = application.package_type === 'rush';
    const targetPackageType  = desiredPackageType || application.package_type;
    const targetIsRush       = targetPackageType === 'rush';
    const isUpgradingToRush  = !currentIsRush && targetIsRush;
    const isCreditCard       = application.payment_method === 'credit_card';
    const convFeePerProp     = isCreditCard ? CONVENIENCE_FEE_CENTS : 0;

    // Rush fee business rule:
    //   - NC Settlement → $100 (SETTLEMENT_NC_RUSH_FEE)
    //   - Lender Questionnaire → $100 (LENDER_QUESTIONNAIRE_RUSH_FEE — blocked from this flow anyway)
    //   - Everything else → $70.66 (SINGLE_PROPERTY_RUSH_FEE)
    const HUNDRED_DOLLAR_RUSH_TYPES = ['settlement_nc', 'lender_questionnaire'];
    const appTypeForRush = HUNDRED_DOLLAR_RUSH_TYPES.includes(application.application_type) ? application.application_type : 'single_property';
    const configRushFee  = getPricing(appTypeForRush, true).rushFee;

    // Base fee is always the single-property price ($317.95) regardless of app type.
    const effectiveBasePerProp = getPricing('single_property', false).base;

    // Keep pricing object available for display helpers (dry-run response etc.)
    const pricing = getPricing(normalizeAppType(application.application_type), targetIsRush);

    // Per-property charge for NEW additional properties at the target package
    const pricePerProp     = effectiveBasePerProp + (targetIsRush ? configRushFee : 0);
    const deltaAmountCents = delta > 0
      ? (pricePerProp + convFeePerProp) * delta
      : 0;

    // If upgrading from standard → rush, charge the rush fee for all currently-paid properties
    const rushUpgradeCents = isUpgradingToRush
      ? (configRushFee + convFeePerProp) * currentCount
      : 0;

    // Total additional charge = property delta + rush upgrade on existing properties
    const totalAdditionalCents   = deltaAmountCents + rushUpgradeCents;
    const totalAdditionalDisplay = (totalAdditionalCents / 100).toFixed(2);

    // Compute which properties are additional (new ones not already paid) — used in both dry-run and apply
    const oldPropertyIds = new Set([
      ...(currentGroups || []).map(g => g.property_id),
      ...(!hasGroups ? [application.hoa_property_id] : []),
    ]);
    const allNewProperties = [
      { id: newPrimary.id, name: newPrimary.name, location: newPrimary.location },
      ...(newLinked).map(l => ({ id: l.linked_property_id, name: l.property_name, location: l.location })),
    ];
    const additionalProperties = allNewProperties.filter(p => !oldPropertyIds.has(p.id));

    // Current properties — needed for rush upgrade display
    const currentProperties = hasGroups
      ? currentGroups.map(g => ({ name: g.property_name }))
      : [{ name: oldPrimaryName }];

    // --- DRY RUN: return preview only ---
    if (dryRun) {
      return res.status(200).json({
        delta,
        deltaAmountCents,
        deltaAmountDisplay:        (deltaAmountCents / 100).toFixed(2),
        rushUpgradeCents,
        rushUpgradeDisplay:        (rushUpgradeCents / 100).toFixed(2),
        totalAdditionalCents,
        totalAdditionalDisplay,
        newTotalCount,
        currentCount,
        newPrimaryName:            newPrimary.name,
        currentIsRush,
        targetIsRush,
        isUpgradingToRush,
        isCreditCard,
        // Per-property breakdown for UI display
        additionalProperties:      additionalProperties.map(p => ({ name: p.name, location: p.location })),
        currentProperties,
        effectiveBasePerProp,
        effectiveBaseDisplay:      (effectiveBasePerProp / 100).toFixed(2),
        convFeePerProp,
        convFeeDisplay:            (convFeePerProp / 100).toFixed(2),
        configRushFee,
        configRushFeeDisplay:      (configRushFee / 100).toFixed(2),
      });
    }

    // --- APPLY CORRECTION ---

    // Build correction note for audit trail
    const adminName      = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Admin';
    const packageNote    = isUpgradingToRush
      ? ` Package upgraded from standard → rush.`
      : '';
    const chargeNote     = totalAdditionalCents > 0
      ? waiveDelta
        ? ` Total additional charge of $${totalAdditionalDisplay} waived by ${adminName}.`
        : createInvoice
          ? ` Invoice of $${totalAdditionalDisplay} created and emailed to ${application.submitter_email}.`
          : ''
      : delta < 0
        ? ` New setup has ${Math.abs(delta)} fewer propert${Math.abs(delta) === 1 ? 'y' : 'ies'} than originally paid. No refund issued.`
        : '';

    const correctionNote = `[${new Date().toISOString()}] Property corrected by ${adminName}: changed from ${oldPrimaryName} → ${newPrimary.name}.${packageNote}${chargeNote}`;

    // 1. Update hoa_property_id, package_type (if changed), and append to notes.
    //    Also save correction_metadata so the webhook knows who the old property owners were —
    //    we need this BEFORE the groups are deleted so we can send the right emails.
    const oldOwners = (currentGroups || [])
      .filter(g => g.property_owner_email)
      .map(g => ({
        propertyId:   g.property_id,
        propertyName: g.property_name,
        email:        g.property_owner_email,
        isPrimary:    g.is_primary,
      }));

    // Determine if the application_type should change.
    // A single-property app corrected to an MC property becomes 'multi_community'.
    // An MC app corrected to a non-MC property reverts to 'single_property'.
    const currentIsSettlement = ['settlement_va', 'settlement_nc'].includes(application.application_type);
    let newApplicationType = application.application_type;
    if (!currentIsSettlement) {
      if (newPrimary.is_multi_community) {
        newApplicationType = 'multi_community';
      } else if (application.application_type === 'multi_community') {
        newApplicationType = 'single_property';
      }
    }

    const appUpdate = {
      hoa_property_id:      newPrimaryPropertyId,
      application_type:     newApplicationType,
      notes:                application.notes ? `${application.notes}\n\n${correctionNote}` : correctionNote,
      correction_metadata:  {
        oldOwners,
        oldPrimaryPropertyName: oldPrimaryName,
        newPrimaryPropertyName: newPrimary.name,
        correctedAt:            new Date().toISOString(),
      },
      updated_at:           new Date().toISOString(),
    };
    if (targetPackageType !== application.package_type) {
      appUpdate.package_type = targetPackageType;
      if (isUpgradingToRush) {
        appUpdate.rush_upgraded_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await supabase
      .from('applications')
      .update(appUpdate)
      .eq('id', applicationId);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to update application record' });
    }

    // 2. Delete existing property groups
    const { error: deleteError } = await supabase
      .from('application_property_groups')
      .delete()
      .eq('application_id', applicationId);

    if (deleteError) {
      return res.status(500).json({ error: 'Failed to remove old property groups' });
    }

    // 3. Insert rebuilt property groups
    const newGroups = [
      {
        application_id:      applicationId,
        property_id:         newPrimary.id,
        property_name:       newPrimary.name,
        property_location:   newPrimary.location,
        property_owner_email: newPrimary.property_owner_email,
        is_primary:          true,
        status:              'pending',
        inspection_status:   'not_started',
        pdf_status:          'not_started',
        email_status:        'not_started',
      },
      ...(newLinked).map((linked) => ({
        application_id:      applicationId,
        property_id:         linked.linked_property_id,
        property_name:       linked.property_name,
        property_location:   linked.location ?? null,
        property_owner_email: linked.property_owner_email ?? null,
        is_primary:          false,
        status:              'pending',
        inspection_status:   'not_started',
        pdf_status:          'not_started',
        email_status:        'not_started',
      })),
    ];

    const { error: insertError } = await supabase
      .from('application_property_groups')
      .insert(newGroups);

    if (insertError) {
      return res.status(500).json({ error: 'Failed to create new property groups', detail: insertError.message, hint: insertError.hint });
    }

    // 4. If delta > 0 and createInvoice: create Stripe checkout and email customer
    let invoiceUrl = null;
    let invoiceError = null;
    if (createInvoice && totalAdditionalCents > 0) {
      // Build line items — broken out as base fee + rush fee + CC fee per additional property,
      // plus rush upgrade fee for any already-paid properties if upgrading standard → rush.
      const lineItems = [];

      // Additional properties (new ones not in the original set)
      const documentLabel = getDocumentLabel(application.application_type);
      additionalProperties.forEach((prop) => {
        const propLocation = prop.location ? ` · ${prop.location}` : '';

        // Base processing fee (derived from actual amount paid, not pricing config)
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${documentLabel} — ${prop.name}`,
              description: `${targetIsRush ? 'Rush' : 'Standard'} ${documentLabel} for ${application.property_address || prop.name} (${targetIsRush ? '5 business days' : '15 calendar days'})`,
            },
            unit_amount: effectiveBasePerProp,
          },
          quantity: 1,
        });

        // Rush fee for this additional property (if target is rush)
        if (targetIsRush && configRushFee > 0) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: `Rush Processing — ${prop.name}`,
                description: `Expedited processing (5 business days)${propLocation}`,
              },
              unit_amount: configRushFee,
            },
            quantity: 1,
          });
        }

        // Credit card convenience fee
        if (isCreditCard) {
          lineItems.push({
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Credit Card Processing Fee',
                description: 'Processing fee for credit card payments',
              },
              unit_amount: CONVENIENCE_FEE_CENTS,
            },
            quantity: 1,
          });
        }
      });

      // Rush upgrade fee for existing (already-paid) properties when upgrading standard → rush
      if (isUpgradingToRush && configRushFee > 0 && currentCount > 0) {
        lineItems.push({
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Rush Upgrade — Existing Properties',
              description: `Expedited processing upgrade for ${currentCount} previously paid propert${currentCount === 1 ? 'y' : 'ies'}`,
            },
            unit_amount: configRushFee + (isCreditCard ? CONVENIENCE_FEE_CENTS : 0),
          },
          quantity: currentCount,
        });
      }

      try {
        const isTestTransaction = !!application.is_test_transaction
          || (application.stripe_session_id || '').startsWith('cs_test_');
        const stripe = getServerStripe(req, { forceTestMode: isTestTransaction });

        // Stripe Connect transfer: $21 per additional property when base price >= $200.
        // Rush-only upgrades do not trigger a transfer (no new properties added).
        const sessionData = {
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: lineItems,
          success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/payment/correction-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:  `${process.env.NEXT_PUBLIC_SITE_URL}/payment/cancel`,
          customer_email: application.submitter_email,
          metadata: {
            applicationId: String(applicationId),
            correctionType: 'additional_property',
          },
        };

        if (additionalProperties.length > 0 && effectiveBasePerProp >= TRANSFER_THRESHOLD_CENTS) {
          const connectedAccountId = getConnectedAccountId(isTestTransaction);
          if (connectedAccountId) {
            const totalTransferCents = TRANSFER_AMOUNT_PER_PROPERTY_CENTS * additionalProperties.length;
            sessionData.payment_intent_data = {
              transfer_data: {
                destination: connectedAccountId,
                amount: totalTransferCents,
              },
            };
            console.log(`[Stripe Connect] Correction transfer: $${(totalTransferCents / 100).toFixed(2)} ($${(TRANSFER_AMOUNT_PER_PROPERTY_CENTS / 100).toFixed(2)} × ${additionalProperties.length} propert${additionalProperties.length === 1 ? 'y' : 'ies'}) to ${connectedAccountId}`);
          }
        }

        const session = await stripe.checkout.sessions.create(sessionData);
        invoiceUrl = session.url;

        // Store the correction session ID and lock the application for processing.
        // The webhook will clear processing_locked once the customer pays.
        await supabase
          .from('applications')
          .update({
            correction_stripe_session_id: session.id,
            processing_locked:            true,
            processing_locked_at:         new Date().toISOString(),
            processing_locked_reason:     'pending_property_correction_payment',
            updated_at:                   new Date().toISOString(),
          })
          .eq('id', applicationId);

      } catch (stripeErr) {
        console.error('correct-primary-property: Stripe session creation failed:', stripeErr);
        invoiceError = 'Failed to create Stripe checkout session';
      }

      if (invoiceUrl) {
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
          const logoUrl = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
          const brandColor = '#0f4734';
          const amountDisplay = totalAdditionalDisplay;
          const customerName = application.submitter_name || 'Valued Customer';
          const processingType = application.package_type === 'rush' ? 'Rush (5 business days)' : 'Standard (15 calendar days)';

          const invoiceHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Additional Payment Required</title>
  <!--[if mso]>
  <style type="text/css">body, table, td {font-family: Arial, sans-serif !important;}</style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div class="email-container" style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div class="email-header" style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;max-width:140px;display:block;border:0;" />
      </div>
      <div style="text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Additional Payment Required</h1>
      </div>
    </div>

    <!-- Body -->
    <div class="email-content" style="padding:30px 20px;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;font-size:16px;color:#333333;">Dear ${customerName},</p>
      <p style="margin:0 0 8px 0;font-size:16px;color:#666666;">
        Your resale certificate application has been updated. The property association has been corrected from
        <strong style="color:#111827;">${oldPrimaryName}</strong> to <strong style="color:#111827;">${newPrimary.name}</strong>.
      </p>
      <p style="margin:0 0 24px 0;font-size:16px;color:#666666;">
        An additional payment is required to complete processing of your updated package.
      </p>

      <!-- Payment Due Card -->
      <div style="background-color:#fff8ed;border:1px solid #fed7aa;border-radius:8px;padding:24px;margin:0 0 24px 0;text-align:center;">
        <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:0.05em;">Amount Due</p>
        <p style="margin:0 0 16px 0;font-size:40px;font-weight:700;color:#78350f;">$${amountDisplay}</p>
        <div style="margin-top:16px;">
          <a href="${invoiceUrl}" style="display:inline-block;padding:14px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">Pay Now</a>
        </div>
        <p style="margin:12px 0 0 0;font-size:12px;color:#b45309;">
          &#128274; Secure payment powered by <strong>Stripe</strong>
        </p>
      </div>

      <!-- Property Change Card -->
      <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 20px 0;font-size:18px;font-weight:600;color:${brandColor};">Property Change</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top;width:45%;"><strong style="color:#374151;">Application ID:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">#${applicationId}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top;"><strong style="color:#374151;">Property Address:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${application.property_address || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top;"><strong style="color:#374151;">Previous HOA:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#6b7280;text-align:right;">${oldPrimaryName}</td>
          </tr>
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top;"><strong style="color:#374151;">New HOA Package:</strong></td>
            <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">
              ${allNewProperties.map(p => `<div style="margin-bottom:2px;">${p.name}</div>`).join('')}
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0;font-size:14px;"><strong style="color:#374151;">Processing Type:</strong></td>
            <td style="padding:12px 0;font-size:14px;color:#111827;text-align:right;font-weight:500;">${processingType}</td>
          </tr>
        </table>
      </div>

      <!-- Fee Breakdown Card -->
      <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 20px 0;font-size:18px;font-weight:600;color:${brandColor};">Fee Breakdown</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr style="background-color:#f3f4f6;">
            <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Property</td>
            <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;text-align:right;">Base</td>
            ${targetIsRush ? '<td style="padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;text-align:right;">Rush</td>' : ''}
            ${isCreditCard ? '<td style="padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;text-align:right;">CC Fee</td>' : ''}
            <td style="padding:8px 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;text-align:right;">Subtotal</td>
          </tr>
          ${additionalProperties.map(p => {
            const propSubtotal = ((effectiveBasePerProp + (targetIsRush ? configRushFee : 0) + convFeePerProp) / 100).toFixed(2);
            return `<tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:12px 10px;font-size:14px;color:#111827;">${p.name}<br><span style="font-size:12px;color:#6b7280;">New property</span></td>
              <td style="padding:12px 10px;font-size:14px;color:#374151;text-align:right;">$${(effectiveBasePerProp / 100).toFixed(2)}</td>
              ${targetIsRush ? `<td style="padding:12px 10px;font-size:14px;color:#374151;text-align:right;">$${(configRushFee / 100).toFixed(2)}</td>` : ''}
              ${isCreditCard ? `<td style="padding:12px 10px;font-size:14px;color:#374151;text-align:right;">$${(convFeePerProp / 100).toFixed(2)}</td>` : ''}
              <td style="padding:12px 10px;font-size:14px;font-weight:600;color:#111827;text-align:right;">$${propSubtotal}</td>
            </tr>`;
          }).join('')}
          ${isUpgradingToRush ? currentProperties.map(p => {
            const rushSubtotal = ((configRushFee + convFeePerProp) / 100).toFixed(2);
            return `<tr style="border-top:1px solid #e5e7eb;">
              <td style="padding:12px 10px;font-size:14px;color:#111827;">${p.name}<br><span style="font-size:12px;color:#6b7280;">Rush upgrade</span></td>
              <td style="padding:12px 10px;font-size:14px;color:#6b7280;text-align:right;">—</td>
              ${targetIsRush ? `<td style="padding:12px 10px;font-size:14px;color:#374151;text-align:right;">$${(configRushFee / 100).toFixed(2)}</td>` : ''}
              ${isCreditCard ? `<td style="padding:12px 10px;font-size:14px;color:#374151;text-align:right;">$${(convFeePerProp / 100).toFixed(2)}</td>` : ''}
              <td style="padding:12px 10px;font-size:14px;font-weight:600;color:#111827;text-align:right;">$${rushSubtotal}</td>
            </tr>`;
          }).join('') : ''}
          <tr style="border-top:2px solid #d1d5db;background-color:#f3f4f6;">
            <td colspan="${1 + (targetIsRush ? 1 : 0) + (isCreditCard ? 1 : 0)}" style="padding:14px 10px;font-size:15px;font-weight:700;color:#111827;">Total Due</td>
            <td style="padding:14px 10px;font-size:15px;font-weight:700;color:${brandColor};text-align:right;">$${amountDisplay}</td>
          </tr>
        </table>
      </div>

      <!-- What Happens Next -->
      <div style="background-color:#f0f9ff;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #bae6fd;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr>
            <td style="width:4px;padding:0;vertical-align:middle;">
              <div style="width:4px;height:24px;background-color:${brandColor};border-radius:2px;"></div>
            </td>
            <td style="padding:0 0 0 12px;vertical-align:middle;">
              <h3 style="margin:0;font-size:18px;font-weight:600;color:${brandColor};">What Happens Next?</h3>
            </td>
          </tr>
        </table>
        <table class="steps-table" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          ${[
            'Complete your payment using the secure link above.',
            'Once payment is confirmed, processing of your updated application will resume immediately.',
            'Property owner forms will be sent to all included HOA communities.',
            'You will receive individual email updates for each community as documents are completed.',
            'All completed documents will be delivered to you electronically.',
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

      <!-- Note about payment link expiry -->
      <div style="background-color:#f0f9f4;border-left:4px solid ${brandColor};border-radius:6px;padding:16px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:13px;color:#065f46;line-height:1.5;">
          <strong>Note:</strong> The payment link above is secure and unique to your application. If you have any questions about this additional charge, please contact us before completing payment.
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
            to: application.submitter_email,
            subject: `Additional Payment Required — Application #${applicationId}`,
            html: invoiceHtml,
            context: 'CorrectPrimaryPropertyInvoice',
          });
        } catch (emailErr) {
          console.error('correct-primary-property: Invoice email failed:', emailErr);
          invoiceError = 'Stripe invoice created but email failed to send';
        }
      }
    }

    // 5. If no invoice was created (waived or no extra charge), send a simple
    //    confirmation email so the customer knows their application was updated.
    const shouldSendConfirmation = !createInvoice || totalAdditionalCents === 0;
    if (shouldSendConfirmation && application.submitter_email) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
        const logoUrl     = `${supabaseUrl}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
        const brandColor  = '#0f4734';
        const customerName   = application.submitter_name || 'Valued Customer';
        const processingType = targetIsRush ? 'Rush (5 business days)' : 'Standard (15 calendar days)';
        const upgradeNote    = isUpgradingToRush
          ? `<p style="margin:0 0 16px 0;font-size:15px;color:#666666;">Your application has also been <strong>upgraded to Rush processing</strong> — your certificate will be prioritized for completion within 5 business days.</p>`
          : '';

        const confirmationHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Updated</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">

    <!-- Header -->
    <div style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;">
        <img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;max-width:140px;display:block;border:0;" />
      </div>
      <div style="text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;line-height:1.2;">Application Updated</h1>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:30px 20px;background-color:#ffffff;">
      <p style="margin:0 0 16px 0;font-size:16px;color:#333333;">Dear ${customerName},</p>
      <p style="margin:0 0 16px 0;font-size:15px;color:#666666;">
        Your resale certificate application has been updated with the corrected property information. No additional payment is required — processing will continue as normal.
      </p>
      ${upgradeNote}

      <!-- Details Card -->
      <div style="background-color:#f9fafb;padding:24px;border-radius:8px;margin:0 0 24px 0;border:1px solid #e5e7eb;">
        <h2 style="margin:0 0 20px 0;font-size:18px;font-weight:600;color:${brandColor};">Application Details</h2>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Application ID:</strong></td>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">#${applicationId}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Property Address:</strong></td>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${application.property_address || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>HOA Community:</strong></td>
            <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;font-weight:500;">${newPrimary.name}</td>
          </tr>
          <tr>
            <td style="padding:10px 0;font-size:14px;color:#374151;"><strong>Processing:</strong></td>
            <td style="padding:10px 0;font-size:14px;color:#111827;text-align:right;font-weight:500;">${processingType}</td>
          </tr>
        </table>
      </div>

      <!-- What's Next -->
      <div style="background-color:#f0f9f4;border-left:4px solid ${brandColor};border-radius:6px;padding:16px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:14px;color:#065f46;line-height:1.5;">
          Your application is being processed. You will receive individual email updates for each community as documents are completed.
        </p>
      </div>

      <!-- Contact -->
      <div style="text-align:center;margin:0 0 24px 0;padding:20px 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;">
          Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color:${brandColor};text-decoration:none;font-weight:500;">resales@gmgva.com</a>
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
          subject: `Application Updated — Application #${applicationId}`,
          html:    confirmationHtml,
          context: 'CorrectPrimaryPropertyConfirmation',
        });
      } catch (confirmEmailErr) {
        console.error('correct-primary-property: Confirmation email failed:', confirmEmailErr);
        // Non-fatal — correction was applied successfully
      }
    }

    // When no Stripe invoice was created (waived or zero-cost correction), the webhook will
    // never fire, so we must notify property owners directly and clean up correction_metadata.
    if (!invoiceUrl) {
      try {
        const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dnivljiyahzxpyxjjifi.supabase.co';
        const logoUrl       = `${supabaseUrlEnv}/storage/v1/object/public/bucket0/assets/company_logo_white.png`;
        const brandColor    = '#0f4734';
        const siteUrl       = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://resalesflow.gmgva.com';
        const processingLabel = targetIsRush ? 'Rush — 5 business days' : 'Standard — 15 calendar days';

        const buildOwnerEmail = ({ heading, body, propertyName, nextStepNote, ctaUrl, ctaLabel }) => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${heading}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;background-color:#f5f5f5;line-height:1.6;color:#333333;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;">
    <div style="background-color:${brandColor};padding:30px 20px;">
      <div style="margin-bottom:16px;"><img src="${logoUrl}" alt="Goodman Management Group" width="140" height="42" style="height:42px;width:auto;display:block;border:0;"/></div>
      <div style="text-align:center;"><h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;line-height:1.2;">${heading}</h1></div>
    </div>
    <div style="padding:30px 20px;">
      <p style="margin:0 0 16px 0;font-size:15px;color:#333333;">Dear Property Manager,</p>
      <p style="margin:0 0 24px 0;font-size:15px;color:#555555;">${body}</p>
      <div style="background-color:#f9fafb;border-radius:8px;padding:20px;border:1px solid #e5e7eb;margin:0 0 24px 0;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Application ID:</strong></td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;">#${applicationId}</td>
          </tr>
          ${propertyName ? `<tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;"><strong>Your Property:</strong></td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;text-align:right;">${propertyName}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 0;font-size:14px;color:#374151;"><strong>Processing:</strong></td>
            <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;">${processingLabel}</td>
          </tr>
        </table>
      </div>
      ${nextStepNote ? `<div style="background-color:#f0f9f4;border-left:4px solid ${brandColor};border-radius:6px;padding:16px;margin:0 0 24px 0;">
        <p style="margin:0;font-size:14px;color:#065f46;">${nextStepNote}</p>
      </div>` : ''}
      ${ctaUrl ? `<div style="text-align:center;margin:0 0 24px 0;">
        <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background-color:${brandColor};color:#ffffff;text-decoration:none;border-radius:6px;font-size:16px;font-weight:600;">${ctaLabel || 'View Application'}</a>
      </div>` : ''}
      <div style="text-align:center;padding:20px 0;">
        <p style="margin:0;font-size:14px;color:#6b7280;">Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color:${brandColor};text-decoration:none;font-weight:500;">resales@gmgva.com</a></p>
      </div>
    </div>
    <div style="background-color:#f9fafb;padding:20px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="margin:0;font-size:12px;color:#6b7280;"><strong style="color:${brandColor};">Goodman Management Group</strong><br>Professional HOA Management &amp; Resale Services</p>
    </div>
  </div>
</body>
</html>`;

        // 3-way property owner notification (same logic as webhook's handleCorrectionPayment)
        const newPropIdSetOwner = new Set(newGroups.map(g => g.property_id));
        const ownerEmails = []; // [{ to, subject, html, context, label }]

        // A) Old owners whose property is no longer in the application
        const removedSeenOwner = new Set();
        for (const owner of oldOwners.filter(o => !newPropIdSetOwner.has(o.propertyId))) {
          for (const email of parseEmails(owner.email)) {
            const key = email.toLowerCase();
            if (removedSeenOwner.has(key)) continue;
            removedSeenOwner.add(key);
            ownerEmails.push({
              to:      email,
              subject: `Application Update — Property Correction (#${applicationId})`,
              html:    buildOwnerEmail({
                heading:      'Application Property Updated',
                body:         `A resale certificate application previously associated with <strong>${owner.propertyName}</strong> has been corrected. The application is now assigned to <strong>${newPrimary.name}</strong>. Your property is no longer part of this application.`,
                propertyName: owner.propertyName,
                nextStepNote: 'No further action is required from you for this application.',
                ctaUrl:       `${siteUrl}/admin/login?applicationId=${applicationId}`,
                ctaLabel:     'View Application',
              }),
              context: 'PropertyOwnerRemovedNotification',
              label:   `removed: ${email}`,
            });
          }
        }

        // B) Old owners whose property is still in the new setup
        const continuingSeenOwner = new Set();
        for (const owner of oldOwners.filter(o => newPropIdSetOwner.has(o.propertyId))) {
          const matchedGroup = newGroups.find(g => g.property_id === owner.propertyId);
          for (const email of parseEmails(owner.email)) {
            const key = email.toLowerCase();
            if (continuingSeenOwner.has(key)) continue;
            continuingSeenOwner.add(key);
            ownerEmails.push({
              to:      email,
              subject: `New Application Submitted — Property Correction (#${applicationId})`,
              html:    buildOwnerEmail({
                heading:      'New Application for Your Property',
                body:         `A resale certificate application has been updated and now includes your property. The application was recently corrected and your community has been confirmed as part of the updated application.`,
                propertyName: matchedGroup?.property_name || owner.propertyName,
                ctaUrl:       `${siteUrl}/admin/login?applicationId=${applicationId}`,
                ctaLabel:     'View Application',
              }),
              context: 'PropertyOwnerCorrectionContinuingNotification',
              label:   `continuing: ${email}`,
            });
          }
        }

        // C) Brand-new owners not already notified
        const allHandledOwnerEmails = new Set([...removedSeenOwner, ...continuingSeenOwner]);
        for (const g of newGroups) {
          for (const email of parseEmails(g.property_owner_email)) {
            const key = email.toLowerCase();
            if (allHandledOwnerEmails.has(key)) continue;
            allHandledOwnerEmails.add(key);
            ownerEmails.push({
              to:      email,
              subject: `New Application Submitted — Property Correction (#${applicationId})`,
              html:    buildOwnerEmail({
                heading:      'New Application for Your Property',
                body:         `A new resale certificate application has been submitted and assigned to your property. The application was recently corrected to include your community.`,
                propertyName: g.property_name,
                ctaUrl:       `${siteUrl}/admin/login?applicationId=${applicationId}`,
                ctaLabel:     'View Application',
              }),
              context: 'PropertyOwnerNewCorrectionNotification',
              label:   `new: ${email}`,
            });
          }
        }

        await Promise.allSettled(ownerEmails.map(e =>
          sendEmail({ to: e.to, subject: e.subject, html: e.html, context: e.context })
            .then(() => console.log(`[correct-primary-property] Property owner email sent (${e.label})`))
            .catch(err => console.error(`[correct-primary-property] Failed property owner email (${e.label}):`, err.message))
        ));

        console.log(`[correct-primary-property] Sent ${ownerEmails.length} property owner notification(s) for application ${applicationId}`);
      } catch (ownerEmailErr) {
        console.error('correct-primary-property: Property owner notification failed:', ownerEmailErr);
        // Non-fatal — correction was already applied successfully
      }

      // Clear correction_metadata — no webhook will fire to clear it since no invoice was created
      try {
        await supabase
          .from('applications')
          .update({ correction_metadata: null, updated_at: new Date().toISOString() })
          .eq('id', applicationId);
      } catch (cleanupErr) {
        console.error('correct-primary-property: Failed to clear correction_metadata:', cleanupErr);
      }
    }

    return res.status(200).json({
      success: true,
      newPrimaryName: newPrimary.name,
      newTotalCount,
      delta,
      invoiceUrl,
      invoiceError: invoiceError ?? null,
    });

  } catch (error) {
    console.error('Error in correct-primary-property:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

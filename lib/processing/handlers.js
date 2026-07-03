/**
 * Core post-payment processing handlers (server-only, ESM).
 *
 * These are the durable, idempotent building blocks that the job worker runs. They were
 * extracted verbatim (with fixes) from the old inline Stripe webhook so behavior is
 * preserved, but every function now takes an injected service-role Supabase client
 * instead of reaching for the browser-only `supabase` proxy — which is what previously
 * crashed the webhook server-side ("Supabase client can only be accessed in browser
 * context").
 *
 * Idempotency lives in the step wrappers (lib/processing/steps.js) and in the individual
 * create* helpers (which skip rows that already exist), so re-running any handler after a
 * retry is safe.
 */

import { getApplicationTypeData } from '../applicationTypes';
import {
  createPropertyGroups,
  generateDocumentsForAllGroups,
  createPropertyOwnerFormsForGroups,
} from '../groupingService';
import { getLinkedProperties } from '../multiCommunityUtils';
import { parseEmails } from '../emailUtils';
import crypto from 'crypto';

function generateAccessToken() {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Create the required property_owner_forms for a single-property / settlement application.
 * Idempotent — skips any (application, form_type) that already exists.
 */
export async function createPropertyOwnerForms(applicationId, supabase) {
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('application_type, submitter_type, hoa_properties(property_owner_email)')
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    throw new Error(`createPropertyOwnerForms: application ${applicationId} not found: ${appError?.message}`);
  }

  const recipientEmail = application.hoa_properties?.property_owner_email || '';
  const appTypeData = await getApplicationTypeData(application.application_type, supabase);
  const requiredForms = appTypeData.required_forms || [];

  let created = 0;
  for (const formType of requiredForms) {
    const { data: existing } = await supabase
      .from('property_owner_forms')
      .select('id')
      .eq('application_id', applicationId)
      .eq('form_type', formType)
      .is('property_group_id', null)
      .maybeSingle();

    if (existing) continue;

    await supabase.from('property_owner_forms').insert({
      application_id: applicationId,
      form_type: formType,
      status: 'not_started',
      recipient_email: recipientEmail,
      access_token: generateAccessToken(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    created += 1;
  }

  return { requiredForms, created };
}

/**
 * Auto-assign the application to a valid staff/admin/accounting user derived from the
 * property's owner/assignee emails. No-op (returns success:false) if already assigned.
 */
export async function autoAssignApplication(applicationId, supabase) {
  try {
    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        hoa_property_id,
        application_type,
        hoa_properties (
          id,
          name,
          property_owner_email,
          default_assignee_email,
          settlement_assignee_email,
          is_multi_community
        )
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return { success: false, error: 'Application not found' };
    }

    const { data: currentApp } = await supabase
      .from('applications')
      .select('assigned_to')
      .eq('id', applicationId)
      .single();

    if (currentApp?.assigned_to) {
      return { success: false, error: 'Application already assigned' };
    }

    const property = application.hoa_properties;
    if (!property || !property.property_owner_email) {
      return { success: false, error: 'No property owner email found' };
    }

    const isSettlement = application.application_type === 'settlement_va' ||
                         application.application_type === 'settlement_nc';
    if (isSettlement) {
      let settlementEmail = property.settlement_assignee_email?.trim();
      if (!settlementEmail) {
        const ownerEmails = parseEmails(property.property_owner_email);
        const firstOwner = ownerEmails[0]?.replace(/^owner\./, '').trim();
        if (firstOwner) settlementEmail = firstOwner;
      }
      if (!settlementEmail) {
        return { success: false, error: 'No assignee email found for settlement application' };
      }
      const { error: assignError } = await supabase
        .from('applications')
        .update({ assigned_to: settlementEmail, updated_at: new Date().toISOString() })
        .eq('id', applicationId);
      if (assignError) return { success: false, error: assignError.message };
      return { success: true, assignedTo: settlementEmail };
    }

    const ownerEmails = parseEmails(property.property_owner_email);
    if (ownerEmails.length === 0) {
      return { success: false, error: 'No valid property owner emails found' };
    }

    const defaultEmail = (property.default_assignee_email || '').trim().toLowerCase();
    const defaultInList = defaultEmail && ownerEmails.some(e => (e || '').trim().toLowerCase() === defaultEmail);
    const orderedEmails = defaultInList
      ? [
          ownerEmails.find(e => (e || '').trim().toLowerCase() === defaultEmail),
          ...ownerEmails.filter(e => (e || '').trim().toLowerCase() !== defaultEmail),
        ]
      : ownerEmails;

    const allowedRoles = ['staff', 'admin', 'accounting'];
    let assignedEmail = null;
    for (const rawEmail of orderedEmails) {
      if (!rawEmail) continue;
      const emailToTry = rawEmail.replace(/^owner\./, '').trim();
      if (!emailToTry) continue;

      let { data: profile } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('email', emailToTry)
        .single();

      if (!profile) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, role')
          .ilike('email', emailToTry);
        if (profiles && profiles.length > 0) profile = profiles[0];
      }

      if (profile && allowedRoles.includes(profile.role)) {
        assignedEmail = profile.email;
        break;
      }
    }

    if (!assignedEmail) {
      return {
        success: true,
        assignedTo: null,
        message: 'No valid staff user found among property owner emails. Application left unassigned.',
      };
    }

    const { error: assignError } = await supabase
      .from('applications')
      .update({ assigned_to: assignedEmail, updated_at: new Date().toISOString() })
      .eq('id', applicationId);

    if (assignError) return { success: false, error: assignError.message };
    return { success: true, assignedTo: assignedEmail };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Transition an application to under_review, set the deadline, auto-assign, and send the
 * submission email. Idempotent: safe to re-run (status/assign/email are all guarded or
 * naturally converge). Returns quietly if the application is already past submission.
 */
export async function autoSubmitApplication(applicationId, supabase) {
  const { data: app, error } = await supabase
    .from('applications')
    .select('id, submitter_name, submitter_email, property_address, package_type, application_type, total_amount, submitter_type, buyer_name, submitted_at, status, impersonation_metadata, hoa_properties(name)')
    .eq('id', applicationId)
    .single();

  if (error || !app) {
    throw new Error(`autoSubmitApplication: application ${applicationId} not found: ${error?.message}`);
  }

  const daysToAdd = app.package_type === 'rush' ? 5 : 15;
  const completionDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Only advance status forward — never pull a further-along app (approved/completed/etc.) back.
  const advanceableStatuses = ['pending_payment', 'payment_confirmed', 'payment_completed'];
  const updatePayload = { updated_at: new Date().toISOString(), expected_completion_date: completionDate };
  if (advanceableStatuses.includes(app.status)) {
    updatePayload.status = 'under_review';
  }
  if (!app.submitted_at) {
    updatePayload.submitted_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('applications')
    .update(updatePayload)
    .eq('id', applicationId);
  if (updateError) throw new Error(`autoSubmitApplication update failed: ${updateError.message}`);

  await autoAssignApplication(applicationId, supabase);

  // Submission email is idempotency-guarded by the caller? No — send once here, but skip
  // for impersonation sessions with email disabled. (Re-running a succeeded step never
  // reaches here because the step wrapper skips completed steps.)
  if (app.impersonation_metadata?.send_emails === false) {
    return { status: updatePayload.status || app.status, emailSent: false };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || `https://${process.env.VERCEL_URL}` || 'http://localhost:3000';
  const emailRes = await fetch(`${baseUrl}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.VERCEL_AUTOMATION_BYPASS_SECRET && {
        'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
      }),
    },
    body: JSON.stringify({
      emailType: 'application_submission',
      applicationId: app.id,
      customerName: app.submitter_name,
      customerEmail: app.submitter_email,
      propertyAddress: app.property_address,
      packageType: app.package_type,
      totalAmount: app.total_amount,
      hoaName: app.hoa_properties?.name,
      submitterType: app.submitter_type,
      applicationType: app.application_type,
      buyerName: app.buyer_name,
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    throw new Error(`Submission email failed (${emailRes.status}): ${errText}`);
  }

  return { status: updatePayload.status || app.status, emailSent: true };
}

/**
 * Multi-community processing: build property groups, make the app visible
 * (payment_confirmed), assign settlement groups, create per-group forms, and generate the
 * per-property documents (which emails each property manager their package). Notifications
 * ("new application") are handled by the separate notify_owners step, not here, to avoid
 * double-sending. Idempotent via groupingService's existence checks.
 */
export async function createMcGroups(applicationId, supabase) {
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(`*, hoa_properties ( id, name, location, property_owner_email, is_multi_community )`)
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    throw new Error(`createMcGroups: application ${applicationId} not found: ${appError?.message}`);
  }

  const linkedProperties = await getLinkedProperties(application.hoa_property_id, supabase);

  // No linked properties → not actually multi-community; fall back to single-property forms.
  if (!linkedProperties || linkedProperties.length === 0) {
    await createPropertyOwnerForms(applicationId, supabase);
    await supabase
      .from('applications')
      .update({ status: 'payment_confirmed', updated_at: new Date().toISOString() })
      .eq('id', applicationId);
    return { groups: 0, fellBackToSingle: true };
  }

  const groups = await createPropertyGroups(applicationId, application.hoa_properties, linkedProperties);

  // Make the application visible in the dashboard now that groups exist.
  await supabase
    .from('applications')
    .update({ status: 'payment_confirmed', updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  const isSettlementApp = application.application_type === 'settlement_va' ||
                          application.application_type === 'settlement_nc';
  if (isSettlementApp) {
    const { autoAssignSettlementMCGroups } = await import('../../pages/api/auto-assign-application');
    await autoAssignSettlementMCGroups(applicationId, supabase);
  }

  // Per-group forms BEFORE (slow) PDF generation, so admin workflow forms always exist.
  await createPropertyOwnerFormsForGroups(applicationId, groups);
  await generateDocumentsForAllGroups(applicationId, application);

  return { groups: groups.length, fellBackToSingle: false };
}

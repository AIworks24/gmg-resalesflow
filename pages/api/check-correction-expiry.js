import { createClient } from '@supabase/supabase-js';
import { getStripeKeys } from '../../lib/stripeMode';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48 hours

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron authorization
  const authHeader   = req.headers['authorization'];
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // testWindowMinutes lets you test without waiting 48 hrs.
  // e.g. GET /api/check-correction-expiry?testWindowMinutes=1
  // expires any lock that is older than 1 minute.
  const testWindowMinutes = req.query.testWindowMinutes
    ? parseInt(req.query.testWindowMinutes, 10)
    : null;
  const expiryMs = (testWindowMinutes && testWindowMinutes > 0)
    ? testWindowMinutes * 60 * 1000
    : DEFAULT_EXPIRY_MS;

  const cutoff = new Date(Date.now() - expiryMs).toISOString();

  console.log(
    `check-correction-expiry: scanning for locks older than ${cutoff}` +
    (testWindowMinutes ? ` [testWindowMinutes=${testWindowMinutes}]` : '')
  );

  const { data: expiredApps, error: fetchError } = await supabase
    .from('applications')
    .select(
      'id, processing_locked_reason, correction_stripe_session_id, ' +
      'correction_metadata, hoa_property_id, application_type, notes, ' +
      'is_test_transaction, stripe_session_id'
    )
    .eq('processing_locked', true)
    .lt('processing_locked_at', cutoff);

  if (fetchError) {
    console.error('check-correction-expiry: fetch error:', fetchError);
    return res.status(500).json({ error: 'Failed to fetch locked applications' });
  }

  if (!expiredApps || expiredApps.length === 0) {
    return res.status(200).json({ reverted: 0, message: 'No expired correction locks found' });
  }

  const results = [];

  for (const app of expiredApps) {
    try {
      const isTest = !!app.is_test_transaction
        || (app.stripe_session_id || '').startsWith('cs_test_');
      const keys   = getStripeKeys(isTest);
      const stripe = require('stripe')(keys.secretKey);

      const isPropertyCorrection =
        app.processing_locked_reason === 'pending_property_correction_payment';

      const auditNote =
        `[${new Date().toISOString()}] Correction invoice expired — customer did not pay within ` +
        `${testWindowMinutes ? `${testWindowMinutes} minute(s) [TEST]` : '48 hours'}. ` +
        `Application reverted to original submitted state. Lock cleared automatically.`;

      // 1. Expire the Stripe checkout session if it is still open
      if (app.correction_stripe_session_id) {
        try {
          const session = await stripe.checkout.sessions.retrieve(
            app.correction_stripe_session_id
          );
          if (session.status === 'open') {
            await stripe.checkout.sessions.expire(app.correction_stripe_session_id);
            console.log(
              `check-correction-expiry: expired Stripe session ${app.correction_stripe_session_id} for app ${app.id}`
            );
          }
        } catch (stripeErr) {
          // Session may already be expired — not a hard failure
          console.warn(
            `check-correction-expiry: could not expire Stripe session for app ${app.id}:`,
            stripeErr.message
          );
        }
      }

      // 2a. PROPERTY CORRECTION — full revert of property groups + application fields
      if (isPropertyCorrection) {
        const meta = app.correction_metadata || {};

        if (meta.oldHoaPropertyId) {
          // Delete the property groups that were built for the new (uncorrected) property
          const { error: deleteErr } = await supabase
            .from('application_property_groups')
            .delete()
            .eq('application_id', app.id);

          if (deleteErr) {
            throw new Error(`Failed to delete new property groups: ${deleteErr.message}`);
          }

          // Re-insert the original property groups from correction_metadata
          if (meta.oldPropertyGroups && meta.oldPropertyGroups.length > 0) {
            const restoredGroups = meta.oldPropertyGroups.map(g => ({
              application_id:       app.id,
              property_id:          g.property_id,
              property_name:        g.property_name,
              property_owner_email: g.property_owner_email,
              is_primary:           g.is_primary,
              status:               'pending',
              inspection_status:    'not_started',
              pdf_status:           'not_started',
              email_status:         'not_started',
            }));

            const { error: insertErr } = await supabase
              .from('application_property_groups')
              .insert(restoredGroups);

            if (insertErr) {
              throw new Error(`Failed to restore old property groups: ${insertErr.message}`);
            }
          }

          // Restore application to original state and clear lock
          const { error: updateErr } = await supabase
            .from('applications')
            .update({
              hoa_property_id:              meta.oldHoaPropertyId,
              application_type:             meta.oldApplicationType || app.application_type,
              processing_locked:            false,
              processing_locked_at:         null,
              processing_locked_reason:     null,
              correction_stripe_session_id: null,
              correction_metadata:          null,
              notes:   app.notes ? `${app.notes}\n\n${auditNote}` : auditNote,
              updated_at: new Date().toISOString(),
            })
            .eq('id', app.id);

          if (updateErr) {
            throw new Error(`Failed to revert application record: ${updateErr.message}`);
          }

        } else {
          // Older correction without extended metadata — clear lock only, no structural revert
          const { error: updateErr } = await supabase
            .from('applications')
            .update({
              processing_locked:            false,
              processing_locked_at:         null,
              processing_locked_reason:     null,
              correction_stripe_session_id: null,
              notes:   app.notes ? `${app.notes}\n\n${auditNote}` : auditNote,
              updated_at: new Date().toISOString(),
            })
            .eq('id', app.id);

          if (updateErr) {
            throw new Error(`Failed to clear lock: ${updateErr.message}`);
          }
        }

      // 2b. RUSH UPGRADE — package_type was never modified until payment, so just clear lock
      } else {
        const { error: updateErr } = await supabase
          .from('applications')
          .update({
            processing_locked:            false,
            processing_locked_at:         null,
            processing_locked_reason:     null,
            correction_stripe_session_id: null,
            notes:   app.notes ? `${app.notes}\n\n${auditNote}` : auditNote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', app.id);

        if (updateErr) {
          throw new Error(`Failed to clear rush upgrade lock: ${updateErr.message}`);
        }
      }

      results.push({ id: app.id, status: 'reverted', reason: app.processing_locked_reason });
      console.log(
        `check-correction-expiry: reverted app ${app.id} (${app.processing_locked_reason})`
      );

    } catch (err) {
      console.error(`check-correction-expiry: error processing app ${app.id}:`, err);
      results.push({ id: app.id, status: 'error', error: err.message });
    }
  }

  const reverted = results.filter(r => r.status === 'reverted').length;
  const errors   = results.filter(r => r.status === 'error').length;

  return res.status(200).json({
    reverted,
    errors,
    results,
    message: `Processed ${expiredApps.length} expired lock(s). ${reverted} reverted, ${errors} errored.`,
  });
}

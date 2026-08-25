/**
 * Backfill applications.stripe_amount_total from Stripe for payments that completed before
 * the column existed.
 *
 * The column is nullable and every reader falls back, so this is an optional cleanup — it
 * makes historical rows report the real charge in the admin UI, refund math, and any
 * receipt resend that cannot reach the Stripe API.
 *
 * Usage:
 *   node scripts/backfill-stripe-amount-total.js [--test] [--apply] [--limit=N]
 *
 *   --test      Use test Supabase DB + test Stripe key
 *   --apply     Actually write. WITHOUT THIS THE SCRIPT ONLY REPORTS (default is dry run).
 *   --limit=N   Process at most N applications (default 100)
 *
 * Examples:
 *   node scripts/backfill-stripe-amount-total.js --test --limit=10
 *   node scripts/backfill-stripe-amount-total.js --test --apply
 *   node scripts/backfill-stripe-amount-total.js --apply --limit=500
 */

'use strict';

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');
const Stripe = require('stripe');

const args = process.argv.slice(2);
const isTest = args.includes('--test');
const isApply = args.includes('--apply');
const limitArg = (args.find(a => a.startsWith('--limit=')) || '').replace('--limit=', '');
const LIMIT = Number(limitArg) > 0 ? Number(limitArg) : 100;

function requireEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  console.error(`Missing required environment variable: ${names.join(' or ')}`);
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

const supabase = createClient(supabaseUrl, supabaseKey);
const stripe = new Stripe(stripeKey);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Resolve the real charge for one application: prefer the checkout session's amount_total,
// fall back to the charge on the payment intent.
async function fetchChargedDollars(app) {
  if (app.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(app.stripe_session_id);
      if (session?.amount_total != null) return session.amount_total / 100;
    } catch (err) {
      console.warn(`  ⚠️  session ${app.stripe_session_id}: ${err.message}`);
    }
  }

  if (app.stripe_payment_intent_id) {
    try {
      const pi = await stripe.paymentIntents.retrieve(app.stripe_payment_intent_id);
      if (pi?.latest_charge) {
        const charge = await stripe.charges.retrieve(pi.latest_charge);
        if (charge?.amount != null) return charge.amount / 100;
      }
      if (pi?.amount_received != null) return pi.amount_received / 100;
    } catch (err) {
      console.warn(`  ⚠️  payment intent ${app.stripe_payment_intent_id}: ${err.message}`);
    }
  }

  return null;
}

async function main() {
  console.log(`Mode:   ${isTest ? 'TEST (test DB + test Stripe)' : 'LIVE (production DB + live Stripe)'}`);
  console.log(`Action: ${isApply ? 'APPLY — rows will be updated' : 'DRY RUN — no writes (pass --apply to write)'}`);
  console.log(`DB:     ${supabaseUrl}`);
  console.log(`Limit:  ${LIMIT}\n`);

  const { data: apps, error } = await supabase
    .from('applications')
    .select('id, application_type, total_amount, stripe_amount_total, stripe_session_id, stripe_payment_intent_id')
    .eq('payment_status', 'completed')
    .is('stripe_amount_total', null)
    .or('stripe_session_id.not.is.null,stripe_payment_intent_id.not.is.null')
    .order('id', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  if (!apps || apps.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  console.log(`Found ${apps.length} application(s) to process.\n`);

  let updated = 0, unchanged = 0, drifted = 0, skipped = 0;

  for (const app of apps) {
    const charged = await fetchChargedDollars(app);

    if (charged == null) {
      console.log(`#${app.id} — could not resolve a Stripe amount, skipping`);
      skipped++;
      await sleep(120);
      continue;
    }

    const stored = app.total_amount != null ? Number(app.total_amount) : null;
    const drift = stored != null ? charged - stored : null;
    const driftNote = drift != null && Math.abs(drift) > 0.01
      ? `  ← differs from total_amount ($${stored.toFixed(2)}) by $${drift.toFixed(2)}`
      : '';
    if (driftNote) drifted++; else unchanged++;

    console.log(`#${app.id} [${app.application_type}] charged $${charged.toFixed(2)}${driftNote}`);

    if (isApply) {
      const { error: updateError } = await supabase
        .from('applications')
        .update({ stripe_amount_total: charged })
        .eq('id', app.id);

      if (updateError) {
        console.error(`  ❌ update failed: ${updateError.message}`);
        skipped++;
      } else {
        updated++;
      }
    }

    // Stay well inside Stripe's rate limits.
    await sleep(120);
  }

  console.log('');
  console.log(`Processed:            ${apps.length}`);
  console.log(`Matched total_amount: ${unchanged}`);
  console.log(`Differed:             ${drifted}`);
  console.log(`Skipped:              ${skipped}`);
  console.log(isApply ? `Rows updated:         ${updated}` : 'Dry run — no rows written. Re-run with --apply.');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});

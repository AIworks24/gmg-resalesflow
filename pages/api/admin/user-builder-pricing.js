/**
 * Admin CRUD for per-user Builder pricing offers.
 *
 * One offer row applies to multiple users listed in builder_pricing_offer_users.
 * Admin creates one offer with a list of emails; all listed users share the same
 * price / dates / message. Users can be added or removed from an existing offer
 * via PATCH.
 *
 * Role access:
 *   GET    — admin, staff, accounting
 *   POST   — admin, accounting
 *   PATCH  — admin, accounting
 *   DELETE — admin, accounting
 *
 * GET    ?propertyId=<id>         — list all offers for a property (with users + redemption count)
 * POST   body: { propertyId, emails[], overridePrice, validFrom?, validUntil?, applicantMessage?, notes? }
 * PATCH  body: { id, overridePrice?, validFrom?, validUntil?, active?, applicantMessage?, notes?,
 *                addEmails?[], removeUserIds?[] }
 * DELETE ?id=<uuid>               — soft-deactivate (sets active=false)
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ── Supabase client ────────────────────────────────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ── Auth helpers ───────────────────────────────────────────────────────────────

const WRITE_ROLES = ['admin', 'accounting'];
const READ_ROLES  = ['admin', 'staff', 'accounting'];

async function getCallerProfile(supabase, req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();
  if (!profile) return null;
  return { ...user, role: profile.role };
}

// ── Zod schemas ────────────────────────────────────────────────────────────────

const emailList = z
  .array(z.string().email())
  .min(1, 'At least one email is required');

const isoDate = z.string().datetime({ offset: true }).optional();

const PostSchema = z.object({
  propertyId:       z.number().int().positive(),
  emails:           emailList,
  overridePrice:    z.number().nonnegative().max(50000),
  validFrom:        isoDate,
  validUntil:       z.string().datetime({ offset: true }).nullable().optional(),
  applicantMessage: z.string().max(200).nullable().optional(),
  notes:            z.string().max(1000).nullable().optional(),
});

const PatchSchema = z.object({
  id:               z.string().uuid(),
  overridePrice:    z.number().nonnegative().max(50000).optional(),
  validFrom:        isoDate,
  validUntil:       z.string().datetime({ offset: true }).nullable().optional(),
  active:           z.boolean().optional(),
  applicantMessage: z.string().max(200).nullable().optional(),
  notes:            z.string().max(1000).nullable().optional(),
  addEmails:        z.array(z.string().email()).optional(),
  removeUserIds:    z.array(z.string().uuid()).optional(),
});

// ── Generic error helper ────────────────────────────────────────────────────────

function dbError(res, err, label) {
  console.error(`[user-builder-pricing ${label}]`, err);
  if (err.code === '23505') {
    return res.status(409).json({ error: 'An active offer already exists for one of these users on this property. Deactivate it first.' });
  }
  return res.status(500).json({ error: 'An internal error occurred.' });
}

// ── Resolve emails → user records ──────────────────────────────────────────────

async function resolveEmails(supabase, emails) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .in('email', emails);
  if (error) throw error;
  return data || [];
}

// ── Audit logging ──────────────────────────────────────────────────────────────

async function logAudit(supabase, adminUserId, action, offerId, meta = {}) {
  try {
    await supabase.rpc('log_audit_event', {
      p_admin_user_id:  adminUserId,
      p_acting_user_id: adminUserId,
      p_action:         action,
      p_resource_type:  'builder_pricing',
      p_resource_id:    offerId || null,
      p_metadata:       meta,
    });
  } catch (e) {
    console.error('[user-builder-pricing] audit log failed (non-fatal):', e);
  }
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const supabase = getAdminClient();
  const caller   = await getCallerProfile(supabase, req);

  if (!caller || !READ_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const rawId = parseInt(req.query.propertyId, 10);
    if (isNaN(rawId) || rawId <= 0) {
      return res.status(400).json({ error: 'propertyId must be a positive integer.' });
    }

    const { data: offers, error } = await supabase
      .from('builder_user_property_pricing')
      .select(`
        id, hoa_property_id, override_price,
        valid_from, valid_until, active, applicant_message, notes,
        created_by, created_at, updated_at,
        builder_pricing_offer_users ( id, user_id, created_at )
      `)
      .eq('hoa_property_id', rawId)
      .order('created_at', { ascending: false });

    if (error) return dbError(res, error, 'GET');

    // Collect all user IDs across all offers for a single profiles fetch
    const allUserIds = [
      ...new Set(
        (offers || []).flatMap(o => (o.builder_pricing_offer_users || []).map(r => r.user_id))
      ),
    ];
    const profileMap = {};
    if (allUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .in('id', allUserIds);
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
    }

    // Attach redemption count for each offer
    const withCounts = await Promise.all(
      (offers || []).map(async (offer) => {
        const { count } = await supabase
          .from('builder_pricing_redemptions')
          .select('id', { count: 'exact', head: true })
          .eq('pricing_id', offer.id);
        const users = (offer.builder_pricing_offer_users || []).map(row => {
          const p = profileMap[row.user_id];
          return {
            memberId: row.id,
            userId:   row.user_id,
            email:    p?.email || null,
            name:     p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || null : null,
            addedAt:  row.created_at,
          };
        });
        const { builder_pricing_offer_users: _omit, ...rest } = offer;
        return { ...rest, users, redemption_count: count ?? 0 };
      })
    );

    return res.status(200).json(withCounts);
  }

  // Write operations require admin or accounting
  if (!WRITE_ROLES.includes(caller.role)) {
    return res.status(403).json({ error: 'Forbidden — write requires admin or accounting role.' });
  }

  // ── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const parsed = PostSchema.safeParse({
      ...req.body,
      propertyId:    Number(req.body?.propertyId),
      overridePrice: Number(req.body?.overridePrice),
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { propertyId, emails, overridePrice, validFrom, validUntil, applicantMessage, notes } = parsed.data;

    // Resolve emails to user IDs
    const resolvedUsers = await resolveEmails(supabase, emails);
    if (resolvedUsers.length === 0) {
      return res.status(400).json({ error: 'None of the provided emails match registered accounts.' });
    }

    const notFound = emails.filter(e => !resolvedUsers.find(u => u.email.toLowerCase() === e.toLowerCase()));
    if (notFound.length > 0) {
      return res.status(400).json({ error: `No account found for: ${notFound.join(', ')}` });
    }

    // Create the offer row
    const { data: offer, error: offerErr } = await supabase
      .from('builder_user_property_pricing')
      .insert({
        hoa_property_id:   propertyId,
        override_price:    overridePrice,
        valid_from:        validFrom || new Date().toISOString(),
        valid_until:       validUntil || null,
        active:            true,
        applicant_message: applicantMessage || null,
        notes:             notes || null,
        created_by:        caller.id,
      })
      .select()
      .single();

    if (offerErr) return dbError(res, offerErr, 'POST offer');

    // Insert junction rows (bulk)
    const junctionRows = resolvedUsers.map(u => ({
      offer_id:  offer.id,
      user_id:   u.id,
      added_by:  caller.id,
    }));
    const { error: junctionErr } = await supabase
      .from('builder_pricing_offer_users')
      .insert(junctionRows);

    if (junctionErr) return dbError(res, junctionErr, 'POST junction');

    await logAudit(supabase, caller.id, 'builder_pricing_created', offer.id, {
      property_id: propertyId,
      emails,
      override_price: overridePrice,
      valid_until: validUntil || null,
    });

    return res.status(201).json({ ...offer, users: resolvedUsers.map(u => ({ userId: u.id, email: u.email })) });
  }

  // ── PATCH ───────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const parsed = PatchSchema.safeParse({
      ...req.body,
      overridePrice: req.body?.overridePrice != null ? Number(req.body.overridePrice) : undefined,
    });
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }
    const { id, overridePrice, validFrom, validUntil, active, applicantMessage, notes, addEmails, removeUserIds } = parsed.data;

    // Update the offer row
    const updates = { updated_at: new Date().toISOString() };
    if (overridePrice != null)          updates.override_price    = overridePrice;
    if (validFrom !== undefined)        updates.valid_from         = validFrom;
    if (validUntil !== undefined)       updates.valid_until        = validUntil || null;
    if (active !== undefined)           updates.active             = active;
    if (applicantMessage !== undefined) updates.applicant_message  = applicantMessage || null;
    if (notes !== undefined)            updates.notes              = notes || null;

    const { data: updated, error: updateErr } = await supabase
      .from('builder_user_property_pricing')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) return dbError(res, updateErr, 'PATCH update');

    // Add new users
    if (addEmails && addEmails.length > 0) {
      const newUsers = await resolveEmails(supabase, addEmails);
      const notFound = addEmails.filter(e => !newUsers.find(u => u.email.toLowerCase() === e.toLowerCase()));
      if (notFound.length > 0) {
        return res.status(400).json({ error: `No account found for: ${notFound.join(', ')}` });
      }
      const { error: addErr } = await supabase
        .from('builder_pricing_offer_users')
        .upsert(
          newUsers.map(u => ({ offer_id: id, user_id: u.id, added_by: caller.id })),
          { onConflict: 'offer_id,user_id', ignoreDuplicates: true }
        );
      if (addErr) return dbError(res, addErr, 'PATCH addEmails');
    }

    // Remove users
    if (removeUserIds && removeUserIds.length > 0) {
      const { error: removeErr } = await supabase
        .from('builder_pricing_offer_users')
        .delete()
        .eq('offer_id', id)
        .in('user_id', removeUserIds);
      if (removeErr) return dbError(res, removeErr, 'PATCH removeUserIds');
    }

    await logAudit(supabase, caller.id, 'builder_pricing_updated', id, {
      changes: updates,
      added_emails:      addEmails || [],
      removed_user_ids:  removeUserIds || [],
    });

    return res.status(200).json(updated);
  }

  // ── DELETE (soft-deactivate) ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'id is required.' });
    }
    const idParsed = z.string().uuid().safeParse(id);
    if (!idParsed.success) {
      return res.status(400).json({ error: 'id must be a valid UUID.' });
    }

    const { data, error } = await supabase
      .from('builder_user_property_pricing')
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) return dbError(res, error, 'DELETE');

    await logAudit(supabase, caller.id, 'builder_pricing_deactivated', id, {});

    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}

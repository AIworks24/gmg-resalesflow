/**
 * POST /api/send-info-packet-email
 * Sends the Info Packet (Welcome Package) documents to the requester and buyer email(s).
 * Called automatically by the Stripe webhook on payment completion.
 * Can also be called by admins for manual resend.
 *
 * Document order: welcome_package FIRST, then all other property docs (excluding public_offering_statement)
 */

import { createClient } from '@supabase/supabase-js';
import { sendApprovalEmail } from '../../lib/emailService';

function parseBuyerEmails(buyerEmail) {
  if (!buyerEmail) return [];
  return buyerEmail
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

function isWelcomePackageDocument(doc) {
  const key = String(doc?.document_key || '').toLowerCase();
  const name = String(doc?.document_name || doc?.display_name || doc?.file_name || '').toLowerCase();
  return (
    key === 'welcome_package' ||
    name.includes('welcome package') ||
    name.includes('new owner form')
  );
}

/**
 * Build signed download links for info packet documents.
 * Welcome Package docs are always first; all others follow alphabetically.
 */
async function buildInfoPacketLinks(supabase, propertyId, EXPIRY_30_DAYS) {
  const downloadLinks = [];

  if (!propertyId) return downloadLinks;

  const { data: propertyDocuments } = await supabase
    .from('property_documents')
    .select('*')
    .eq('property_id', propertyId)
    .neq('document_key', 'public_offering_statement')
    .not('file_path', 'is', null);

  if (!propertyDocuments || propertyDocuments.length === 0) return downloadLinks;

  // Sort: welcome package docs first, then everything else alphabetically by document name
  const sorted = [...propertyDocuments].sort((a, b) => {
    const aWelcome = isWelcomePackageDocument(a);
    const bWelcome = isWelcomePackageDocument(b);
    if (aWelcome && !bWelcome) return -1;
    if (!aWelcome && bWelcome) return 1;
    const nameA = (a.document_name || a.display_name || '').toLowerCase();
    const nameB = (b.document_name || b.display_name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  for (const doc of sorted) {
    try {
      const { data: urlData, error } = await supabase.storage
        .from('bucket0')
        .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);
      if (error || !urlData?.signedUrl) continue;
      downloadLinks.push({
        filename: doc.display_name || doc.document_name || doc.file_name || 'Property Document',
        downloadUrl: urlData.signedUrl,
        type: 'document',
        description: doc.document_name || 'Property Document',
        size: 'Unknown',
      });
    } catch (err) {
      console.error('[send-info-packet-email] Failed to sign doc URL:', err);
    }
  }

  return downloadLinks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // This endpoint is called internally (from webhook) with service-role authorization
  // or by admins. Validate a shared internal secret to prevent unauthorized access.
  const authHeader = req.headers['authorization'];
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const isInternalCall = internalSecret && authHeader === `Bearer ${internalSecret}`;

  // Allow admin calls via cookie session as well (handled by caller)
  // For simplicity, require the internal secret for webhook calls
  if (!isInternalCall) {
    // Check if there's a valid admin session
    const { createPagesServerClient } = await import('@supabase/auth-helpers-nextjs');
    const supabaseSession = createPagesServerClient({ req, res });
    const { data: { session } } = await supabaseSession.auth.getSession();
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { applicationId } = req.body;
  if (!applicationId) {
    return res.status(400).json({ error: 'applicationId is required' });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: application, error: appError } = await supabase
    .from('applications')
    .select(`
      id, submitter_email, submitter_name, property_address, hoa_property_id, buyer_email,
      application_type, application_property_groups(*),
      hoa_properties(id, name)
    `)
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    console.error('[send-info-packet-email] Application not found:', appError);
    return res.status(404).json({ error: 'Application not found' });
  }

  const EXPIRY_30_DAYS = 30 * 24 * 60 * 60;
  const buyerEmails = parseBuyerEmails(application.buyer_email);
  const propertyGroups = application.application_property_groups || [];
  const isMultiCommunity = propertyGroups.length > 1;

  try {
    if (isMultiCommunity) {
      // Send one email per associated community
      for (const group of propertyGroups) {
        const propertyId = group.property_id || application.hoa_property_id;
        const hoaName = group.property_name || application.hoa_properties?.name;
        const downloadLinks = await buildInfoPacketLinks(supabase, propertyId, EXPIRY_30_DAYS);

        await sendApprovalEmail({
          to: application.submitter_email,
          submitterName: application.submitter_name,
          propertyAddress: application.property_address,
          hoaName,
          pdfUrl: null,
          applicationId,
          downloadLinks,
          cc: buyerEmails,
          customSubject: `Your Info Packet for ${hoaName} is Ready`,
          customTitle: `Your Info Packet for ${hoaName} is Ready!`,
          customMessage: `Your Info Packet (Welcome Package) documents for <strong>${application.property_address}</strong> — <strong>${hoaName}</strong> are now available for download.`,
        });

        // Mark group as emailed
        await supabase
          .from('application_property_groups')
          .update({
            email_status: 'completed',
            email_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', group.id);
      }
    } else {
      const propertyId = application.hoa_property_id;
      const hoaName = application.hoa_properties?.name;
      const downloadLinks = await buildInfoPacketLinks(supabase, propertyId, EXPIRY_30_DAYS);

      await sendApprovalEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name,
        propertyAddress: application.property_address,
        hoaName,
        pdfUrl: null,
        applicationId,
        downloadLinks,
        cc: buyerEmails,
        customSubject: `Your Info Packet for ${application.property_address} is Ready`,
        customTitle: 'Your Info Packet is Ready!',
        customMessage: `Your Info Packet (Welcome Package) documents for <strong>${application.property_address}</strong> in <strong>${hoaName}</strong> are now available for download.`,
      });
    }

    // Mark application as completed and email sent
    await supabase
      .from('applications')
      .update({
        status: 'completed',
        email_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-info-packet-email] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send info packet email' });
  }
}

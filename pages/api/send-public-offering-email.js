/**
 * POST /api/send-public-offering-email
 * Sends the Public Offering Statement document to the requester.
 * Called automatically by the Stripe webhook on payment completion.
 * Can also be called by admins for manual resend.
 */

import { createClient } from '@supabase/supabase-js';
import { sendApprovalEmail } from '../../lib/emailService';

/**
 * Build signed download links for the public offering statement document(s).
 */
async function buildPublicOfferingLinks(supabase, propertyId, EXPIRY_30_DAYS) {
  const downloadLinks = [];

  if (!propertyId) return downloadLinks;

  const { data: propertyDocuments } = await supabase
    .from('property_documents')
    .select('*')
    .eq('property_id', propertyId)
    .eq('document_key', 'public_offering_statement')
    .not('file_path', 'is', null);

  if (!propertyDocuments || propertyDocuments.length === 0) return downloadLinks;

  for (const doc of propertyDocuments) {
    try {
      const { data: urlData, error } = await supabase.storage
        .from('bucket0')
        .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);
      if (error || !urlData?.signedUrl) continue;
      downloadLinks.push({
        filename: doc.display_name || doc.document_name || doc.file_name || 'Public Offering Statement',
        downloadUrl: urlData.signedUrl,
        type: 'document',
        description: doc.document_name || 'Public Offering Statement',
        size: 'Unknown',
      });
    } catch (err) {
      console.error('[send-public-offering-email] Failed to sign doc URL:', err);
    }
  }

  return downloadLinks;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers['authorization'];
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const isInternalCall = internalSecret && authHeader === `Bearer ${internalSecret}`;

  if (!isInternalCall) {
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
      id, submitter_email, submitter_name, property_address, hoa_property_id,
      application_type, buyer_email, notes, email_completed_at,
      hoa_properties(id, name)
    `)
    .eq('id', applicationId)
    .single();

  if (appError || !application) {
    console.error('[send-public-offering-email] Application not found:', appError);
    return res.status(404).json({ error: 'Application not found' });
  }

  const EXPIRY_30_DAYS = 30 * 24 * 60 * 60;
  const propertyId = application.hoa_property_id;
  const hoaName = application.hoa_properties?.name;
  const downloadLinks = await buildPublicOfferingLinks(supabase, propertyId, EXPIRY_30_DAYS);

  const addressLine = application.property_address
    ? `for <strong>${application.property_address}</strong> in <strong>${hoaName}</strong>`
    : `for <strong>${hoaName}</strong>`;

  const buyerEmails = application.buyer_email
    ? application.buyer_email.split(',').map(e => e.trim()).filter(Boolean)
    : [];

  try {
    await sendApprovalEmail({
      to: application.submitter_email,
      submitterName: application.submitter_name,
      propertyAddress: application.property_address || hoaName,
      hoaName,
      pdfUrl: null,
      applicationId,
      downloadLinks,
      cc: buyerEmails,
      customSubject: `Your Public Offering Statement for ${hoaName} is Ready`,
      customTitle: 'Your Public Offering Statement is Ready!',
      customMessage: `Your Public Offering Statement documents ${addressLine} are now available for download.`,
    });

    // Log to process history
    const isResend = !!application.email_completed_at;
    const auditVerb = isResend ? 'resent' : 'sent';
    const auditNote = `[${new Date().toISOString()}] Public Offering Statement ${auditVerb} to ${application.submitter_email}.`;
    const updatedNotes = application.notes ? `${application.notes}\n\n${auditNote}` : auditNote;

    await supabase
      .from('applications')
      .update({
        status: 'completed',
        email_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: updatedNotes,
      })
      .eq('id', applicationId);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[send-public-offering-email] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send public offering email' });
  }
}

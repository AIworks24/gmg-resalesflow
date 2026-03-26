/**
 * POST /api/requester-resend-email
 * Allows a requester to resend documents for their own completed application.
 * Only works if the application is completed and was previously emailed by an admin/staff/accounting user.
 */

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { sendApprovalEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Use service role for data fetching
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get application — verifying ownership by user_id
    const { data: application, error: appError } = await supabaseAdmin
      .from('applications')
      .select(
        `*, hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
        application_property_groups(*)`
      )
      .eq('id', applicationId)
      .eq('user_id', session.user.id) // ownership check
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const isSettlementApp =
      application.submitter_type === 'settlement' ||
      application.application_type?.startsWith('settlement');

    const propertyGroups = application.application_property_groups || [];
    const isMultiCommunity =
      application.application_type === 'multi_community' ||
      (application.application_type?.startsWith('settlement') && propertyGroups.length > 1) ||
      propertyGroups.length > 1;

    // For single-property apps, require completed/approved status.
    // For multi-community apps, completion is tracked at the group level — skip this check.
    if (!isMultiCommunity) {
      const completedStatuses = ['completed', 'approved'];
      if (!completedStatuses.includes(application.status)) {
        return res.status(400).json({ error: 'Application is not completed' });
      }
    }

    // Verify the email was previously sent by admin/staff/accounting
    // For single-property apps: email_completed_at must be set
    // For multi-community: at least one group must have email_completed_at set
    if (isMultiCommunity) {
      const anyGroupEmailed = propertyGroups.some(
        (g) => g.email_completed_at || g.email_status === 'completed'
      );
      if (!anyGroupEmailed) {
        return res
          .status(400)
          .json({ error: 'Documents have not been sent yet by an administrator' });
      }
    } else {
      if (!application.email_completed_at) {
        return res
          .status(400)
          .json({ error: 'Documents have not been sent yet by an administrator' });
      }
    }

    // Build audit note for process history (requester initiated)
    const requesterName = application.submitter_name || application.submitter_email || 'requester';
    const noteTs        = new Date().toISOString();
    const auditNote     = `[${noteTs}] Email resent by ${requesterName}.`;
    const updatedNotes  = application.notes ? `${application.notes}\n\n${auditNote}` : auditNote;

    // --- For info packet apps, delegate to info packet email ---
    if (application.application_type === 'info_packet') {
      return await handleInfoPacketResend(req, res, application, supabaseAdmin, updatedNotes);
    }

    // --- For settlement apps, delegate to settlement email logic ---
    if (isSettlementApp) {
      return await handleSettlementResend(req, res, application, propertyGroups, supabaseAdmin, updatedNotes);
    }

    // --- Non-settlement resend ---
    const EXPIRY_30_DAYS = 30 * 24 * 60 * 60;

    if (isMultiCommunity) {
      // Resend email for each property group that was previously emailed
      const groupsToResend = propertyGroups.filter(
        (g) => g.email_completed_at || g.email_status === 'completed'
      );

      for (const group of groupsToResend) {
        const pdfUrl = group.pdf_url;
        if (!pdfUrl) continue;

        const downloadLinks = await buildDownloadLinks(
          supabaseAdmin,
          application,
          applicationId,
          pdfUrl,
          group.property_id || application.hoa_property_id,
          true,
          group.property_name,
          EXPIRY_30_DAYS
        );

        const buyerEmails = parseBuyerEmails(application.buyer_email);
        const primaryPropertyName = application.hoa_properties.name;
        const displayHoaName = group.property_name || primaryPropertyName;

        try {
          await sendApprovalEmail({
            to: application.submitter_email,
            submitterName: application.submitter_name,
            propertyAddress: application.property_address,
            hoaName: displayHoaName,
            pdfUrl,
            applicationId,
            downloadLinks,
            comments: application.comments || null,
            cc: buyerEmails,
            customSubject: `Your Resale Certificate for ${displayHoaName} is Ready for Download`,
            customTitle: `Your Resale Certificate for ${displayHoaName} is Ready!`,
            customMessage: `Your resale certificate and supporting documents for <strong>${application.property_address}</strong> in <strong>${primaryPropertyName}</strong> are now ready for download. This package contains documents specific to <strong>${displayHoaName}</strong>.`,
          });
        } catch (emailError) {
          console.error('[requester-resend] Email send failed for group', group.id, emailError);
        }

        // Update group email timestamp
        await supabaseAdmin
          .from('application_property_groups')
          .update({
            email_status: 'completed',
            email_completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', group.id);
      }

      await supabaseAdmin.from('applications').update({ notes: updatedNotes, updated_at: noteTs }).eq('id', applicationId);
      return res.status(200).json({ success: true });
    }

    // Single-property non-settlement
    const pdfUrl = application.pdf_url;
    if (!pdfUrl) {
      return res.status(400).json({ error: 'PDF has not been generated yet' });
    }

    const downloadLinks = await buildDownloadLinks(
      supabaseAdmin,
      application,
      applicationId,
      pdfUrl,
      application.hoa_property_id,
      false,
      null,
      EXPIRY_30_DAYS
    );

    const buyerEmails = parseBuyerEmails(application.buyer_email);

    try {
      await sendApprovalEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name,
        propertyAddress: application.property_address,
        hoaName: application.hoa_properties.name,
        pdfUrl,
        applicationId,
        downloadLinks,
        comments: application.comments || null,
        cc: buyerEmails,
      });
    } catch (emailError) {
      console.error('[requester-resend] Email send failed:', emailError);
    }

    await supabaseAdmin
      .from('applications')
      .update({ email_completed_at: noteTs, notes: updatedNotes, updated_at: noteTs })
      .eq('id', applicationId);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('[requester-resend]', error);
    return res.status(500).json({ error: error.message || 'Failed to resend email' });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBuyerEmails(buyerEmail) {
  if (!buyerEmail) return [];
  if (buyerEmail.includes(',')) {
    return buyerEmail.split(',').map((e) => e.trim()).filter(Boolean);
  }
  return [buyerEmail.trim()].filter(Boolean);
}

async function buildDownloadLinks(
  supabase,
  application,
  applicationId,
  pdfUrl,
  propertyIdForDocs,
  isPropertySpecific,
  propertyName,
  EXPIRY_30_DAYS
) {
  const downloadLinks = [];

  // 1. Main resale certificate PDF
  if (pdfUrl) {
    try {
      const urlParts = pdfUrl.split('/');
      let existingFilename =
        urlParts[urlParts.length - 1] ||
        (isPropertySpecific
          ? `Resale_Certificate_${(propertyName || '').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
          : `Resale_Certificate_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`);
      existingFilename = existingFilename.split('?')[0].split('#')[0].replace(/^\d+-/, '');

      downloadLinks.push({
        filename: existingFilename,
        downloadUrl: pdfUrl,
        type: 'pdf',
        description: 'Virginia Resale Certificate',
      });
    } catch (err) {
      console.error('[requester-resend] Failed to add PDF link:', err);
    }
  }

  // 2. Inspection form PDF (regenerate from stored form data)
  const inspectionForm = application.property_owner_forms?.find(
    (f) => f.form_type === 'inspection_form'
  );
  if (inspectionForm && inspectionForm.response_data) {
    try {
      const filename = `Property_Inspection_Form_${application.property_address.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      const formData = inspectionForm.response_data;

      const React = await import('react');
      const ReactPDF = await import('@react-pdf/renderer');
      const { InspectionFormPdfDocument } = await import(
        '../../lib/components/InspectionFormPdfDocument.js'
      );

      let logoBase64 = '';
      try {
        const fs = require('fs');
        const path = require('path');
        const logoPath = path.join(process.cwd(), 'assets', 'company_logo.png');
        if (fs.existsSync(logoPath)) {
          const logoBuffer = fs.readFileSync(logoPath);
          logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }
      } catch (err) {
        console.warn('[requester-resend] Could not load company logo:', err);
      }

      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const pdfElement = React.createElement(InspectionFormPdfDocument, {
        propertyAddress: application.property_address,
        hoaName: application.hoa_properties.name,
        generatedDate: null,
        formStatus: inspectionForm.status,
        completedAt: inspectionForm.completed_at,
        formData,
        logoBase64,
        timezone: userTimezone,
      });

      const stream = await ReactPDF.default.renderToStream(pdfElement);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      const pdfBuffer = Buffer.concat(chunks);

      const storagePath = `inspection-forms/${applicationId}/inspection-form-${applicationId}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('bucket0')
        .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('bucket0').getPublicUrl(storagePath);
        downloadLinks.push({
          filename,
          downloadUrl: urlData.publicUrl,
          type: 'pdf',
          description: 'Property Inspection Form',
          size: pdfBuffer.byteLength,
        });
      }
    } catch (err) {
      console.error('[requester-resend] Failed to generate inspection form PDF:', err);
    }
  }

  // 3. Property documents
  if (propertyIdForDocs) {
    try {
      const { data: propertyDocuments } = await supabase
        .from('property_documents')
        .select('*')
        .eq('property_id', propertyIdForDocs)
        .neq('document_key', 'public_offering_statement')
        .not('file_path', 'is', null);

      if (propertyDocuments && propertyDocuments.length > 0) {
        const { sortDocumentsByEmailOrder } = await import('../../lib/documentOrder');
        const sortedDocuments = sortDocumentsByEmailOrder(propertyDocuments);

        for (const doc of sortedDocuments) {
          try {
            const { data: urlData, error: docUrlError } = await supabase.storage
              .from('bucket0')
              .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);
            if (docUrlError) continue;
            const displayName = doc.display_name || doc.document_name || doc.file_name || 'Property Document';
            downloadLinks.push({
              filename: displayName,
              downloadUrl: urlData.signedUrl,
              type: 'document',
              description: doc.document_name || 'Property Supporting Document',
              size: 'Unknown',
            });
          } catch (err) {
            console.error('[requester-resend] Failed to add property doc link:', err);
          }
        }
      } else {
        // Fallback: legacy storage path
        try {
          const { data: filesList } = await supabase.storage
            .from('bucket0')
            .list(`property_files/${propertyIdForDocs}`, { limit: 100, offset: 0 });

          for (const file of filesList || []) {
            if (
              file.name.toLowerCase().includes('public_offering') ||
              file.name.toLowerCase().includes('public_offering_statement')
            )
              continue;
            try {
              const { data: urlData } = await supabase.storage
                .from('bucket0')
                .createSignedUrl(
                  `property_files/${propertyIdForDocs}/${file.name}`,
                  EXPIRY_30_DAYS,
                  { download: file.name.split('_').slice(1).join('_') }
                );
              if (urlData?.signedUrl) {
                downloadLinks.push({
                  filename: file.name.split('_').slice(1).join('_'),
                  downloadUrl: urlData.signedUrl,
                  type: 'document',
                  description: 'Property Supporting Document',
                  size: file.metadata?.size || 'Unknown',
                });
              }
            } catch (err) {
              console.error('[requester-resend] Failed to add legacy file link:', err);
            }
          }
        } catch (err) {
          console.error('[requester-resend] Error in fallback property files listing:', err);
        }
      }
    } catch (err) {
      console.error('[requester-resend] Error fetching property documents:', err);
    }
  }

  // 4. Application-specific attachments
  try {
    const { data: appAttachmentsList } = await supabase.storage
      .from('bucket0')
      .list(`application_attachments/${applicationId}`, { limit: 100, offset: 0 });
    for (const file of appAttachmentsList || []) {
      const { data: urlData } = await supabase.storage
        .from('bucket0')
        .createSignedUrl(`application_attachments/${applicationId}/${file.name}`, EXPIRY_30_DAYS);
      if (urlData?.signedUrl) {
        downloadLinks.push({
          filename: file.name.replace(/^\d+_/, ''),
          downloadUrl: urlData.signedUrl,
          type: 'document',
          description: 'Additional Document',
          size: file.metadata?.size || 'Unknown',
        });
      }
    }
  } catch (err) {
    console.error('[requester-resend] Error adding application attachments:', err);
  }

  return downloadLinks;
}

async function handleInfoPacketResend(req, res, application, supabaseAdmin, updatedNotes) {
  const applicationId = application.id;
  const EXPIRY_30_DAYS = 30 * 24 * 60 * 60;
  const buyerEmails = parseBuyerEmails(application.buyer_email);
  const propertyGroups = application.application_property_groups || [];
  const isMultiCommunity = propertyGroups.length > 1;

  function isWelcomePackageDocument(doc) {
    const key = String(doc?.document_key || '').toLowerCase();
    const name = String(doc?.document_name || doc?.display_name || doc?.file_name || '').toLowerCase();
    return (
      key === 'welcome_package' ||
      name.includes('welcome package') ||
      name.includes('new owner form')
    );
  }

  function sortInfoPacketDocs(docs) {
    return [...docs].sort((a, b) => {
      const aWelcome = isWelcomePackageDocument(a);
      const bWelcome = isWelcomePackageDocument(b);
      if (aWelcome && !bWelcome) return -1;
      if (!aWelcome && bWelcome) return 1;
      const nameA = String(a.document_name || a.display_name || '').toLowerCase();
      const nameB = String(b.document_name || b.display_name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }

  async function buildInfoPacketLinks(propertyId) {
    const links = [];
    const { data: docs } = await supabaseAdmin
      .from('property_documents')
      .select('*')
      .eq('property_id', propertyId)
      .neq('document_key', 'public_offering_statement')
      .not('file_path', 'is', null);

    for (const doc of sortInfoPacketDocs(docs || [])) {
      try {
        const { data: urlData } = await supabaseAdmin.storage
          .from('bucket0')
          .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);
        if (urlData?.signedUrl) {
          links.push({
            filename: doc.display_name || doc.document_name || 'Property Document',
            downloadUrl: urlData.signedUrl,
            type: 'document',
            description: doc.document_name || 'Property Document',
            size: 'Unknown',
          });
        }
      } catch (err) {
        console.error('[requester-resend info_packet] Failed to sign doc:', err);
      }
    }
    return links;
  }

  if (isMultiCommunity) {
    const groupsToResend = propertyGroups.filter(
      (g) => g.email_completed_at || g.email_status === 'completed'
    );
    for (const group of groupsToResend) {
      const propertyId = group.property_id || application.hoa_property_id;
      const hoaName = group.property_name || application.hoa_properties.name;
      const downloadLinks = await buildInfoPacketLinks(propertyId);
      try {
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
      } catch (emailError) {
        console.error('[requester-resend info_packet] Email send failed for group', group.id, emailError);
      }
      await supabaseAdmin
        .from('application_property_groups')
        .update({ email_status: 'completed', email_completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', group.id);
    }
    await supabaseAdmin.from('applications').update({ notes: updatedNotes, updated_at: new Date().toISOString() }).eq('id', applicationId);
  } else {
    const hoaName = application.hoa_properties.name;
    const downloadLinks = await buildInfoPacketLinks(application.hoa_property_id);
    try {
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
    } catch (emailError) {
      console.error('[requester-resend info_packet] Email send failed:', emailError);
    }
    await supabaseAdmin
      .from('applications')
      .update({ email_completed_at: new Date().toISOString(), notes: updatedNotes, updated_at: new Date().toISOString() })
      .eq('id', applicationId);
  }

  return res.status(200).json({ success: true });
}

async function handleSettlementResend(req, res, application, propertyGroups, supabaseAdmin, updatedNotes) {
  // Import settlement email service
  const { sendSettlementFormEmail } = await import('../../lib/emailService');

  const applicationId = application.id;
  const EXPIRY_30_DAYS = 30 * 24 * 60 * 60;

  const isMultiCommunity =
    application.application_type === 'multi_community' ||
    (application.application_type?.startsWith('settlement') && propertyGroups.length > 1) ||
    propertyGroups.length > 1;

  const groupsToResend = isMultiCommunity
    ? propertyGroups.filter((g) => g.email_completed_at || g.email_status === 'completed')
    : propertyGroups;

  if (isMultiCommunity && groupsToResend.length === 0) {
    return res
      .status(400)
      .json({ error: 'Documents have not been sent yet by an administrator' });
  }

  for (const group of groupsToResend.length > 0 ? groupsToResend : [{ id: null }]) {
    const pdfUrl =
      group.pdf_url || application.settlement_pdf_url || application.pdf_url;
    if (!pdfUrl) continue;

    const downloadLinks = [];

    // Main settlement PDF
    try {
      const urlParts = pdfUrl.split('/');
      let filename = urlParts[urlParts.length - 1] || 'Settlement_Form.pdf';
      filename = filename.split('?')[0].split('#')[0].replace(/^\d+-/, '');
      downloadLinks.push({
        filename,
        downloadUrl: pdfUrl,
        type: 'pdf',
        description: 'Settlement Form',
      });
    } catch (err) {
      console.error('[requester-resend settlement] Failed to add settlement PDF link:', err);
    }

    // For NC settlements: attach property documents
    const propertyIdForDocs = group.property_id || application.hoa_property_id;
    const isNC =
      group.property_location?.toUpperCase().includes('NC') ||
      group.property_location?.toUpperCase().includes('NORTH CAROLINA');

    if (isNC && propertyIdForDocs) {
      try {
        const { data: propertyDocuments } = await supabaseAdmin
          .from('property_documents')
          .select('*')
          .eq('property_id', propertyIdForDocs)
          .not('file_path', 'is', null);

        if (propertyDocuments && propertyDocuments.length > 0) {
          const { sortDocumentsByEmailOrder } = await import('../../lib/documentOrder');
          const sortedDocuments = sortDocumentsByEmailOrder(propertyDocuments);
          for (const doc of sortedDocuments) {
            try {
              const { data: urlData } = await supabaseAdmin.storage
                .from('bucket0')
                .createSignedUrl(doc.file_path, EXPIRY_30_DAYS);
              if (urlData?.signedUrl) {
                downloadLinks.push({
                  filename: doc.display_name || doc.document_name || 'Property Document',
                  downloadUrl: urlData.signedUrl,
                  type: 'document',
                  description: doc.document_name || 'Property Supporting Document',
                  size: 'Unknown',
                });
              }
            } catch (err) {
              console.error('[requester-resend settlement] Failed to add NC property doc:', err);
            }
          }
        }
      } catch (err) {
        console.error('[requester-resend settlement] Error fetching NC property docs:', err);
      }
    }

    const buyerEmails = parseBuyerEmails(application.buyer_email);
    const hoaName = group.property_name || application.hoa_properties.name;

    try {
      await sendSettlementFormEmail({
        to: application.submitter_email,
        submitterName: application.submitter_name,
        propertyAddress: application.property_address,
        hoaName,
        pdfUrl,
        applicationId,
        downloadLinks,
        cc: buyerEmails,
      });
    } catch (emailError) {
      console.error('[requester-resend settlement] Email send failed:', emailError);
    }

    const settlementTs = new Date().toISOString();
    if (group.id) {
      await supabaseAdmin
        .from('application_property_groups')
        .update({
          email_status: 'completed',
          email_completed_at: settlementTs,
          updated_at: settlementTs,
        })
        .eq('id', group.id);
      await supabaseAdmin
        .from('applications')
        .update({ notes: updatedNotes, updated_at: settlementTs })
        .eq('id', applicationId);
    } else {
      await supabaseAdmin
        .from('applications')
        .update({ email_completed_at: settlementTs, notes: updatedNotes, updated_at: settlementTs })
        .eq('id', applicationId);
    }
  }

  return res.status(200).json({ success: true });
}

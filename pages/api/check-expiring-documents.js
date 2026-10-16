import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../../lib/emailService';
import { parseEmails } from '../../lib/emailUtils';
import { runWithConcurrency } from '../../lib/concurrency';
import { onlyActivePropertyDocs } from '../../lib/propertyStatus';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Microsoft Graph allows ~4 concurrent requests per mailbox; stay under it so sends aren't throttled
const EMAIL_CONCURRENCY = 2;

// Skip fake/placeholder emails
const isFakeEmail = (email) => {
  if (!email || typeof email !== 'string') return true;
  const normalized = email.toLowerCase().trim();
  const fakePatterns = [
    /^test@/i, /@example\./i, /@test\./i, /@placeholder\./i, /@dummy\./i,
    /^noreply@/i, /^no-reply@/i, /^fake@/i, /^placeholder@/i, /^dummy@/i,
    /^temp@/i, /^temporary@/i, /@localhost/i, /@test\.com$/i,
    /@example\.com$/i, /@example\.org$/i, /@example\.net$/i,
  ];
  return fakePatterns.some(pattern => pattern.test(normalized)) ||
         normalized.length < 5 || !normalized.includes('@') || !normalized.includes('.');
};

export default async function handler(req, res) {
  // This endpoint should be called by a cron job daily
  // You can use services like Vercel Cron, GitHub Actions, or external cron services
  
  // Vercel cron jobs send GET requests, but we also allow POST for manual testing
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication - Vercel sends CRON_SECRET in Authorization header
  const authHeader = req.headers['authorization'];
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  
  if (!process.env.CRON_SECRET) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  
  if (authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all documents expiring within 30 days, but filter for >20 days (21-30 days) for admin notifications
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const twentyDaysFromNow = new Date();
    twentyDaysFromNow.setDate(twentyDaysFromNow.getDate() + 20);
    
    const today = new Date().toISOString().split('T')[0];
    const twentyDaysLater = twentyDaysFromNow.toISOString().split('T')[0];
    const thirtyDaysLater = thirtyDaysFromNow.toISOString().split('T')[0];

    const { data: allExpiringDocs, error } = await supabase
      .from('property_documents')
      .select(`
        *,
        property:property_id (
          id,
          name,
          location,
          property_owner_email,
          property_owner_name,
          deleted_at
        )
      `)
      .gte('expiration_date', today)
      .lte('expiration_date', thirtyDaysLater)
      .eq('is_not_applicable', false)
      .not('expiration_date', 'is', null);

    if (error) throw error;

    // Retired properties get no expiring-document alerts (admin summary or owner emails)
    const expiringDocs = onlyActivePropertyDocs(allExpiringDocs);

    // Generate base URL once for all document links
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Group documents by property
    const propertiesWithExpiringDocs = {};
    
    expiringDocs.forEach(doc => {
      if (!doc.property) return;
      
      const propertyId = doc.property.id;
      if (!propertiesWithExpiringDocs[propertyId]) {
        propertiesWithExpiringDocs[propertyId] = {
          property: doc.property,
          documents: []
        };
      }
      
      const daysUntilExpiration = Math.ceil(
        (new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24)
      );
      
      // Use display_name or file_name if available, otherwise fall back to document_name
      const specificFileName = doc.display_name || doc.file_name || doc.document_name;
      const isSpecificFile = doc.display_name || doc.file_name;
      
      // Generate URL to property document page
      const documentUrl = `${baseUrl}/admin/property-files/${propertyId}?docKey=${encodeURIComponent(doc.document_key)}`;
      
      propertiesWithExpiringDocs[propertyId].documents.push({
        document_type: doc.document_name, // The document category (e.g., "VA Appendix 02/Architectural Guidelines")
        file_name: specificFileName, // The specific file name
        is_specific: isSpecificFile, // Whether this is a specific file or just the category
        expiration_date: doc.expiration_date,
        days_until_expiration: daysUntilExpiration,
        document_key: doc.document_key, // The document key for URL generation
        document_id: doc.id, // Document ID
        document_url: documentUrl // Direct link to the document section
      });
    });

    // Admin email notification - include ALL documents expiring within 30 days
    // (not just >20 days, so admins see urgent documents too)
    // Emails to send: { kind: 'admin' | 'owner', label, to, subject, html }
    const emails = [];
    
    // Collect all documents for admin summary (all documents within 30 days)
    const allAdminDocs = [];
    for (const propertyData of Object.values(propertiesWithExpiringDocs)) {
      const { property, documents } = propertyData;
      documents.forEach(doc => {
        allAdminDocs.push({
          property_name: property.name,
          property_location: property.location || 'N/A',
          property_owner_name: property.property_owner_name || 'N/A',
          property_id: property.id,
          document_type: doc.document_type,
          file_name: doc.file_name,
          is_specific: doc.is_specific,
          expiration_date: doc.expiration_date,
          days_until_expiration: doc.days_until_expiration,
          document_key: doc.document_key,
          document_id: doc.document_id,
          document_url: doc.document_url
        });
      });
    }
    
    // Send admin email if there are any expiring documents
    if (allAdminDocs && allAdminDocs.length > 0) {
      // Get admin email from environment variable or use default
      const adminEmail = process.env.ADMIN_EMAIL || 'resales@gmgva.com';

      // Sort by expiration date
      allAdminDocs.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));

      // Create document list HTML for admin email with urgency highlighting
      const adminDocumentListHtml = allAdminDocs.map(doc => {
        const displayName = doc.is_specific 
          ? `<strong><a href="${doc.document_url}" style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#059669'}; text-decoration: none; font-weight: 600;">${doc.document_type}</a></strong><br/><span style="color: #6b7280; font-size: 0.9em;">File: ${doc.file_name}</span>`
          : `<strong><a href="${doc.document_url}" style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#059669'}; text-decoration: none; font-weight: 600;">${doc.document_type}</a></strong>`;
        
        // Determine urgency level and styling
        let urgencyColor = '#10b981'; // green for >20 days
        let urgencyBg = '#f0fdf4'; // light green
        let urgencyText = '';
        
        if (doc.days_until_expiration <= 7) {
          urgencyColor = '#dc2626'; // red for urgent
          urgencyBg = '#fef2f2'; // light red
          urgencyText = ' 🔴 URGENT';
        } else if (doc.days_until_expiration <= 14) {
          urgencyColor = '#f59e0b'; // orange for soon
          urgencyBg = '#fffbeb'; // light orange
          urgencyText = ' ⚠️ SOON';
        } else if (doc.days_until_expiration <= 20) {
          urgencyColor = '#3b82f6'; // blue for approaching
          urgencyBg = '#eff6ff'; // light blue
          urgencyText = ' ⚡ APPROACHING';
        }
        
        return `
        <tr style="background-color: ${urgencyBg};">
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            ${displayName}
            <br/><a href="${doc.document_url}" style="color: #3b82f6; text-decoration: none; font-size: 0.85em; margin-top: 4px; display: inline-block;">🔗 View Document →</a>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            ${doc.property_name}<br/><span style="color: #6b7280; font-size: 0.9em;">${doc.property_location}</span>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            ${new Date(doc.expiration_date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <strong style="color: ${urgencyColor}; font-size: 14px;">${doc.days_until_expiration} ${doc.days_until_expiration === 1 ? 'day' : 'days'}${urgencyText}</strong>
          </td>
        </tr>
      `;
      }).join('');

      const documentCount = allAdminDocs.length;
      const documentText = documentCount === 1 ? 'document' : 'documents';
      
      // Count urgent documents
      const urgentCount = allAdminDocs.filter(doc => doc.days_until_expiration <= 7).length;
      const soonCount = allAdminDocs.filter(doc => doc.days_until_expiration > 7 && doc.days_until_expiration <= 14).length;
      const approachingCount = allAdminDocs.filter(doc => doc.days_until_expiration > 14 && doc.days_until_expiration <= 20).length;
      
      // Determine header color based on urgency
      let headerGradient = 'linear-gradient(135deg, #10b981 0%, #059669 100%)'; // green default
      if (urgentCount > 0) {
        headerGradient = 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)'; // red for urgent
      } else if (soonCount > 0) {
        headerGradient = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'; // orange for soon
      } else if (approachingCount > 0) {
        headerGradient = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'; // blue for approaching
      }

      // Admin email HTML template
      const adminEmailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: ${headerGradient}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 24px; font-weight: 600;">Admin: Document Expiration Alert</h2>
            <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.95;">${documentCount} ${documentText} expiring within 30 days</p>
            ${urgentCount > 0 ? `<p style="margin: 10px 0 0; font-size: 16px; font-weight: 600;">🔴 ${urgentCount} URGENT (≤7 days) | ⚠️ ${soonCount} Soon (8-14 days) | ⚡ ${approachingCount} Approaching (15-20 days)</p>` : ''}
          </div>
          
          <div style="padding: 30px; background-color: #f9fafb;">
            <p style="margin: 0 0 15px; color: #374151; font-size: 15px; line-height: 1.6;">
              Dear <strong>Admin Team</strong>,
            </p>
            
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.6;">
              This is an automated reminder that the following ${documentText} ${documentCount === 1 ? 'is' : 'are'} expiring within the next 30 days:
            </p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 25px 0; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <thead>
                <tr style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);">
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Document</th>
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Property</th>
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Expiration Date</th>
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${adminDocumentListHtml}
              </tbody>
            </table>
            
            <p style="margin: 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
              Please ensure these ${documentText} ${documentCount === 1 ? 'is' : 'are'} renewed before ${documentCount === 1 ? 'its' : 'their'} expiration ${documentCount === 1 ? 'date' : 'dates'} to maintain compliance.
            </p>
            
            <div style="margin-top: 30px; padding: 18px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 6px;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                <strong style="font-size: 15px;">⚠️ Action Required:</strong> Please log in to the admin portal to review and update these ${documentText}.
              </p>
            </div>
            
            <p style="margin-top: 30px; color: #6b7280; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              This is an automated message from <strong>GMG Resale Flow System</strong>. Please do not reply to this email.<br/>
              If you have questions, please contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #10b981; text-decoration: none;">resales@gmgva.com</a>.
            </p>
          </div>
        </div>
      `;

      // Send admin email
      const subjectUrgency = urgentCount > 0 ? `🔴 URGENT: ${urgentCount} Document${urgentCount === 1 ? '' : 's'} Expiring ≤7 Days` :
                           soonCount > 0 ? `⚠️ ${soonCount} Document${soonCount === 1 ? '' : 's'} Expiring Soon` :
                           approachingCount > 0 ? `⚡ ${approachingCount} Document${approachingCount === 1 ? '' : 's'} Approaching` :
                           `${documentCount} Document${documentCount === 1 ? '' : 's'} Expiring`;
      
      emails.push({
        kind: 'admin',
        label: 'Admin summary',
        to: adminEmail,
        subject: `Admin Alert: ${subjectUrgency} (${documentCount} total within 30 days)`,
        html: adminEmailHtml
      });
    }

    // Property owner emails (for documents expiring within 30 days)
    for (const propertyData of Object.values(propertiesWithExpiringDocs)) {
      const { property, documents } = propertyData;
      
      // Recipients: every owner address on the property (stored comma-separated), minus placeholders
      const recipients = parseEmails(property.property_owner_email)
        .map(email => email.replace(/^owner\./, ''))
        .filter(email => !isFakeEmail(email));
      
      if (recipients.length === 0) continue;
      
      // Sort documents by expiration date
      documents.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
      
      // Create document list HTML with better formatting for multiple documents
      const documentListHtml = documents.map(doc => {
        // If it's a specific file (not just the category), show both category and file name
        const displayName = doc.is_specific 
          ? `<strong><a href="${doc.document_url}" style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#059669'}; text-decoration: none; font-weight: 600;">${doc.document_type}</a></strong><br/><span style="color: #6b7280; font-size: 0.9em;">File: ${doc.file_name}</span>`
          : `<strong><a href="${doc.document_url}" style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#059669'}; text-decoration: none; font-weight: 600;">${doc.document_type}</a></strong>`;
        
        return `
        <tr>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            ${displayName}
            <br/><a href="${doc.document_url}" style="color: #3b82f6; text-decoration: none; font-size: 0.85em; margin-top: 4px; display: inline-block;">🔗 View Document →</a>
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            ${new Date(doc.expiration_date).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}
          </td>
          <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
            <strong style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#10b981'};">${doc.days_until_expiration} ${doc.days_until_expiration === 1 ? 'day' : 'days'}</strong>
          </td>
        </tr>
      `;
      }).join('');
      
      // Count documents for better messaging
      const documentCount = documents.length;
      const documentText = documentCount === 1 ? 'document' : 'documents';
      
      // Email HTML template
      const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 24px; font-weight: 600;">Document Expiration Alert</h2>
            <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.95;">${documentCount} ${documentText} expiring within 30 days</p>
          </div>
          
          <div style="padding: 30px; background-color: #f9fafb;">
            <p style="margin: 0 0 15px; color: #374151; font-size: 15px; line-height: 1.6;">
              Dear <strong>${property.property_owner_name || 'Property Manager'}</strong>,
            </p>
            
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.6;">
              This is an automated reminder that the following ${documentText} for <strong style="color: #10b981;">${property.name}</strong> ${documentCount === 1 ? 'is' : 'are'} expiring within the next 30 days:
            </p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 25px 0; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
              <thead>
                <tr style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);">
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Document</th>
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Expiration Date</th>
                  <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${documentListHtml}
              </tbody>
            </table>
            
            <p style="margin: 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
              Please ensure these ${documentText} ${documentCount === 1 ? 'is' : 'are'} renewed before ${documentCount === 1 ? 'its' : 'their'} expiration ${documentCount === 1 ? 'date' : 'dates'} to maintain compliance.
            </p>
            
            <div style="margin-top: 30px; padding: 18px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 6px;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                <strong style="font-size: 15px;">⚠️ Action Required:</strong> Please log in to the admin portal to update these ${documentText}.
              </p>
            </div>
            
            ${documentCount > 1 ? `
            <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px;">
              <p style="margin: 0; color: #1e40af; font-size: 13px; line-height: 1.6;">
                <strong>ℹ️ Note:</strong> You have multiple documents expiring. Each document can be managed individually in the admin portal.
              </p>
            </div>
            ` : ''}
            
            <p style="margin-top: 30px; color: #6b7280; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              This is an automated message from <strong>GMG Resale Flow System</strong>. Please do not reply to this email.<br/>
              If you have questions, please contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #10b981; text-decoration: none;">resales@gmgva.com</a>.
            </p>
          </div>
        </div>
      `;
      
      emails.push({
        kind: 'owner',
        label: property.name,
        to: recipients,
        subject: `Document Expiration Alert - ${property.name}`,
        html: emailHtml
      });
    }
    
    // Send all emails, a couple at a time
    const results = await runWithConcurrency(emails, EMAIL_CONCURRENCY, (email) =>
      sendEmail({ to: email.to, subject: email.subject, html: email.html, context: 'ExpiringDocs' })
    );

    const failures = [];
    results.forEach((result, i) => {
      const email = emails[i];
      const to = [].concat(email.to).join(', ');
      if (result.status === 'fulfilled') {
        console.log(`✅ Expiring documents email sent (${email.label}) to ${to} via ${result.value?.method}`);
      } else {
        console.error(`❌ Failed to send expiring documents email (${email.label}) to ${to}:`, result.reason);
        failures.push({ kind: email.kind, label: email.label, to, error: result.reason?.message || String(result.reason) });
      }
    });

    const sentOf = (kind) => results.filter((r, i) => emails[i].kind === kind && r.status === 'fulfilled').length;
    const adminEmailsSent = sentOf('admin');
    const ownerEmailsSent = sentOf('owner');
    
    // Log results
    const totalProperties = Object.keys(propertiesWithExpiringDocs).length;
    const totalDocuments = expiringDocs.length;
    const adminDocCount = allAdminDocs.length;
    const urgentDocCount = allAdminDocs.filter(doc => doc.days_until_expiration <= 7).length;
    
    // Any failed send makes the run fail, so a broken mail setup shows up in the cron's status
    res.status(failures.length > 0 ? 500 : 200).json({
      success: failures.length === 0,
      message: `Checked ${totalDocuments} expiring documents across ${totalProperties} properties. Sent ${adminEmailsSent} admin email(s) for ${adminDocCount} document(s) expiring within 30 days (${urgentDocCount} urgent ≤7 days) and ${ownerEmailsSent} property owner email(s). ${failures.length} email(s) failed.`,
      summary: {
        properties_notified: totalProperties,
        documents_expiring: totalDocuments,
        admin_documents_count: adminDocCount,
        admin_urgent_documents: urgentDocCount,
        admin_emails_sent: adminEmailsSent,
        property_owner_emails_sent: ownerEmailsSent,
        emails_failed: failures.length
      },
      failures
    });
    
  } catch (error) {
    console.error('Error checking expiring documents:', error);
    res.status(500).json({ 
      error: 'Failed to check expiring documents',
      details: error.message 
    });
  }
}
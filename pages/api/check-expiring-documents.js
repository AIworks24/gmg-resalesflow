import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Note: Transporter is initialized inside the handler to ensure required env vars are present

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
    // TEMPORARILY DISABLED: Email transporter creation - email notifications are now handled via in-app notifications
    // const transporter = nodemailer.createTransport({
    //   host: process.env.SMTP_HOST,
    //   port: process.env.SMTP_PORT,
    //   secure: process.env.SMTP_SECURE === "true",
    //   auth: {
    //     user: process.env.GMAIL_USER,
    //     pass: process.env.GMAIL_APP_PASSWORD,
    //   },
    //   tls: {
    //     ciphers: process.env.CIPHERS || "SSLv3",
    //     rejectUnauthorized: false,
    //   },
    // });

    // Get all documents expiring within 30 days
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysLater = thirtyDaysFromNow.toISOString().split('T')[0];

    const { data: expiringDocs, error } = await supabase
      .from('property_documents')
      .select(`
        *,
        property:property_id (
          id,
          name,
          property_owner_email,
          property_owner_name
        )
      `)
      .gte('expiration_date', today)
      .lte('expiration_date', thirtyDaysLater)
      .eq('is_not_applicable', false)
      .not('expiration_date', 'is', null);

    if (error) throw error;

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
      
      propertiesWithExpiringDocs[propertyId].documents.push({
        document_type: doc.document_name, // The document category (e.g., "VA Appendix 02/Architectural Guidelines")
        file_name: specificFileName, // The specific file name
        is_specific: isSpecificFile, // Whether this is a specific file or just the category
        expiration_date: doc.expiration_date,
        days_until_expiration: daysUntilExpiration
      });
    });

    // TEMPORARILY DISABLED: Email notifications are now handled via in-app notifications
    // Email alerts are disabled - notifications are now shown in the admin portal
    // const emailPromises = [];
    
    // for (const propertyData of Object.values(propertiesWithExpiringDocs)) {
    //   const { property, documents } = propertyData;
    //   
    //   // Determine recipient emails (owner only as management fields removed)
    //   const recipients = [];
    //   if (property.property_owner_email) {
    //     recipients.push(property.property_owner_email);
    //   }
    //   
    //   if (recipients.length === 0) continue;
    //   
    //   // Sort documents by expiration date
    //   documents.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
    //   
    //   // Create document list HTML with better formatting for multiple documents
    //   const documentListHtml = documents.map(doc => {
    //     // If it's a specific file (not just the category), show both category and file name
    //     const displayName = doc.is_specific 
    //       ? `<strong>${doc.document_type}</strong><br/><span style="color: #6b7280; font-size: 0.9em;">File: ${doc.file_name}</span>`
    //       : `<strong>${doc.document_type}</strong>`;
    //     
    //     return `
    //     <tr>
    //       <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
    //         ${displayName}
    //       </td>
    //       <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
    //         ${new Date(doc.expiration_date).toLocaleDateString('en-US', { 
    //           year: 'numeric', 
    //           month: 'long', 
    //           day: 'numeric' 
    //         })}
    //       </td>
    //       <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
    //         <strong style="color: ${doc.days_until_expiration <= 7 ? '#dc2626' : doc.days_until_expiration <= 14 ? '#f59e0b' : '#10b981'};">${doc.days_until_expiration} ${doc.days_until_expiration === 1 ? 'day' : 'days'}</strong>
    //       </td>
    //     </tr>
    //   `;
    //   }).join('');
    //   
    //   // Count documents for better messaging
    //   const documentCount = documents.length;
    //   const documentText = documentCount === 1 ? 'document' : 'documents';
    //   
    //   // Email HTML template
    //   const emailHtml = `
    //     <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background-color: #ffffff;">
    //       <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
    //         <h2 style="margin: 0; font-size: 24px; font-weight: 600;">Document Expiration Alert</h2>
    //         <p style="margin: 10px 0 0; font-size: 14px; opacity: 0.95;">${documentCount} ${documentText} expiring within 30 days</p>
    //       </div>
    //       
    //       <div style="padding: 30px; background-color: #f9fafb;">
    //         <p style="margin: 0 0 15px; color: #374151; font-size: 15px; line-height: 1.6;">
    //           Dear <strong>${property.property_owner_name || 'Property Manager'}</strong>,
    //         </p>
    //         
    //         <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.6;">
    //           This is an automated reminder that the following ${documentText} for <strong style="color: #10b981;">${property.name}</strong> ${documentCount === 1 ? 'is' : 'are'} expiring within the next 30 days:
    //         </p>
    //         
    //         <table style="width: 100%; border-collapse: collapse; margin: 25px 0; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    //           <thead>
    //             <tr style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);">
    //               <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Document</th>
    //               <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Expiration Date</th>
    //               <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #374151; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">Days Remaining</th>
    //             </tr>
    //           </thead>
    //           <tbody>
    //             ${documentListHtml}
    //           </tbody>
    //         </table>
    //         
    //         <p style="margin: 20px 0; color: #374151; font-size: 15px; line-height: 1.6;">
    //           Please ensure these ${documentText} ${documentCount === 1 ? 'is' : 'are'} renewed before ${documentCount === 1 ? 'its' : 'their'} expiration ${documentCount === 1 ? 'date' : 'dates'} to maintain compliance.
    //         </p>
    //         
    //         <div style="margin-top: 30px; padding: 18px; background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; border-radius: 6px;">
    //           <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
    //             <strong style="font-size: 15px;">⚠️ Action Required:</strong> Please log in to the admin portal to update these ${documentText}.
    //           </p>
    //         </div>
    //         
    //         ${documentCount > 1 ? `
    //         <div style="margin-top: 20px; padding: 15px; background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 6px;">
    //           <p style="margin: 0; color: #1e40af; font-size: 13px; line-height: 1.6;">
    //             <strong>ℹ️ Note:</strong> You have multiple documents expiring. Each document can be managed individually in the admin portal.
    //           </p>
    //         </div>
    //         ` : ''}
    //         
    //         <p style="margin-top: 30px; color: #6b7280; font-size: 13px; line-height: 1.6; border-top: 1px solid #e5e7eb; padding-top: 20px;">
    //           This is an automated message from <strong>GMG Resale Flow System</strong>. Please do not reply to this email.<br/>
    //           If you have questions, please contact GMG ResaleFlow at <a href="mailto:resales@gmgva.com" style="color: #10b981; text-decoration: none;">resales@gmgva.com</a>.
    //         </p>
    //       </div>
    //     </div>
    //   `;
    //   
    //   // Send email
    //   const mailOptions = {
    //     from: `"GMG Resale Flow Admin" <${process.env.GMAIL_USER}>`,
    //     to: recipients.join(', '),
    //     subject: `Document Expiration Alert - ${property.name}`,
    //     html: emailHtml
    //   };
    //   
    //   emailPromises.push(transporter.sendMail(mailOptions));
    // }
    // 
    // // Send all emails
    // await Promise.allSettled(emailPromises);
    
    // Log results
    const totalProperties = Object.keys(propertiesWithExpiringDocs).length;
    const totalDocuments = expiringDocs.length;
    
    res.status(200).json({
      success: true,
      message: `Checked ${totalDocuments} expiring documents across ${totalProperties} properties. Email notifications are temporarily disabled - using in-app notifications instead.`,
      summary: {
        properties_notified: totalProperties,
        documents_expiring: totalDocuments,
        emails_sent: 0 // Email notifications disabled
      }
    });
    
  } catch (error) {
    console.error('Error checking expiring documents:', error);
    res.status(500).json({ 
      error: 'Failed to check expiring documents',
      details: error.message 
    });
  }
}
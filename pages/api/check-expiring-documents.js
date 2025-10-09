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
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add authentication token check for security
  const authToken = req.headers['x-cron-auth'];
  if (process.env.CRON_SECRET && authToken !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Validate required SMTP environment variables
    const requiredEnv = ['SMTP_HOST', 'SMTP_PORT', 'EMAIL_USERNAME', 'EMAIL_APP_PASSWORD'];
    const missingEnv = requiredEnv.filter((key) => !process.env[key]);
    if (missingEnv.length > 0) {
      return res.status(500).json({
        error: 'Server misconfigured: missing required environment variables',
        missing: missingEnv
      });
    }

    // Create email transporter using environment variables
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true', // optional, defaults to false
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_APP_PASSWORD
      }
    });

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
          property_owner_name,
          management_contact,
          email
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
      
      propertiesWithExpiringDocs[propertyId].documents.push({
        name: doc.document_name,
        expiration_date: doc.expiration_date,
        days_until_expiration: daysUntilExpiration
      });
    });

    // Send email alerts
    const emailPromises = [];
    
    for (const propertyData of Object.values(propertiesWithExpiringDocs)) {
      const { property, documents } = propertyData;
      
      // Determine recipient emails
      const recipients = [];
      if (property.property_owner_email) {
        recipients.push(property.property_owner_email);
      }
      if (property.email && property.email !== property.property_owner_email) {
        recipients.push(property.email);
      }
      
      if (recipients.length === 0) continue;
      
      // Sort documents by expiration date
      documents.sort((a, b) => new Date(a.expiration_date) - new Date(b.expiration_date));
      
      // Create document list HTML
      const documentListHtml = documents.map(doc => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">
            ${doc.name}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">
            ${new Date(doc.expiration_date).toLocaleDateString()}
          </td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">
            <strong>${doc.days_until_expiration} days</strong>
          </td>
        </tr>
      `).join('');
      
      // Email HTML template
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
            <h2 style="margin: 0;">Document Expiration Alert</h2>
          </div>
          
          <div style="padding: 20px; background-color: #f9fafb;">
            <p>Dear ${property.property_owner_name || 'Property Manager'},</p>
            
            <p>This is an automated reminder that the following documents for <strong>${property.name}</strong> are expiring within the next 30 days:</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr style="background-color: #e5e7eb;">
                  <th style="padding: 10px; text-align: left;">Document</th>
                  <th style="padding: 10px; text-align: left;">Expiration Date</th>
                  <th style="padding: 10px; text-align: left;">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                ${documentListHtml}
              </tbody>
            </table>
            
            <p>Please ensure these documents are renewed before their expiration dates to maintain compliance.</p>
            
            <div style="margin-top: 30px; padding: 15px; background-color: #fef3c7; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; color: #92400e;">
                <strong>Action Required:</strong> Please log in to the admin portal to update these documents.
              </p>
            </div>
            
            <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">
              This is an automated message from GMG Resale Flow System. Please do not reply to this email.
            </p>
          </div>
        </div>
      `;
      
      // Send email
      const mailOptions = {
        from: '"GMG Resale Flow" <no-reply@gmgva.com>',
        to: recipients.join(', '),
        subject: `Document Expiration Alert - ${property.name}`,
        html: emailHtml
      };
      
      emailPromises.push(transporter.sendMail(mailOptions));
    }
    
    // Send all emails
    await Promise.allSettled(emailPromises);
    
    // Log results
    const totalProperties = Object.keys(propertiesWithExpiringDocs).length;
    const totalDocuments = expiringDocs.length;
    
    res.status(200).json({
      success: true,
      message: `Checked ${totalDocuments} expiring documents across ${totalProperties} properties`,
      summary: {
        properties_notified: totalProperties,
        documents_expiring: totalDocuments,
        emails_sent: emailPromises.length
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
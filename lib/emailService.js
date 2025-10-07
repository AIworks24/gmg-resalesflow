import nodemailer from 'nodemailer';

// Create reusable transporter object using Gmail SMTP
// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.GMAIL_USER,
//     pass: process.env.GMAIL_APP_PASSWORD,
//   },
// });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, 
  requireTLS: true,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  tls: {
    ciphers: process.env.CIPHERS,
    rejectUnauthorized: false
  }
});

export const sendApprovalEmail = async ({
  to,
  applicationId,
  propertyAddress,
  pdfUrl,
  submitterName,
  hoaName,
  downloadLinks = [],
}) => {
  try {
    // Generate download links HTML
    const downloadLinksHtml = downloadLinks.length > 0 
      ? downloadLinks.map(link => {
          const icon = link.type === 'pdf' ? '📄' : '📂';
          const sizeText = link.size && link.size !== 'Unknown' ? ` (${link.size} bytes)` : '';
          return `
            <li style="margin: 8px 0;">
              <a href="${link.downloadUrl}" 
                 style="color: #166534; text-decoration: none; font-weight: 500; display: inline-block; padding: 8px 12px; background-color: #f0f9ff; border-radius: 4px; border: 1px solid #e0e7ff;"
                 onmouseover="this.style.backgroundColor='#dbeafe'" 
                 onmouseout="this.style.backgroundColor='#f0f9ff'">
                ${icon} ${link.filename}${sizeText}
              </a>
              <br><small style="color: #6b7280; margin-left: 20px;">${link.description}</small>
            </li>
          `;
        }).join('')
      : '<li>No additional documents available</li>';

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: `Resale Certificate Ready - ${propertyAddress}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #166534; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Your Resale Certificate is Ready</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${submitterName},</p>
            <p>Your Resale Certificate for <strong>${propertyAddress}</strong> in <strong>${hoaName}</strong> is now ready for download.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #166534; margin-top: 0;">📥 Download Your Documents</h3>
              <p style="margin-bottom: 15px;">Click the links below to download your documents:</p>
              <ul style="list-style: none; padding: 0;">
                ${downloadLinksHtml}
              </ul>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">⏰ Important Note</h4>
              <p style="margin: 0;">Download links are valid for <strong>30 days</strong>. Please save the documents to your computer for future reference.</p>
            </div>
            
            <div style="background-color: white; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #166534;">
              <p style="margin: 0;"><strong>Application ID:</strong> ${applicationId}</p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #166534;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

export const sendApplicationSubmissionEmail = async ({
  to,
  applicationId,
  customerName,
  propertyAddress,
  packageType,
  totalAmount,
  hoaName,
  submitterType,
}) => {
  try {
    // Calculate expected completion date
    const processingDays = packageType === 'rush' ? 5 : 15;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + processingDays);

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: `Application Submitted - #${applicationId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Application Submitted Successfully</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for submitting your resale certificate application. We have received your request and will begin processing it immediately.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #10B981; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>HOA Community:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${hoaName}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Total Amount:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Expected Completion:</strong></td>
                  <td style="padding: 8px 0;">${expectedDate.toLocaleDateString()}</td>
                </tr>
              </table>
            </div>
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">What Happens Next?</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>We'll begin processing your resale certificate request</li>
                <li>Property owner forms will be sent to the HOA for completion</li>
                <li>You'll receive email updates throughout the process</li>
                <li>Completed documents will be delivered electronically</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Application submission email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending application submission email:', error);
    throw error;
  }
};

export const sendPaymentConfirmationEmail = async ({
  to,
  applicationId,
  customerName,
  propertyAddress,
  packageType,
  totalAmount,
  stripeChargeId,
}) => {
  try {
    // Calculate expected completion date
    const processingDays = packageType === 'rush' ? 5 : 15;
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() + processingDays);

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to,
      subject: `Payment Confirmation - Application #${applicationId}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #10B981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0;">Payment Confirmation</h1>
            <p style="margin: 10px 0 0 0;">Goodman Management Group - ResaleFlow</p>
          </div>
          
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Dear ${customerName},</p>
            
            <p>Thank you for your payment! Your resale certificate application has been successfully submitted and payment confirmed.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #10B981; margin-top: 0;">Application Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Application ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">#${applicationId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Property Address:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${propertyAddress}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Processing Type:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${packageType === 'rush' ? 'Rush (5 business days)' : 'Standard (10-15 business days)'}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #eee;">$${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Expected Completion:</strong></td>
                  <td style="padding: 8px 0;">${expectedDate.toLocaleDateString()}</td>
                </tr>
              </table>
            </div>
            
            ${stripeChargeId ? `
            <div style="background-color: #EBF8FF; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #2563EB; margin-top: 0;">Payment Reference</h4>
              <p style="margin: 0; font-family: monospace; font-size: 14px;">Stripe Payment ID: ${stripeChargeId}</p>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #6B7280;">Save this reference number for your records</p>
            </div>
            ` : ''}
            
            <div style="background-color: #FEF3C7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="color: #D97706; margin-top: 0;">What Happens Next?</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li>We'll begin processing your resale certificate request</li>
                <li>Property owner forms will be sent to the HOA for completion</li>
                <li>You'll receive email updates throughout the process</li>
                <li>Completed documents will be delivered electronically</li>
              </ol>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 14px;">
                Questions? Contact us at <a href="mailto:resales@gmgva.com" style="color: #10B981;">resales@gmgva.com</a>
              </p>
            </div>
            
            <div style="border-top: 1px solid #E5E7EB; padding-top: 20px; text-align: center; color: #6B7280; font-size: 12px;">
              <p>Goodman Management Group<br>
              Professional HOA Management & Resale Services</p>
            </div>
          </div>
        </div>
      `,
    };

    const emailResponse = await transporter.sendMail(mailOptions);
    console.log('Payment confirmation email sent successfully:', emailResponse);
    return { success: true, response: emailResponse };
  } catch (error) {
    console.error('Error sending payment confirmation email:', error);
    throw error;
  }
};

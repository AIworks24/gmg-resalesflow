import nodemailer from "nodemailer";

export const config = {
  schedule: "0 0 * * *", 
};

export default async function handler(req, res) {
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

    // 2️⃣ Calculate the target date (20 days from today)
    const today = new Date();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + 20);
    const formattedDate = targetDate.toISOString().split("T")[0]; // yyyy-mm-dd

    console.log("🔍 Checking for documents expiring on:", formattedDate);

    // 3️⃣ Fetch expiring documents from Supabase
    const docsResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/property_documents?expiration_date=eq.${formattedDate}`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    const docs = await docsResponse.json();
    console.log("📦 Expiring documents:", docs);

    if (!docs.length) {
      console.log("✅ No documents expiring in 20 days.");
      return res
        .status(200)
        .json({ success: true, message: "No upcoming expirations." });
    }

    // TEMPORARILY DISABLED: Email notifications are now handled via in-app notifications
    // Email alerts are disabled - notifications are now shown in the admin portal

    // 4️⃣ For each document, get property info (but don't send email)
    // for (const doc of docs) {
    //   const propertyResponse = await fetch(
    //     `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/hoa_properties?id=eq.${doc.property_id}`,
    //     {
    //       headers: {
    //         apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    //         Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    //       },
    //     }
    //   );

    //   const propertyData = await propertyResponse.json();
    //   const property = propertyData[0]; // one row only

    //   if (!property) {
    //     console.warn(`⚠️ Property not found for ID ${doc.property_id}`);
    //     continue;
    //   }

    //   // Choose email from property_owner_email or fallback
    //   const toEmail1 = property.property_owner_email || "";
    //   const toEmail = toEmail1.replace(/^owner\./, ""); // remove "owner." if it exists


    //   // 5️⃣ Send the email
    //   await transporter.sendMail({
    //     from: `"GMG ResaleFlow" <${process.env.GMAIL_USER}>`,
    //     to: toEmail,
    //     subject: `📄 Document Expiration Reminder – ${doc.document_name}`,
    //     html: `
    //         <div style="font-family: 'Segoe UI', Arial, sans-serif; background-color: #f7f8fa; padding: 30px;">
    //             <table align="center" cellpadding="0" cellspacing="0" width="600" style="background: #ffffff; border-radius: 8px; overflow: hidden;">
    //             <tr>
    //                 <td style="background-color: #006241; color: #ffffff; padding: 20px 30px; text-align: center; font-size: 22px; font-weight: bold;">
    //                 Your Document Expiration Reminder
    //                 </td>
    //             </tr>
    //             <tr>
    //                 <td style="padding: 30px; color: #333333; font-size: 15px; line-height: 1.6;">
    //                 <p>Dear <strong>${property.property_owner_name || "Property Owner"}</strong>,</p>
    //                 <p>This is a reminder that one of your documents for the property <strong>${property.name}</strong> in <strong>${property.location || "N/A"}</strong> will expire soon.</p>

    //                 <div style="background-color: #f2f8f7; padding: 15px; border-radius: 6px; margin: 20px 0;">
    //                     <p style="margin: 0;"><strong>📄 Document Name:</strong> ${doc.document_name}</p>
    //                     <p style="margin: 0;"><strong>🏠 Property:</strong> ${property.name}</p>
    //                     <p style="margin: 0;"><strong>📍 Location:</strong> ${property.location || "N/A"}</p>
    //                     <p style="margin: 0;"><strong>📅 Expiration Date:</strong> ${doc.expiration_date}</p>
    //                 </div>

    //                 <p>Please renew or review your document before the expiration date to avoid any interruptions.</p>

    //                 <div style="background: #fff3cd; border-left: 5px solid #ffecb5; padding: 15px; border-radius: 6px; margin-top: 25px;">
    //                     <strong>⚠️ Important Note:</strong>
    //                     <p style="margin: 8px 0 0;">This reminder was generated automatically. Please keep your records up to date.</p>
    //                 </div>

    //                 <p style="margin-top: 25px;">If you have questions, please contact GMG ResaleFlow at 
    //                     <a href="mailto:resales@gmgva.com" style="color: #006241; text-decoration: none;">resales@gmgva.com</a>.
    //                 </p>

    //                 <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;" />

    //                 <p style="font-size: 13px; color: #888888; text-align: center;">
    //                     Goodman Management Group - ResaleFlow<br/>
    //                     Professional HOA Management & Resale Services
    //                 </p>
    //                 </td>
    //             </tr>
    //             </table>
    //         </div>
    //         `,
    //   });

    //   console.log(`📧 Reminder sent for: ${doc.document_name} → ${toEmail}`);
    //   sentCount++;
    // }

    return res.status(200).json({
      success: true,
      message: `Found ${docs.length} expiring documents. Email notifications are temporarily disabled - using in-app notifications instead.`,
    });
  } catch (error) {
    console.error("❌ Error sending expiration reminders:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

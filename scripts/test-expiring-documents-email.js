/**
 * Test Script for Expiring Documents Email
 * 
 * This script tests the expiring documents email notification by calling
 * the check-expiring-documents API endpoint immediately.
 * 
 * Run with: node scripts/test-expiring-documents-email.js
 * 
 * Make sure you have:
 * 1. CRON_SECRET in your .env.local
 * 2. NEXT_PUBLIC_SITE_URL or NEXT_PUBLIC_APP_URL (optional, defaults to http://localhost:3000)
 * 3. All email configuration (SMTP_HOST, SMTP_PORT, GMAIL_USER, GMAIL_APP_PASSWORD)
 * 4. ADMIN_EMAIL (optional, defaults to resales@gmgva.com)
 */

require('dotenv').config({ path: '.env.local' });

const http = require('http');
const https = require('https');

async function testExpiringDocumentsEmail() {
  try {
    const cronSecret = process.env.CRON_SECRET;
    
    if (!cronSecret) {
      console.error('❌ Error: CRON_SECRET not found in environment variables');
      console.log('Please add CRON_SECRET=your_secret_here to your .env.local');
      process.exit(1);
    }

    // Determine the base URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 
                   process.env.NEXT_PUBLIC_APP_URL || 
                   'http://localhost:3000';
    
    const url = new URL(`${baseUrl}/api/check-expiring-documents`);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    console.log('🧪 Testing Expiring Documents Email');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`API URL: ${url.toString()}`);
    console.log(`Admin Email: ${process.env.ADMIN_EMAIL || 'resales@gmgva.com'}`);
    console.log('');

    return new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json'
        }
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (res.statusCode === 200) {
              console.log('✅ Email sent successfully!');
              console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
              console.log('\n📧 Response Summary:');
              console.log(`   Message: ${response.message}`);
              
              if (response.summary) {
                console.log('\n📊 Summary:');
                console.log(`   Properties with expiring docs: ${response.summary.properties_notified || 0}`);
                console.log(`   Total documents expiring: ${response.summary.documents_expiring || 0}`);
                console.log(`   Admin documents count: ${response.summary.admin_documents_count || 0}`);
                console.log(`   Urgent documents (≤7 days): ${response.summary.admin_urgent_documents || 0}`);
                console.log(`   Admin emails sent: ${response.summary.admin_emails_sent || 0}`);
                console.log(`   Property owner emails sent: ${response.summary.property_owner_emails_sent || 0}`);
              }
              
              console.log('\n✅ Check your email inbox for the notification!');
              console.log('   Make sure to check both:');
              console.log(`   1. Admin email: ${process.env.ADMIN_EMAIL || 'resales@gmgva.com'}`);
              console.log('   2. Property owner emails (if any expiring documents exist)');
              console.log('\n💡 Tip: Click the document links in the email to navigate directly to the document page.');
              
              resolve(response);
            } else {
              console.error(`❌ Error: HTTP ${res.statusCode}`);
              console.error(`Response: ${data}`);
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            console.error('❌ Error parsing response:', error);
            console.error('Raw response:', data);
            reject(error);
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ Request error:', error.message);
        console.error('\n💡 Make sure your Next.js server is running:');
        console.error('   npm run dev');
        reject(error);
      });

      req.end();
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run the test
testExpiringDocumentsEmail()
  .then(() => {
    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });


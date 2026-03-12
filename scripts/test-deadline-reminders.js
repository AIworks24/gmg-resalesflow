/**
 * Test Script for Deadline Reminder Emails
 *
 * Calls the check-deadline-reminders API endpoint immediately.
 *
 * Run with: node scripts/test-deadline-reminders.js
 *
 * Prerequisites:
 * 1. Next.js dev server running (npm run dev)
 * 2. CRON_SECRET set in .env.local
 * 3. Email config set (GMAIL_USER, GMAIL_APP_PASSWORD, etc.)
 *
 * Note: Emails are only sent for applications where:
 *   - assigned_to is set
 *   - email_completed_at is null (not completed)
 *   - Deadline (rush=5 business days, standard=15 days) falls TOMORROW
 *   - No deadline_reminder notification already exists
 */

require('dotenv').config({ path: '.env.local' });

const http = require('http');
const https = require('https');

async function testDeadlineReminders() {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('❌ CRON_SECRET not found in .env.local');
    process.exit(1);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ||
                  process.env.NEXT_PUBLIC_APP_URL ||
                  'http://localhost:3000';

  const url = new URL(`${baseUrl}/api/check-deadline-reminders`);
  const isHttps = url.protocol === 'https:';
  const client = isHttps ? https : http;

  console.log('🧪 Testing Deadline Reminder Emails');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`API URL: ${url.toString()}`);
  console.log('');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('✅ Request successful!');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`\n📧 Message: ${response.message}`);
            if (response.summary) {
              console.log('\n📊 Summary:');
              console.log(`   Applications with deadline tomorrow: ${response.summary.applications_approaching}`);
              console.log(`   Already notified (skipped):          ${response.summary.already_notified}`);
              console.log(`   Emails sent:                         ${response.summary.emails_sent}`);
            }
            if (response.summary?.emails_sent > 0) {
              console.log('\n✅ Check the assignee inbox(es) for the reminder email!');
            } else {
              console.log('\n💡 No emails sent. Make sure there is an application with:');
              console.log('   - assigned_to set to a real email');
              console.log('   - email_completed_at = null');
              console.log('   - Deadline falling exactly tomorrow');
            }
            resolve(response);
          } else {
            console.error(`❌ HTTP ${res.statusCode}: ${data}`);
            reject(new Error(`HTTP ${res.statusCode}`));
          }
        } catch (err) {
          console.error('❌ Error parsing response:', err);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request error:', err.message);
      console.error('\n💡 Make sure your dev server is running: npm run dev');
      reject(err);
    });

    req.end();
  });
}

testDeadlineReminders()
  .then(() => { console.log('\n✅ Test completed.'); process.exit(0); })
  .catch(err => { console.error('\n❌ Test failed:', err.message); process.exit(1); });

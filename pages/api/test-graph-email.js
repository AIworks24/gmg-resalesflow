/**
 * Test Microsoft Graph Email Endpoint
 * 
 * This endpoint allows you to test Microsoft Graph email sending
 * 
 * @route POST /api/test-graph-email
 * @body { "to": "test@example.com" }
 */

import { sendPropertyManagerNotificationEmail } from '../../lib/emailService';

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple authentication check (optional - add your own auth logic)
  const authHeader = req.headers['authorization'];
  const expectedAuth = process.env.ADMIN_API_KEY ? `Bearer ${process.env.ADMIN_API_KEY}` : null;
  
  if (expectedAuth && authHeader !== expectedAuth) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { to } = req.body;

    if (!to) {
      return res.status(400).json({ error: 'Recipient email address is required' });
    }

    console.log('[TEST] Sending test email via Microsoft Graph to:', to);

    // Send a test email using the property manager notification template
    const result = await sendPropertyManagerNotificationEmail({
      to: to,
      applicationId: 'TEST-' + Date.now(),
      propertyName: 'Test Property',
      propertyAddress: '123 Test Street, Test City, TC 12345',
      submitterName: 'Test User',
      submitterEmail: 'test@example.com',
      packageType: 'standard',
      isRush: false,
      isMultiCommunity: false,
      linkedProperties: [],
      applicationType: 'single_property',
    });

    console.log('[TEST] Email sent successfully:', result);

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully via Microsoft Graph',
      result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[TEST] Error sending test email:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}


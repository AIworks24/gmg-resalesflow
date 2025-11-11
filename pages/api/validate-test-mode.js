import { isTestModeEnabled } from '../../lib/stripeMode';

/**
 * API endpoint to validate test mode code
 * This is needed because TEST_MODE_CODE is server-side only
 * and cannot be accessed from client-side code
 */
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const testCode = req.query.test || req.body?.test;
    
    if (!testCode) {
      return res.status(400).json({ error: 'Test code is required' });
    }

    const isValid = isTestModeEnabled(testCode);
    
    return res.status(200).json({ 
      valid: isValid,
      testCode: testCode 
    });
  } catch (error) {
    console.error('Error validating test mode:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


/**
 * Server Time API Endpoint
 * Returns the current server time in ISO format
 * This ensures all timestamps use server time, not client time
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Return server's current time in ISO format (UTC)
    const serverTime = new Date().toISOString();
    
    return res.status(200).json({
      serverTime,
      timestamp: Date.now(), // Unix timestamp in milliseconds
    });
  } catch (error) {
    console.error('Error getting server time:', error);
    return res.status(500).json({ error: 'Failed to get server time' });
  }
}







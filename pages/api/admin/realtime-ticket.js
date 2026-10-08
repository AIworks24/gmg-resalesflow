import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { signTicket } from '../../../lib/realtime/ticket';

const REALTIME_ROLES = ['admin', 'staff', 'accounting'];

/**
 * Issues a short-lived (60s) signed ticket for connecting to the realtime server.
 * The browser never sends its Supabase token to the realtime worker; it sends this instead.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.REALTIME_TICKET_SECRET;
  if (!secret) return res.status(503).json({ error: 'Realtime is not configured' });

  try {
    const supabase = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !REALTIME_ROLES.includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const ticket = await signTicket({ sub: user.id, role: profile.role }, secret);
    return res.status(200).json({ ticket });
  } catch (error) {
    console.error('Error issuing realtime ticket:', error);
    return res.status(500).json({ error: 'Failed to issue realtime ticket' });
  }
}

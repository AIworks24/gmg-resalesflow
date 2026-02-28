import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

/**
 * Sends all property emails for a multi-community application in one batch.
 * Used when all properties are complete - sends each property's email in sequence
 * so the requestor receives them in close succession.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createPagesServerClient({ req, res });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();
    if (profile?.role !== 'admin' && profile?.role !== 'staff' && profile?.role !== 'accounting') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    const { data: application, error: appError } = await supabase
      .from('applications')
      .select(`
        id,
        submitter_type,
        application_type,
        hoa_properties(is_multi_community)
      `)
      .eq('id', applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const isMC = application.hoa_properties?.is_multi_community;
    if (!isMC) {
      return res.status(400).json({ error: 'Application is not multi-community' });
    }

    const { data: groups, error: groupsError } = await supabase
      .from('application_property_groups')
      .select('id, property_name, pdf_url, pdf_status, email_status, email_completed_at')
      .eq('application_id', applicationId)
      .order('is_primary', { ascending: false });

    if (groupsError || !groups?.length) {
      return res.status(400).json({ error: 'No property groups found' });
    }

    const isSettlementApp = application.submitter_type === 'settlement' || application.application_type?.startsWith('settlement');
    const apiEndpoint = isSettlementApp ? '/api/send-settlement-approval-email' : '/api/send-approval-email';

    const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.includes('localhost') ? 'http' : 'https');
    const host = req.headers.host || 'localhost:3000';
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.startsWith('http'))
      ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
      : `${protocol}://${host}`;

    const cookie = req.headers.cookie || '';

    // Include all PDF-ready groups regardless of email_status so admins can resend at any time.
    const readyGroups = groups.filter((g) => g.pdf_url || g.pdf_status === 'completed');
    if (readyGroups.length === 0) {
      return res.status(400).json({ error: 'No properties have PDFs ready to send' });
    }

    const results = [];
    for (const group of readyGroups) {
      try {
        const body = isSettlementApp
          ? { applicationId, propertyGroupId: group.id }
          : { applicationId, propertyGroupId: group.id, propertyName: group.property_name, pdfUrl: group.pdf_url };

        const response = await fetch(`${baseUrl}${apiEndpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie,
          },
          body: JSON.stringify(body),
        });

        const result = await response.json();
        results.push({
          groupId: group.id,
          propertyName: group.property_name,
          success: response.ok && result.success,
          error: result.error,
        });
      } catch (err) {
        console.error(`Failed to send email for ${group.property_name}:`, err);
        results.push({
          groupId: group.id,
          propertyName: group.property_name,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.length - successCount;

    return res.status(200).json({
      success: failedCount === 0,
      sent: successCount,
      total: results.length,
      results,
      message:
        failedCount === 0
          ? `All ${successCount} emails sent successfully`
          : `${successCount} sent, ${failedCount} failed`,
    });
  } catch (error) {
    console.error('send-all-mc-emails error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send emails' });
  }
}

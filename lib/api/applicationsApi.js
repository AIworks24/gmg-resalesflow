import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

class ApplicationsApi {
  constructor() {
    this.supabase = createClientComponentClient();
  }

  // Admin methods
  async getApplications({ 
    page = 1, 
    limit = 10, 
    status = 'all', 
    search = '', 
    dateRange = null 
  } = {}, options = {}) {
    const { signal } = options;
    
    // Check if request was cancelled
    if (signal?.aborted) {
      throw new Error('Request was cancelled');
    }
    
    // Build query string
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      status,
      search,
    });

    // Add date range if provided
    if (dateRange?.start && dateRange?.end) {
      params.append('dateStart', dateRange.start.toISOString());
      params.append('dateEnd', dateRange.end.toISOString());
    }

    // Call the API route instead of direct Supabase query
    const response = await fetch(`/api/admin/applications?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json();
      const error = new Error(errorData.error || 'Failed to fetch applications');
      error.status = response.status;
      throw error;
    }

    const result = await response.json();

    // The API route now returns data in the same format, so just return it
    return result;
  }

  async getApplicationById(id) {
    const { data, error } = await this.supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
        notifications(id, notification_type, status, sent_at)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    // Process the data
    const inspectionForm = data.property_owner_forms?.find(
      (f) => f.form_type === 'inspection_form'
    );
    const resaleCertificate = data.property_owner_forms?.find(
      (f) => f.form_type === 'resale_certificate'
    );

    return {
      ...data,
      forms: {
        inspectionForm: inspectionForm || { status: 'not_created', id: null },
        resaleCertificate: resaleCertificate || { status: 'not_created', id: null },
      },
      notifications: data.notifications || [],
    };
  }

  // Applicant methods
  async getUserApplications(userId) {
    const { data, error } = await this.supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(name, property_owner_email, property_owner_name),
        property_owner_forms(id, form_type, status, completed_at, form_data, response_data),
        notifications(id, notification_type, status, sent_at)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data?.map((app) => {
      const inspectionForm = app.property_owner_forms?.find(
        (f) => f.form_type === 'inspection_form'
      );
      const resaleCertificate = app.property_owner_forms?.find(
        (f) => f.form_type === 'resale_certificate'
      );

      return {
        ...app,
        forms: {
          inspectionForm: inspectionForm || { status: 'not_created', id: null },
          resaleCertificate: resaleCertificate || { status: 'not_created', id: null },
        },
        notifications: app.notifications || [],
      };
    }) || [];
  }

  async createApplication(applicationData) {
    const { data, error } = await this.supabase
      .from('applications')
      .insert(applicationData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateApplication(id, updates) {
    const { data, error } = await this.supabase
      .from('applications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteApplication(id) {
    const { error } = await this.supabase
      .from('applications')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  // PDF and email operations
  async generatePdf(applicationId, formData) {
    const response = await fetch('/api/regenerate-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, formData }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to generate PDF');
    }

    return result;
  }

  async sendApprovalEmail(applicationId) {
    const response = await fetch('/api/send-approval-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to send approval email');
    }

    return result;
  }

  // Statistics for dashboard
  async getApplicationStats(dateRange = null) {
    let query = this.supabase
      .from('applications')
      .select('status, created_at', { count: 'exact' });

    if (dateRange?.start && dateRange?.end) {
      query = query
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      submitted: 0,
      awaiting_property_owner_response: 0,
      under_review: 0,
      completed: 0,
      approved: 0,
      needs_attention: 0,
    };

    data?.forEach(app => {
      if (stats.hasOwnProperty(app.status)) {
        stats[app.status]++;
      }
    });

    return stats;
  }
}

export const applicationsApi = new ApplicationsApi();
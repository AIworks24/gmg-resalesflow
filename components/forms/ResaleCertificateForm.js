import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { mapFormDataToPDFFields } from '../../lib/pdfService';

const ResaleCertificateForm = ({ applicationId, token }) => {
  const supabase = createClientComponentClient();
  const [formData, setFormData] = useState({
    hoaProperty: '',
    propertyAddress: '',
    submitterName: '',
    submitterEmail: '',
    submitterPhone: '',
    salePrice: '',
    closingDate: '',
    datePrepared: new Date().toISOString().split('T')[0],
    associationName: '',
    associationAddress: '',
    locationCountyCity: '',
    // Test checkbox field
    testCheckbox: false,
    // Restraints on alienation
    restraintsExist: null, // null = neither selected, true = "is", false = "is not"
    // Add more fields as needed
  });
  const [originalSupabaseData, setOriginalSupabaseData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [pdfBytes, setPdfBytes] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const iframeRef = useRef();

  // Load existing form data if editing
  useEffect(() => {
    const loadFormData = async () => {
      if (!applicationId && !token) return;
      setLoading(true);
      let query = supabase.from('property_owner_forms').select('id, form_data, response_data').eq('form_type', 'resale_certificate').limit(1);
      if (applicationId) query = query.eq('application_id', applicationId);
      if (token) query = query.eq('access_token', token);
      const { data, error } = await query.single();
      if (data && (data.form_data || data.response_data)) {
        // Use the complete form_data without any trimming
        const loaded = data.form_data || data.response_data;
        setFormData(loaded);
        setOriginalSupabaseData(loaded);
      }
      setLoading(false);
    };
    loadFormData();
    // eslint-disable-next-line
  }, [applicationId, token]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRestraintsChange = (value) => {
    setFormData((prev) => ({ ...prev, restraintsExist: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Save to Supabase
      let query = supabase.from('property_owner_forms');
      let upsertData = {
        form_data: formData,
        form_type: 'resale_certificate',
        status: 'in_progress',
        recipient_email: formData.submitterEmail || 'admin@gmgva.com',
        updated_at: new Date().toISOString(),
      };
      
      if (applicationId) {
        upsertData.application_id = applicationId;
      }
      
      if (token) {
        upsertData.access_token = token;
      }
      
      // Use the appropriate conflict resolution strategy
      let conflictField;
      if (token) {
        // If we have a token, use that for conflict resolution
        conflictField = 'access_token';
      } else if (applicationId) {
        // If we only have application_id, we need to check if a form exists first
        const { data: existingForm } = await supabase
          .from('property_owner_forms')
          .select('id, access_token')
          .eq('application_id', applicationId)
          .eq('form_type', 'resale_certificate')
          .single();
        
        if (existingForm) {
          // Update existing form
          const { error: updateError } = await supabase
            .from('property_owner_forms')
            .update(upsertData)
            .eq('id', existingForm.id);
          
          if (updateError) throw updateError;
        } else {
          // Create new form
          upsertData.access_token = crypto.randomUUID();
          const { error: insertError } = await supabase
            .from('property_owner_forms')
            .insert(upsertData);
          
          if (insertError) throw insertError;
        }
      } else {
        throw new Error('Either applicationId or token is required');
      }
      
      // Optionally generate PDF using original Supabase data
      const dataForPDF = originalSupabaseData || formData;
      // New PDF.co + Supabase upload flow should be implemented here
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Error saving form');
    } finally {
      setLoading(false);
    }
  };

  const handleRegeneratePDF = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/regenerate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formData: originalSupabaseData || formData,
          applicationId,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Failed to regenerate PDF');
      setSuccess(true);
      // Optionally: use result.pdfUrl
    } catch (err) {
      setError(err.message || true);
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  // Utility function to safely convert ArrayBuffer to base64
  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">Resale Certificate Form</h2>
      <div className="mb-4">
        <label className="block mb-1">HOA Property</label>
        <input name="hoaProperty" value={formData.hoaProperty} onChange={handleChange} className="w-full border px-3 py-2 rounded" required />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Property Address</label>
        <input name="propertyAddress" value={formData.propertyAddress} onChange={handleChange} className="w-full border px-3 py-2 rounded" required />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Submitter Name</label>
        <input name="submitterName" value={formData.submitterName} onChange={handleChange} className="w-full border px-3 py-2 rounded" required />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Submitter Email</label>
        <input name="submitterEmail" value={formData.submitterEmail} onChange={handleChange} className="w-full border px-3 py-2 rounded" type="email" required />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Submitter Phone</label>
        <input name="submitterPhone" value={formData.submitterPhone} onChange={handleChange} className="w-full border px-3 py-2 rounded" required />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Sale Price</label>
        <input name="salePrice" value={formData.salePrice} onChange={handleChange} className="w-full border px-3 py-2 rounded" type="number" />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Closing Date</label>
        <input name="closingDate" value={formData.closingDate} onChange={handleChange} className="w-full border px-3 py-2 rounded" type="date" />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Date Prepared</label>
        <input name="datePrepared" value={formData.datePrepared} onChange={handleChange} className="w-full border px-3 py-2 rounded" type="date" />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Association Name</label>
        <input name="associationName" value={formData.associationName} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Association Address</label>
        <input name="associationAddress" value={formData.associationAddress} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
      </div>
      <div className="mb-4">
        <label className="block mb-1">Location (County/City)</label>
        <input name="locationCountyCity" value={formData.locationCountyCity} onChange={handleChange} className="w-full border px-3 py-2 rounded" />
      </div>
      
      {/* Test checkbox field */}
      <div className="mb-4">
        <label className="flex items-center">
          <input 
            name="testCheckbox" 
            type="checkbox" 
            checked={formData.testCheckbox} 
            onChange={(e) => setFormData(prev => ({ ...prev, testCheckbox: e.target.checked }))} 
            className="mr-2" 
          />
          Test Checkbox (Group3) - Check this to test the first checkbox
        </label>
      </div>
      
      {/* Restraints on Alienation Section */}
      <div className="mb-6 p-4 border rounded bg-gray-50">
        <h3 className="font-semibold mb-3">Restraints on Alienation</h3>
        <div className="space-y-2">
          <label className="flex items-center">
            <input 
              name="restraintsIs" 
              type="radio" 
              checked={formData.restraintsExist === true}
              onChange={() => handleRestraintsChange(true)} 
              className="mr-2" 
            />
            There <strong>is</strong> any restraint on free alienability of any of the units. See Appendix 3.
          </label>
          <label className="flex items-center">
            <input 
              name="restraintsIsNot" 
              type="radio" 
              checked={formData.restraintsExist === false}
              onChange={() => handleRestraintsChange(false)} 
              className="mr-2" 
            />
            There <strong>is not</strong> any restraint on free alienability of any of the units. See Appendix 3.
          </label>
        </div>
      </div>
      
      {/* Add more fields as needed */}
      <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded" disabled={loading}>
        {loading ? 'Saving...' : 'Submit'}
      </button>
      {success && <div className="mt-4 text-green-600">Form saved successfully!</div>}
      {error && <div className="mt-4 text-red-600">{error}</div>}
    </form>
  );
};

export default ResaleCertificateForm;

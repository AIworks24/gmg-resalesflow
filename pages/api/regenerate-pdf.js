
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { mapFormDataToPDFFields, generateAndUploadPDF } from '../../lib/pdfService';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const startTime = Date.now();
  
  try {
    // Verify user is authenticated and has admin role
    const supabaseAuth = createPagesServerClient({ req, res });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user has admin, staff, or accounting role
    const { data: profile } = await supabaseAuth
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['admin', 'staff', 'accounting'].includes(profile.role)) {
      return res.status(403).json({ error: 'Forbidden - Admin access required' });
    }

    const { formData: rawFormData, applicationId, propertyGroupId, propertyName } = req.body;
    
    // Use service role key for server-side operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Check if this is a property-specific PDF generation
    const isPropertySpecific = propertyGroupId && propertyName;
    
    if (isPropertySpecific) {
      // Update property group status to indicate PDF generation started
      await supabase
        .from('application_property_groups')
        .update({
          pdf_status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', propertyGroupId);
    } else {
      // Update application status to indicate PDF generation started
      await supabase
        .from('applications')
        .update({
          pdf_generated_at: new Date().toISOString()
        })
        .eq('id', applicationId);
    }
    
    // Extract resale certificate data from nested structure if needed
    let actualFormData = rawFormData;
    if (rawFormData && typeof rawFormData === 'object') {
      // Check if data is nested under resaleCertificate key
      if (rawFormData.resaleCertificate) {
        actualFormData = rawFormData.resaleCertificate;
        // Also check if there's form_data or response_data nested
        if (actualFormData.form_data) {
          actualFormData = actualFormData.form_data;
        } else if (actualFormData.response_data) {
          actualFormData = actualFormData.response_data;
        }
      } else if (rawFormData.form_data) {
        actualFormData = rawFormData.form_data;
      } else if (rawFormData.response_data) {
        actualFormData = rawFormData.response_data;
      }
    }
    
    // Fetch application and property data to enrich formData
    const { data: applicationData, error: appError } = await supabase
      .from('applications')
      .select(`
        *,
        hoa_properties(id, name, address, location, property_owner_name, property_owner_email)
      `)
      .eq('id', applicationId)
      .single();
    
    // Start with the extracted formData and enrich it
    let enrichedFormData = actualFormData || {};
    
    if (applicationData) {
      // Helper function to get value or fallback (handles empty strings)
      const getValueOrFallback = (value, fallback) => {
        if (value == null || value === '') return (fallback || '');
        if (typeof value === 'string' && value.trim() === '') return (fallback || '');
        return value;
      };
      
      // Enrich formData with application-level data (formData takes precedence, but empty strings should use fallback)
      enrichedFormData = {
        // Spread existing formData first to preserve all fields
        ...actualFormData,
        // Override with enriched values (only if formData value is missing or empty)
        developmentName: getValueOrFallback(actualFormData?.developmentName, applicationData.hoa_properties?.name),
        associationName: getValueOrFallback(actualFormData?.associationName, applicationData.hoa_properties?.name),
        associationAddress: getValueOrFallback(actualFormData?.associationAddress, applicationData.hoa_properties?.address || applicationData.hoa_properties?.location),
        developmentLocation: getValueOrFallback(actualFormData?.developmentLocation, applicationData.hoa_properties?.location),
        lotAddress: getValueOrFallback(actualFormData?.lotAddress, applicationData.property_address),
        salePrice: getValueOrFallback(actualFormData?.salePrice || actualFormData?.sale_price, applicationData.sale_price),
        closingDate: getValueOrFallback(actualFormData?.closingDate || actualFormData?.closing_date, applicationData.closing_date),
        // Ensure preparer object exists (merge with existing if present)
        preparer: {
          name: actualFormData?.preparer?.name || applicationData.hoa_properties?.property_owner_name || '',
          company: actualFormData?.preparer?.company || 'Goodman Management Group',
          email: actualFormData?.preparer?.email || applicationData.hoa_properties?.property_owner_email || '',
          address: actualFormData?.preparer?.address || applicationData.hoa_properties?.address || '',
          phone: actualFormData?.preparer?.phone || ''
        },
        // Ensure managingAgent object exists (merge with existing if present)
        managingAgent: {
          name: actualFormData?.managingAgent?.name || applicationData.hoa_properties?.property_owner_name || '',
          company: actualFormData?.managingAgent?.company || 'Goodman Management Group',
          email: actualFormData?.managingAgent?.email || applicationData.hoa_properties?.property_owner_email || '',
          address: actualFormData?.managingAgent?.address || applicationData.hoa_properties?.address || '',
          phone: actualFormData?.managingAgent?.phone || '',
          licenseNumber: actualFormData?.managingAgent?.licenseNumber || ''
        },
        // Ensure disclosures object exists if missing (preserve existing)
        disclosures: actualFormData?.disclosures || {}
      };
      
      // Force enrichment if values are still missing (double-check)
      if (!enrichedFormData.developmentName || !enrichedFormData.associationName) {
        if (applicationData.hoa_properties?.name) {
          if (!enrichedFormData.developmentName) enrichedFormData.developmentName = applicationData.hoa_properties.name;
          if (!enrichedFormData.associationName) enrichedFormData.associationName = applicationData.hoa_properties.name;
          if (!enrichedFormData.associationAddress) enrichedFormData.associationAddress = applicationData.hoa_properties.address || applicationData.hoa_properties.location || '';
          if (!enrichedFormData.lotAddress) enrichedFormData.lotAddress = applicationData.property_address || '';
        }
      }
    }
    
    // Set a maximum timeout for the entire operation
    const operationTimeout = setTimeout(() => {
      console.error(`⏰ PDF generation timeout for application ${applicationId}${isPropertySpecific ? `, property: ${propertyName}` : ''}`);
    }, 30000); // 30 seconds total timeout
    
    const fields = mapFormDataToPDFFields(enrichedFormData);
    const apiKey = process.env.PDFCO_API_KEY;
    
    // Generate different file paths for property-specific vs application-wide PDFs
    const outputPdfPath = isPropertySpecific 
      ? `resale-certificates/${applicationId}/resale-certificate-${applicationId}-${propertyGroupId}.pdf`
      : `resale-certificates/${applicationId}/resale-certificate-${applicationId}.pdf`;
    
    const bucketName = 'bucket0';

    const { publicURL } = await generateAndUploadPDF(fields, outputPdfPath, apiKey, supabase, bucketName);
    
    clearTimeout(operationTimeout);

    // Update the appropriate table with the new PDF URL
    const generatedAt = new Date();
    const generationTime = Date.now() - startTime;
    
    if (isPropertySpecific) {
      // Update property group with PDF information
      const { error: updateError } = await supabase
        .from('application_property_groups')
        .update({
          pdf_url: publicURL,
          pdf_status: 'completed',
          pdf_completed_at: generatedAt.toISOString(),
          updated_at: generatedAt.toISOString()
        })
        .eq('id', propertyGroupId);
      
      if (updateError) {
        console.error('Failed to update property group pdf_url:', updateError);
      }
    } else {
      // Update applications table with PDF information
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          pdf_url: publicURL,
          pdf_generated_at: generatedAt.toISOString(),
          pdf_completed_at: generatedAt.toISOString()
        })
        .eq('id', applicationId);
      
      if (updateError) {
        console.error('Failed to update application pdf_url:', updateError);
      }
    }

    return res.status(200).json({ 
      success: true, 
      pdfUrl: publicURL,
      generationTimeMs: generationTime,
      propertySpecific: isPropertySpecific,
      propertyName: propertyName
    });
  } catch (error) {
    console.error('Failed to regenerate PDF:', error);
    
    // Update status to indicate PDF generation failed
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      const { propertyGroupId } = req.body;
      
      if (propertyGroupId) {
        // Update property group status to indicate PDF generation failed
        await supabase
          .from('application_property_groups')
          .update({
            pdf_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', propertyGroupId);
      }
    } catch (updateError) {
      console.error('Failed to update PDF error status:', updateError);
    }
    
    return res.status(500).json({ error: error.message });
  }
} 
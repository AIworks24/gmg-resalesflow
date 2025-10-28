
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

    const { formData, applicationId, propertyGroupId, propertyName } = req.body;
    
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
    
    console.log(`🚀 Starting PDF generation for application ${applicationId}${isPropertySpecific ? `, property: ${propertyName}` : ''}`);
    
    // Set a maximum timeout for the entire operation
    const operationTimeout = setTimeout(() => {
      console.error(`⏰ PDF generation timeout for application ${applicationId}${isPropertySpecific ? `, property: ${propertyName}` : ''}`);
    }, 30000); // 30 seconds total timeout
    
    const fields = mapFormDataToPDFFields(formData);
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

    console.log(`✅ PDF generation completed for application ${applicationId}${isPropertySpecific ? `, property: ${propertyName}` : ''} in ${generationTime}ms`);
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
      } else {
        // Note: Could add error tracking here if needed
        console.log(`PDF generation failed for application ${req.body.applicationId}: ${error.message}`);
      }
    } catch (updateError) {
      console.error('Failed to update PDF error status:', updateError);
    }
    
    return res.status(500).json({ error: error.message });
  }
} 
/**
 * Background Job Handler for PDF Analysis
 * Processes PDF analysis asynchronously and stores results
 */

import { createClient } from '@supabase/supabase-js';
import formidable from 'formidable';
import fs from 'fs';
import { extractPDFFields } from '../../lib/ai/pdfAnalyzer.js';
import { generateMappingSuggestions } from '../../lib/ai/mappingSuggestions.js';
import { analyzeWithFallback } from '../../lib/ai/aiProvider.js';
import { convertPDFPageToImage } from '../../lib/ai/pdfAnalyzer.js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Process PDF analysis job
 */
async function processPDFAnalysis(jobId, pdfBuffer, userId) {
  try {
    // Update job status to processing
    await supabase
      .from('pdf_analysis_jobs')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', jobId);

    // Extract fields
    const result = await extractPDFFields(pdfBuffer);
    let extractedFields = result.fields || [];
    let metadata = result.metadata || {};
    let formTitle = metadata.formTitle || '';

    // AI vision analysis if needed
    if (extractedFields.length > 0) {
      const hasGenericNames = extractedFields.some(field => {
        const name = (field.name || '').toLowerCase();
        return name.includes('question') || 
               name.length < 4 || 
               /^[a-z]{1,4}$/.test(name);
      });

      if (hasGenericNames || !formTitle) {
        try {
          const imageBuffer = await convertPDFPageToImage(pdfBuffer, 1, 2.0);
          // Run AI vision analysis (simplified version)
          // ... AI vision code here ...
        } catch (error) {
          console.error('AI vision failed:', error);
        }
      }
    }

    // Generate mapping suggestions
    let mappingSuggestions = [];
    try {
      const { getApplicationFieldsSchema } = await import('../../lib/ai/mappingSuggestions.js');
      const applicationSchema = getApplicationFieldsSchema();
      mappingSuggestions = await generateMappingSuggestions(
        extractedFields,
        applicationSchema,
        true
      );
    } catch (error) {
      console.error('Mapping generation failed:', error);
    }

    // Convert to form structure
    const { convertToFormStructure } = await import('./analyze-pdf.js');
    const formStructure = convertToFormStructure(extractedFields, mappingSuggestions, formTitle);

    // Update job with results
    await supabase
      .from('pdf_analysis_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: {
          formStructure,
          formTitle,
          metadata,
          extractedFieldsCount: extractedFields.length,
          mappingSuggestionsCount: mappingSuggestions.length
        }
      })
      .eq('id', jobId);

  } catch (error) {
    console.error('PDF analysis job failed:', error);
    await supabase
      .from('pdf_analysis_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: error.message
      })
      .eq('id', jobId);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Create job
  const { data: job, error: jobError } = await supabase
    .from('pdf_analysis_jobs')
    .insert({
      status: 'pending',
      created_by: req.body.userId || null
    })
    .select()
    .single();

  if (jobError) {
    return res.status(500).json({ error: 'Failed to create job', details: jobError });
  }

  // Process in background (non-blocking)
  processPDFAnalysis(job.id, req.body.pdfBuffer, req.body.userId).catch(console.error);

  // Return job ID immediately
  return res.status(202).json({
    success: true,
    jobId: job.id,
    status: 'pending',
    message: 'PDF analysis started. Check job status for results.'
  });
}


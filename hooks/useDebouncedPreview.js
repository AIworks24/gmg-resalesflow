import { useState, useEffect, useRef } from 'react';

/**
 * Hook for debounced PDF preview generation
 * @param {Uint8Array} pdfTemplate - PDF template bytes
 * @param {Object} formStructure - Form structure
 * @param {Object} fieldMappings - PDF field mappings
 * @param {Object} previewData - Preview data
 * @param {number} delay - Debounce delay in ms (default: 300)
 * @returns {Object} - { previewPdf, isGenerating, error }
 */
export function useDebouncedPreview(
  pdfTemplate,
  formStructure,
  fieldMappings,
  previewData,
  delay = 300,
  formTitle = 'Form Preview',
  creationMethod = 'visual'
) {
  const [previewPdf, setPreviewPdf] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const timeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Abort previous request if still running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // For visual builder: Don't generate if no form structure
    // For AI import: Don't generate if no PDF template
    if (creationMethod === 'visual') {
      if (!formStructure || !formStructure.sections || formStructure.sections.length === 0) {
        setPreviewPdf(null);
        return;
      }
    } else {
      if (!pdfTemplate || !formStructure) {
        setPreviewPdf(null);
        return;
      }
    }

    // Set loading state
    setIsGenerating(true);
    setError(null);

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    // Debounce preview generation
    timeoutRef.current = setTimeout(async () => {
      try {
        // For visual form builder: Generate new PDF from form structure
        // For AI import: Would use pdfTemplate to fill existing PDF
        const isVisualBuilder = creationMethod === 'visual' || (!pdfTemplate && formStructure?.sections && formStructure.sections.length > 0);
        
        let filledPdf;
        
        if (isVisualBuilder) {
          // Generate new PDF with GMG branding from form structure
          // Use API route since @react-pdf/renderer only works server-side
          console.log('Generating new PDF from form structure...', {
            sections: formStructure?.sections?.length || 0,
            fields: formStructure?.sections?.reduce((sum, s) => sum + (s.fields?.length || 0), 0) || 0
          });
          
          const response = await fetch('/api/form-builder/generate-pdf', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              formStructure,
              previewData,
              formTitle: formTitle || 'Form Preview'
            }),
            signal: abortControllerRef.current?.signal
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
          }

          // Get PDF as ArrayBuffer
          const arrayBuffer = await response.arrayBuffer();
          filledPdf = new Uint8Array(arrayBuffer);
        } else {
          // Fill existing PDF template (for AI import workflow)
          const { generateLivePreview } = await import('../lib/formBuilder/previewGenerator');
          
          console.log('Filling existing PDF template...', {
            sections: formStructure?.sections?.length || 0,
            mappings: Object.keys(fieldMappings).length
          });
          
          filledPdf = await generateLivePreview(
            pdfTemplate,
            formStructure,
            fieldMappings,
            previewData
          );
        }

        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          return;
        }

        // Create blob URL for react-pdf
        const blob = new Blob([filledPdf], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        
        // Cleanup previous blob
        if (previewPdf) {
          URL.revokeObjectURL(previewPdf);
        }
        
        setPreviewPdf(url);
        setError(null);
        console.log('Preview generated successfully');
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // Request was aborted, ignore
        }
        console.error('Preview generation failed:', err);
        setError(err.message || 'Failed to generate preview');
        setPreviewPdf(null);
      } finally {
        if (!abortControllerRef.current?.signal.aborted) {
          setIsGenerating(false);
        }
      }
    }, delay);

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Cleanup blob URL
      if (previewPdf) {
        URL.revokeObjectURL(previewPdf);
      }
    };
  }, [pdfTemplate, formStructure, fieldMappings, previewData, delay, formTitle, creationMethod]);

  return { previewPdf, isGenerating, error };
}


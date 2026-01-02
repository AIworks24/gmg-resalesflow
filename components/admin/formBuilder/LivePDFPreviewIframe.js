import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { useDebouncedPreview } from '../../../hooks/useDebouncedPreview';

/**
 * PDF Preview using iframe - Clean, focused view of the PDF
 */
export default function LivePDFPreviewIframe({
  pdfTemplate,
  formStructure,
  fieldMappings,
  previewData,
  formTitle = 'Form Preview',
  creationMethod = 'visual'
}) {
  const [scale, setScale] = useState(1.0);

  // Use debounced preview hook
  const { previewPdf, isGenerating, error } = useDebouncedPreview(
    pdfTemplate,
    formStructure,
    fieldMappings,
    previewData,
    300,
    formTitle,
    creationMethod
  );

  const handleZoomIn = () => setScale(s => Math.min(2, s + 0.25));
  const handleZoomOut = () => setScale(s => Math.max(0.5, s - 0.25));

  // Show empty state if no form structure
  if (!formStructure || !formStructure.sections || formStructure.sections.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100 p-4">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-200 rounded-lg mx-auto mb-4 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-sm text-gray-600 mb-2">Add fields to see PDF preview</p>
          <p className="text-xs text-gray-500">PDF will be generated with GMG branding</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Minimal Controls - Only show when needed */}
      {previewPdf && (
        <div className="flex items-center justify-end gap-2 p-2 bg-white border-b border-gray-200">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-xs text-gray-600 min-w-[45px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      )}

      {/* PDF Viewer - Full focus on PDF */}
      <div className="flex-1 overflow-auto bg-gray-100 relative">
        {isGenerating && (
          <div className="absolute inset-0 bg-white bg-opacity-90 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Generating preview...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute top-4 left-4 right-4 z-10 bg-red-50 border border-red-200 rounded-lg p-3 shadow-sm">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {previewPdf ? (
          <div className="h-full w-full flex items-center justify-center">
            <iframe
              src={previewPdf}
              className="w-full h-full border-0"
              style={{
                width: '100%',
                height: '100%'
              }}
              title="PDF Preview"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Preparing preview...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCw, Loader2 } from 'lucide-react';
import { useDebouncedPreview } from '../../../hooks/useDebouncedPreview';

// Dynamically import react-pdf only on client-side to avoid SSR issues
const Document = dynamic(
  () => import('react-pdf').then((mod) => mod.Document),
  { ssr: false }
);

const Page = dynamic(
  () => import('react-pdf').then((mod) => mod.Page),
  { ssr: false }
);

export default function LivePDFPreview({
  pdfTemplate,
  formStructure,
  fieldMappings,
  previewData,
  formTitle = 'Form Preview',
  creationMethod = 'visual'
}) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [pdfjsInitialized, setPdfjsInitialized] = useState(false);

  // Set up PDF.js worker and import CSS only on client-side
  useEffect(() => {
    if (typeof window !== 'undefined' && !pdfjsInitialized) {
      // Import CSS dynamically
      import('react-pdf/dist/Page/AnnotationLayer.css').catch(() => {});
      import('react-pdf/dist/Page/TextLayer.css').catch(() => {});
      
      // Set up PDF.js worker using CDN (avoids webpack bundling issues)
      import('react-pdf').then((mod) => {
        try {
          // Use CDN for worker to avoid webpack issues
          mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${mod.pdfjs.version}/pdf.worker.min.js`;
          setPdfjsInitialized(true);
        } catch (error) {
          console.warn('Failed to initialize PDF.js worker:', error);
          // Try alternative worker path
          mod.pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.js`;
          setPdfjsInitialized(true);
        }
      }).catch((error) => {
        console.error('Failed to load react-pdf:', error);
      });
    }
  }, [pdfjsInitialized]);

  // Use debounced preview hook
  const { previewPdf, isGenerating, error } = useDebouncedPreview(
    pdfTemplate,
    formStructure,
    fieldMappings,
    previewData,
    300, // 300ms debounce
    formTitle,
    creationMethod
  );

  const handleZoomIn = () => setScale(s => Math.min(3, s + 0.25));
  const handleZoomOut = () => setScale(s => Math.max(0.5, s - 0.25));
  const handlePrevPage = () => setPageNumber(p => Math.max(1, p - 1));
  const handleNextPage = () => setPageNumber(p => Math.min(numPages || 1, p + 1));
  const handleRotate = () => setRotation(r => (r + 90) % 360);

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
    <div className="h-full flex flex-col bg-gray-100">
      {/* Controls */}
      <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium min-w-[60px] text-center text-gray-700">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 3}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRotate}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Rotate"
          >
            <RotateCw className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handlePrevPage}
            disabled={pageNumber <= 1}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium min-w-[80px] text-center text-gray-700">
            {numPages ? `Page ${pageNumber} of ${numPages}` : 'Loading...'}
          </span>
          <button
            onClick={handleNextPage}
            disabled={!numPages || pageNumber >= numPages}
            className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto p-4 bg-gray-100 relative">
        {isGenerating && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Generating preview...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {previewPdf ? (
          <div className="flex justify-center">
            <Document
              file={previewPdf}
              onLoadSuccess={({ numPages }) => {
                setNumPages(numPages);
                setPageNumber(1);
              }}
              onLoadError={(error) => {
                console.error('PDF load error:', error);
                setError('Failed to load PDF preview');
              }}
              loading={
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Loading PDF...</p>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                rotate={rotation}
                renderAnnotationLayer={true}
                renderTextLayer={true}
                className="mx-auto shadow-lg"
              />
            </Document>
          </div>
        ) : (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
            <p className="text-sm text-gray-600">Preparing preview...</p>
          </div>
        )}
      </div>
    </div>
  );
}


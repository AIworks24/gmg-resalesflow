import React, { useRef, useState } from 'react';
import { CheckCircle, Clock, FileText, InfoIcon, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchWithImpersonation } from '../lib/apiWithImpersonation';
import {
  isPdf,
  uploadLqPdfDirect,
  parseUploadError,
  LQ_SERVER_UPLOAD_MAX_BYTES,
} from '../lib/lenderQuestionnaireUpload';

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Uploading the lender's form is what submits a lender questionnaire application:
// /api/upload-lender-questionnaire moves it to under_review, notifies the property
// owner and emails the requester. There is no separate submit action.
export default function LenderQuestionnaireUpload({ applicationId, onUploaded }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [needsConversion, setNeedsConversion] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleFileSelect = (file) => {
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      setError('Invalid file type. Please upload PDF, DOC, or DOCX files only.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('File size exceeds 10MB limit.');
      return;
    }

    setError('');
    setNeedsConversion(fileExt !== '.pdf');
    setSelectedFile(file);
    setUploadSuccess(false);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setNeedsConversion(false);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile || !applicationId) {
      setError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setIsConverting(false);
    setUploadSuccess(false);
    setError('');

    let progressInterval;

    try {
      // PDFs upload directly to storage (bypassing the ~4.5MB serverless body
      // limit); DOC/DOCX still go through the server for conversion to PDF.
      const willConvert = !isPdf(selectedFile.name);

      if (willConvert && selectedFile.size > LQ_SERVER_UPLOAD_MAX_BYTES) {
        throw new Error(
          'Word documents must be under 4MB. Please upload a PDF instead — PDFs of any size are supported.'
        );
      }

      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (willConvert && prev >= 40 && prev < 80) return prev + 2;
          if (prev >= 90) return prev;
          return prev + (willConvert ? 5 : 10);
        });
      }, 200);

      if (willConvert) {
        setTimeout(() => setIsConverting(true), 1000);
      }

      let response;
      if (willConvert) {
        const body = new FormData();
        body.append('file', selectedFile);
        body.append('applicationId', applicationId);
        response = await fetchWithImpersonation('/api/upload-lender-questionnaire', {
          method: 'POST',
          body,
        });
      } else {
        const filePath = await uploadLqPdfDirect(supabase, {
          applicationId,
          kind: '',
          file: selectedFile,
          upsert: false,
        });
        response = await fetchWithImpersonation('/api/upload-lender-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, filePath }),
        });
      }

      clearInterval(progressInterval);
      setUploadProgress(100);
      setIsConverting(false);

      if (!response.ok) {
        throw new Error(await parseUploadError(response));
      }

      setUploadSuccess(true);
      setIsUploading(false);

      if (onUploaded) await onUploaded();
    } catch (err) {
      clearInterval(progressInterval);
      console.error('Error uploading lender questionnaire:', err);
      setIsConverting(false);
      setUploadSuccess(false);
      setUploadProgress(0);
      setError(err.message || 'Failed to upload lender questionnaire. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Upload the Lender's Questionnaire</h2>
      <p className="text-sm text-gray-600 mb-4">
        Your payment is complete. Upload the questionnaire form your lender provided and we'll begin
        processing it right away — our staff will complete the form and return it to you.
      </p>

      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragging
            ? 'border-green-500 bg-green-50'
            : selectedFile
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 hover:border-green-400'
        }`}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
        {!selectedFile ? (
          <>
            <p className="text-lg font-medium text-gray-700 mb-2">
              Drag and drop your lender's questionnaire form here
            </p>
            <p className="text-sm text-gray-500 mb-4">or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Browse Files
            </button>
            <p className="text-xs text-gray-500 mt-4">Accepted formats: PDF, DOC, DOCX (Max 10MB)</p>
          </>
        ) : (
          <div className="space-y-4">
            <FileText className="h-12 w-12 mx-auto text-green-600" />
            <p className="text-lg font-medium text-gray-700">{selectedFile.name}</p>
            <p className="text-sm text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            {needsConversion && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-center gap-2 text-blue-700">
                  <InfoIcon className="h-4 w-4" />
                  <p className="text-sm font-medium">This file will be converted to PDF automatically</p>
                </div>
              </div>
            )}
            {!isUploading && !uploadSuccess && (
              <button
                type="button"
                onClick={clearFile}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove File
              </button>
            )}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {isUploading && (
        <div className="mt-4 space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className={`h-2.5 rounded-full transition-all duration-300 ${
                isConverting ? 'bg-blue-600' : 'bg-green-600'
              }`}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            {isConverting ? (
              <>
                <Clock className="h-4 w-4 text-blue-600 animate-spin" />
                <p className="text-sm text-blue-600 font-medium">
                  Converting to PDF... {uploadProgress}%
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Uploading... {uploadProgress}%</p>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!selectedFile || isUploading || uploadSuccess}
        className="mt-6 w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
      >
        {uploadSuccess ? (
          <>
            <CheckCircle className="h-5 w-5" />
            Upload Complete
          </>
        ) : isUploading ? (
          isConverting ? (
            <>
              <Clock className="h-5 w-5 animate-spin" />
              Converting...
            </>
          ) : (
            'Uploading...'
          )
        ) : (
          'Submit Questionnaire'
        )}
      </button>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { formatDate } from '../../lib/timeUtils';
import {
  Upload,
  FileText,
  Download,
  Trash2,
  Calendar,
  AlertCircle,
  Loader2,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Image as ImageIcon,
  File,
  FileCheck
} from 'lucide-react';

// Predefined document types for all properties
const DOCUMENT_TYPES = [
  { key: 'architectural_guidelines', name: 'VA Appendix 02/Architectural Guidelines', required: false },
  { key: 'declaration_ccrs', name: 'VA Appendix 02/Declaration-CC&Rs', required: false },
  { key: 'resolutions_policies', name: 'VA Appendix 02/Resolutions and Policies', required: false },
  { key: 'balance_sheet', name: 'VA Appendix 10/Balance Sheet & Income/Expense Statement-Current Unaudited', required: false },
  { key: 'budget', name: 'VA Appendix 11/Budget', required: false },
  { key: 'reserve_study', name: 'VA Appendix 12/Reserve Study-Reserve Study Summary', required: false },
  { key: 'insurance_dec', name: 'VA Appendix 14/Insurance Dec Page', required: false },
  { key: 'board_minutes', name: 'VA Appendix 17/Board Meeting Minutes-Regular Meeting Minutes', required: false },
  { key: 'association_minutes', name: 'VA Appendix 18/Association Meeting Minutes-Annual Board Meeting Minutes', required: false },
  { key: 'annual_registration', name: 'VA Appendix 30/Annual Registration', required: false },
  { key: 'articles_incorporation', name: 'Articles of Incorporation', required: false },
  { key: 'bylaws', name: 'Bylaws', required: false },
  { key: 'litigation', name: 'Litigation', required: false },
  { key: 'rules_regulations', name: 'Rules and Regulations', required: false },
  { key: 'special_assessments', name: 'Special Assessments', required: false },
  { key: 'unit_ledger', name: 'Unit Ledger', required: false },
  { key: 'welcome_package', name: 'Welcome Package (New Owner Forms)', required: false },
  { key: 'public_offering_statement', name: 'Public Offering Statement', required: false }
];

const PropertyFileManagement = ({ propertyId, propertyName, initialDocumentKey }) => {
  // State: documents grouped by document_key
  const [documentsByKey, setDocumentsByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({});
  const [pendingDates, setPendingDates] = useState({}); // Track pending date values per document
  const hasExpandedInitialSection = useRef(false); // Track if we've already expanded the initial section
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [documentName, setDocumentName] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [isNotApplicable, setIsNotApplicable] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (propertyId) {
      loadPropertyDocuments();
    }
  }, [propertyId]);

  // Auto-expand the section for the initial document key after documents are loaded
  useEffect(() => {
    if (initialDocumentKey && !loading && !hasExpandedInitialSection.current && Object.keys(documentsByKey).length > 0) {
      // Check if the document key exists in the loaded documents
      if (documentsByKey[initialDocumentKey] && documentsByKey[initialDocumentKey].length > 0) {
        setExpandedSections(prev => ({
          ...prev,
          [initialDocumentKey]: true
        }));
        hasExpandedInitialSection.current = true;
        
        // Scroll to the section after a brief delay to ensure it's rendered
        setTimeout(() => {
          const sectionElement = document.querySelector(`[data-document-key="${initialDocumentKey}"]`);
          if (sectionElement) {
            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    }
  }, [initialDocumentKey, loading, documentsByKey]);

  // Set up real-time subscription for property_documents table
  useEffect(() => {
    if (!propertyId) return;

    console.log('🔔 Setting up real-time subscription for property_documents:', propertyId);

    const channel = supabase
      .channel(`property-documents-${propertyId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'property_documents',
          filter: `property_id=eq.${propertyId}`, // Only listen to changes for this property
        },
        (payload) => {
          console.log('Real-time property document change detected:', payload.eventType, payload.new?.id || payload.old?.id);
          
          // Reload documents to get fresh data
          loadPropertyDocuments();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to property_documents real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to property_documents real-time updates');
        }
      });

    // Cleanup subscription on unmount or propertyId change
    return () => {
      console.log('🔕 Unsubscribing from property_documents real-time updates');
      supabase.removeChannel(channel);
    };
  }, [propertyId, supabase]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showModal && !event.target.closest('.modal-content')) {
        // Don't close if clicking on upload progress indicators
        if (!event.target.closest('.upload-progress')) {
          handleCloseModal();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModal]);

  const loadPropertyDocuments = async () => {
    try {
      setLoading(true);
      
      const { data: documents, error } = await supabase
        .from('property_documents')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const grouped = {};
      
      if (documents && documents.length > 0) {
        documents.forEach(doc => {
          if (!grouped[doc.document_key]) {
            grouped[doc.document_key] = [];
          }
          
          // Include all documents with files
          if (doc.file_path) {
            grouped[doc.document_key].push(doc);
          }
        });
      }
      
      setDocumentsByKey(grouped);
      // Clear pending dates when documents reload to sync with database
      setPendingDates({});
    } catch (error) {
      console.error('Error loading property documents:', error);
      alert('Error loading documents: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openUploadModal = (docType) => {
    setSelectedDocType(docType);
    setShowModal(true);
    setSelectedFile(null);
    setDocumentName('');
    setDocumentDescription('');
    setExpirationDate('');
    setIsNotApplicable(false);
    setUploadProgress(0);
    setIsUploading(false);
  };

  const handleCloseModal = () => {
    if (!isUploading) {
      setShowModal(false);
      setSelectedDocType(null);
      setSelectedFile(null);
      setDocumentName('');
      setDocumentDescription('');
      setExpirationDate('');
      setIsNotApplicable(false);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileSelect = (file) => {
    // Validate file type
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg'];
    const fileExt = '.' + file.name.split('.').pop().toLowerCase();
    
    if (!allowedTypes.includes(fileExt)) {
      alert('Invalid file type. Please upload PDF, DOC, DOCX, TXT, PNG, JPG, or JPEG files.');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('File size exceeds 10MB limit.');
      return;
    }

    setSelectedFile(file);
    if (!documentName) {
      setDocumentName(file.name.replace(/\.[^/.]+$/, '')); // Name without extension
    }
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedDocType) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const fileExt = selectedFile.name.split('.').pop();
      const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${selectedDocType.key}_${timestamp}_${sanitizedName}`;
      const filePath = `property_files/${propertyId}/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      // Upload file
      const { error: uploadError } = await supabase.storage
        .from('bucket0')
        .upload(filePath, selectedFile, {
          upsert: false
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) throw uploadError;

      // Create database record
      const documentData = {
        property_id: propertyId,
        document_key: selectedDocType.key,
        document_name: selectedDocType.name,
        file_path: filePath,
        file_name: selectedFile.name,
        display_name: documentName || selectedFile.name,
        is_not_applicable: isNotApplicable,
        expiration_date: isNotApplicable ? null : (expirationDate || null),
        updated_at: new Date().toISOString()
      };

      const { error: dbError } = await supabase
        .from('property_documents')
        .insert(documentData)
        .select()
        .single();

      if (dbError) throw dbError;

      // Reload documents
      await loadPropertyDocuments();
      
      // Close modal after a brief delay to show completion
      setTimeout(() => {
        handleCloseModal();
      }, 500);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file: ' + error.message);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveDocument = async (documentId, filePath) => {
    if (!confirm('Are you sure you want to remove this document?')) return;

    try {
      if (filePath) {
        const { error: storageError } = await supabase.storage
          .from('bucket0')
          .remove([filePath]);

        if (storageError) throw storageError;
      }

      const { error: dbError } = await supabase
        .from('property_documents')
        .delete()
        .eq('id', documentId);

      if (dbError) throw dbError;

      await loadPropertyDocuments();
    } catch (error) {
      console.error('Error removing document:', error);
      alert('Error removing document: ' + error.message);
    }
  };

  const handleDownloadFile = async (filePath, fileName) => {
    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .download(filePath);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || filePath.split('/').pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file: ' + error.message);
    }
  };

  const updateExpirationDate = async (documentId, date) => {
    try {
      // If date is set, automatically uncheck N/A
      const { error } = await supabase
        .from('property_documents')
        .update({
          expiration_date: date || null,
          is_not_applicable: date ? false : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (error) throw error;

      await loadPropertyDocuments();
    } catch (error) {
      console.error('Error updating expiration date:', error);
      alert('Error updating expiration date: ' + error.message);
    }
  };

  const toggleDocumentNotApplicable = async (documentId, currentValue) => {
    try {
      const newValue = !currentValue;
      const { error } = await supabase
        .from('property_documents')
        .update({
          is_not_applicable: newValue,
          expiration_date: newValue ? null : undefined,
          updated_at: new Date().toISOString()
        })
        .eq('id', documentId);

      if (error) throw error;

      await loadPropertyDocuments();
    } catch (error) {
      console.error('Error updating N/A status:', error);
      alert('Error updating N/A status: ' + error.message);
    }
  };


  const toggleSection = (docKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [docKey]: !prev[docKey]
    }));
  };

  const isExpiringSoon = (date, isNA) => {
    if (!date || isNA) return false;
    const expDate = new Date(date);
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expDate >= today && expDate <= thirtyDaysFromNow;
  };

  const isExpired = (date, isNA) => {
    if (!date || isNA) return false;
    return new Date(date) < new Date();
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].includes(ext)) {
      return <ImageIcon className="h-8 w-8 text-blue-500" />;
    }
    if (ext === 'pdf') {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    return <File className="h-8 w-8 text-gray-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-white to-gray-50 rounded-xl shadow-lg border border-gray-100 p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-md">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-900">
                Property Documents
              </h3>
              <p className="text-sm text-gray-500 mt-1">{propertyName}</p>
            </div>
          </div>
          
          <div className="space-y-5">
            {DOCUMENT_TYPES.map((docType) => {
              const documents = documentsByKey[docType.key] || [];
              const isExpanded = expandedSections[docType.key];
              const hasDocuments = documents.length > 0;
              const docCount = documents.length;
              
              const hasExpiringSoon = documents.some(doc => isExpiringSoon(doc.expiration_date, doc.is_not_applicable));
              const hasExpired = documents.some(doc => isExpired(doc.expiration_date, doc.is_not_applicable));
              
              return (
                <div
                  key={docType.key}
                  data-document-key={docType.key}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-green-200"
                >
                  {/* Section Header */}
                  <div className="p-5 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="p-2 bg-blue-50 rounded-lg">
                            <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-semibold text-gray-900 text-base">
                              {docType.name}
                            </h4>
                            {docType.required && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                                Required
                              </span>
                            )}
                            {hasDocuments && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                                {docCount} {docCount === 1 ? 'document' : 'documents'}
                              </span>
                            )}
                            {hasExpiringSoon && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>Expiring Soon</span>
                              </div>
                            )}
                            {hasExpired && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <span>Expired</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 ml-4">
                        {hasDocuments && (
                          <button
                            onClick={() => toggleSection(docType.key)}
                            className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:scale-110"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Documents List (Expanded) */}
                  {hasDocuments && isExpanded && (
                    <div className="border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                      <div className="p-5 space-y-4">
                        {documents.map((doc) => {
                          const expiringSoon = isExpiringSoon(doc.expiration_date, doc.is_not_applicable);
                          const expired = isExpired(doc.expiration_date, doc.is_not_applicable);
                          
                          return (
                            <div
                              key={doc.id}
                              className={`bg-white border-2 rounded-xl p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
                                expired ? 'border-red-200 bg-gradient-to-br from-red-50 to-white' : 
                                expiringSoon ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-white' : 
                                'border-gray-200 hover:border-green-200'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg">
                                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-900 truncate text-base">
                                        {doc.display_name || doc.file_name || doc.file_path?.split('/').pop() || 'Document'}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-3">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3.5 w-3.5" />
                                      Uploaded: {formatDate(doc.created_at)}
                                    </span>
                                    {doc.updated_at !== doc.created_at && (
                                      <span className="flex items-center gap-1">
                                        <FileCheck className="h-3.5 w-3.5" />
                                        Updated: {formatDate(doc.updated_at)}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="space-y-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
                                    <div className="flex items-center gap-2">
                                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={doc.is_not_applicable || false}
                                          onChange={() => toggleDocumentNotApplicable(doc.id, doc.is_not_applicable || false)}
                                          className="rounded border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 focus:ring-offset-1 h-4 w-4"
                                        />
                                        <span className="text-gray-700 font-medium">N/A (Not Applicable)</span>
                                      </label>
                                    </div>
                                    {!doc.is_not_applicable && (
                                      <div className="flex flex-wrap items-center gap-3">
                                        <label className="flex items-center gap-2 text-sm">
                                          <Calendar className="h-4 w-4 text-gray-500" />
                                          <span className="text-gray-700 font-medium">Expiration:</span>
                                          <input
                                            type="date"
                                            value={pendingDates[doc.id] !== undefined ? pendingDates[doc.id] : (doc.expiration_date || '')}
                                            onChange={(e) => {
                                              // Update local state so input shows the new value
                                              // This allows the date picker to work properly
                                              // We don't save to database here - that happens on blur
                                              const newValue = e.target.value;
                                              setPendingDates(prev => ({
                                                ...prev,
                                                [doc.id]: newValue
                                              }));
                                            }}
                                            onBlur={(e) => {
                                              // Only save when the date picker closes (onBlur fires)
                                              // When navigating months with arrows, the picker stays open so onBlur doesn't fire
                                              // When clicking a specific date, the picker closes and onBlur fires immediately
                                              const documentId = doc.id;
                                              const newValue = e.target.value;
                                              const currentValue = doc.expiration_date || '';
                                              
                                              // Clear pending date
                                              setPendingDates(prev => {
                                                const updated = { ...prev };
                                                delete updated[documentId];
                                                return updated;
                                              });
                                              
                                              // Only update if the value actually changed
                                              if (newValue !== currentValue) {
                                                updateExpirationDate(documentId, newValue || null);
                                              }
                                            }}
                                            className={`text-sm border-2 rounded-lg px-3 py-1.5 font-medium transition-all ${
                                              expired ? 'border-red-300 bg-red-50 text-red-700' : 
                                              expiringSoon ? 'border-amber-300 bg-amber-50 text-amber-700' : 
                                              'border-gray-300 bg-white hover:border-green-400 focus:border-green-500 focus:ring-2 focus:ring-green-500'
                                            }`}
                                          />
                                          {expired && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                                              Expired
                                            </span>
                                          )}
                                          {expiringSoon && !expired && (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                              Expires in {Math.ceil((new Date(doc.expiration_date) - new Date()) / (1000 * 60 * 60 * 24))} days
                                            </span>
                                          )}
                                        </label>
                                      </div>
                                    )}
                                    {doc.is_not_applicable && (
                                      <p className="text-xs text-gray-500 italic bg-gray-100 px-2 py-1 rounded border border-gray-200">Expiration date is not applicable for this document</p>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button
                                    onClick={() => handleDownloadFile(doc.file_path, doc.file_name)}
                                    className="p-2.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md border border-blue-200 hover:border-blue-300"
                                    title="Download"
                                  >
                                    <Download className="h-5 w-5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveDocument(doc.id, doc.file_path)}
                                    className="p-2.5 text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 hover:scale-110 hover:shadow-md border border-red-200 hover:border-red-300"
                                    title="Remove"
                                  >
                                    <Trash2 className="h-5 w-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Document Button */}
                  <div className={`border-t border-gray-200 p-5 ${hasDocuments && !isExpanded ? 'bg-white' : 'bg-gradient-to-br from-gray-50 to-white'}`}>
                    <button
                      onClick={() => openUploadModal(docType)}
                      className="group relative flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 font-semibold"
                    >
                      <div className="p-1 bg-white/20 rounded-lg group-hover:bg-white/30 transition-colors">
                        <Plus className="h-5 w-5" />
                      </div>
                      <span>Add Document</span>
                    </button>
                    
                    {!hasDocuments && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-sm text-blue-700 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          <span>No documents uploaded yet. Click "Add Document" to upload your first file.</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showModal && selectedDocType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="modal-content bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 animate-slideUp">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-green-50 to-white">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                  <Upload className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Upload Document</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Upload your document for <span className="font-semibold text-gray-900">{selectedDocType.name}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                disabled={isUploading}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Drag and Drop Zone */}
              <div
                ref={dropZoneRef}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-green-500 bg-gradient-to-br from-green-50 to-green-100 scale-105 shadow-lg'
                    : selectedFile
                    ? 'border-green-400 bg-gradient-to-br from-green-50 to-white shadow-md'
                    : 'border-gray-300 bg-gradient-to-br from-gray-50 to-white hover:border-green-400 hover:bg-gradient-to-br hover:from-green-50 hover:to-white hover:shadow-lg hover:scale-[1.02]'
                }`}
              >
                {selectedFile ? (
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      {getFileIcon(selectedFile.name)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setDocumentName('');
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex justify-center">
                      <Upload className="h-12 w-12 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-gray-700 font-medium">
                        Drag and drop files here, or{' '}
                        <span className="text-green-600 underline">browse</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        Supports PDF, DOC, DOCX, TXT, PNG, JPG, JPEG up to 10MB
                      </p>
                    </div>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileInputChange}
                  accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                />
              </div>

              {/* Document Details */}
              {selectedFile && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Document Name <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={documentName}
                      onChange={(e) => setDocumentName(e.target.value)}
                      placeholder="Enter a name for this document"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      maxLength={255}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave blank to use the file name
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Description <span className="text-gray-400">(optional)</span>
                    </label>
                    <textarea
                      value={documentDescription}
                      onChange={(e) => setDocumentDescription(e.target.value)}
                      placeholder="Add a description for this document"
                      rows={3}
                      maxLength={400}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none"
                    />
                    <p className="text-xs text-gray-500 mt-1 text-right">
                      {documentDescription.length}/400
                    </p>
                  </div>

                  <div>
                    <div className="mb-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={isNotApplicable}
                          onChange={(e) => {
                            setIsNotApplicable(e.target.checked);
                            if (e.target.checked) {
                              setExpirationDate('');
                            }
                          }}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span>N/A (Not Applicable)</span>
                      </label>
                      <p className="text-xs text-gray-500 mt-1 ml-6">
                        Check if expiration date is not applicable for this document
                      </p>
                    </div>
                    
                    {!isNotApplicable && (
                      <>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          <Calendar className="h-4 w-4 inline mr-1" />
                          Expiration Date <span className="text-gray-400">(optional)</span>
                        </label>
                        <input
                          type="date"
                          value={expirationDate}
                          onChange={(e) => setExpirationDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Set when this document expires
                        </p>
                      </>
                    )}
                    {isNotApplicable && (
                      <p className="text-xs text-gray-500 italic">
                        Expiration date is not applicable for this document
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <button
                onClick={handleCloseModal}
                disabled={isUploading}
                className="px-5 py-2.5 text-gray-700 bg-white border-2 border-gray-300 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || isUploading}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:from-green-700 hover:to-green-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-5 w-5" />
                    <span>Upload</span>
                  </>
                )}
              </button>
            </div>

            {/* Upload Progress Indicator */}
            {isUploading && uploadProgress > 0 && (
              <div className="px-6 pb-6">
                <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-green-600 h-full transition-all duration-300 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Processing...'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default PropertyFileManagement;

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Upload,
  FileText,
  Check,
  X,
  Download,
  Trash2,
  Calendar,
  AlertCircle,
  Loader2
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

const PropertyFileManagement = ({ propertyId, propertyName }) => {
  const [files, setFiles] = useState({});
  const [uploading, setUploading] = useState({});
  const [loading, setLoading] = useState(true);
  const [notApplicable, setNotApplicable] = useState({});
  const [expirationDates, setExpirationDates] = useState({});
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    if (propertyId) {
      loadPropertyFiles();
      loadPropertySettings();
    }
  }, [propertyId]);

  const loadPropertyFiles = async () => {
    try {
      setLoading(true);
      
      // Get all files for this property
      const { data: fileList, error: listError } = await supabase.storage
        .from('bucket0')
        .list(`property_files/${propertyId}`, {
          limit: 100,
          offset: 0
        });

      if (listError) throw listError;

      // Create a map of document types to files
      const fileMap = {};
      if (fileList && fileList.length > 0) {
        for (const file of fileList) {
          // Match file to document type based on the filename pattern
          const docType = DOCUMENT_TYPES.find(doc => 
            file.name.includes(doc.key)
          );
          
          if (docType) {
            fileMap[docType.key] = {
              name: file.name,
              size: file.metadata?.size || 0,
              updated_at: file.updated_at || file.created_at,
              path: `property_files/${propertyId}/${file.name}`
            };
          }
        }
      }
      
      setFiles(fileMap);
    } catch (error) {
      console.error('Error loading property files:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPropertySettings = async () => {
    try {
      // Load N/A settings and expiration dates from database
      const { data, error } = await supabase
        .from('property_documents')
        .select('*')
        .eq('property_id', propertyId);

      if (error) throw error;

      if (data && data.length > 0) {
        const naSettings = {};
        const expDates = {};
        
        data.forEach(doc => {
          if (doc.is_not_applicable) {
            naSettings[doc.document_key] = true;
          }
          if (doc.expiration_date) {
            expDates[doc.document_key] = doc.expiration_date;
          }
        });
        
        setNotApplicable(naSettings);
        setExpirationDates(expDates);
      }
    } catch (error) {
      console.error('Error loading property settings:', error);
    }
  };

  const handleFileUpload = async (docType, file) => {
    if (!file) return;

    setUploading(prev => ({ ...prev, [docType.key]: true }));
    
    try {
      // Remove old file if exists
      if (files[docType.key]) {
        await supabase.storage
          .from('bucket0')
          .remove([files[docType.key].path]);
      }

      // Upload new file with structured naming
      const fileExt = file.name.split('.').pop();
      const fileName = `${docType.key}.${fileExt}`;
      const filePath = `property_files/${propertyId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('bucket0')
        .upload(filePath, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Update or create database record
      const { error: dbError } = await supabase
        .from('property_documents')
        .upsert({
          property_id: propertyId,
          document_key: docType.key,
          document_name: docType.name,
          file_path: filePath,
          is_not_applicable: false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'property_id,document_key'
        });

      if (dbError) throw dbError;

      // Reload files
      await loadPropertyFiles();
      
      // Clear N/A status if it was set
      if (notApplicable[docType.key]) {
        setNotApplicable(prev => {
          const newState = { ...prev };
          delete newState[docType.key];
          return newState;
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file: ' + error.message);
    } finally {
      setUploading(prev => ({ ...prev, [docType.key]: false }));
    }
  };

  const handleRemoveFile = async (docType) => {
    if (!files[docType.key]) return;

    try {
      const { error } = await supabase.storage
        .from('bucket0')
        .remove([files[docType.key].path]);

      if (error) throw error;

      // Update database record
      await supabase
        .from('property_documents')
        .delete()
        .eq('property_id', propertyId)
        .eq('document_key', docType.key);

      // Update local state
      setFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[docType.key];
        return newFiles;
      });
    } catch (error) {
      console.error('Error removing file:', error);
      alert('Error removing file: ' + error.message);
    }
  };

  const handleDownloadFile = async (docType) => {
    if (!files[docType.key]) return;

    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .download(files[docType.key].path);

      if (error) throw error;

      // Create download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = files[docType.key].name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file: ' + error.message);
    }
  };

  const toggleNotApplicable = async (docType) => {
    const newValue = !notApplicable[docType.key];
    
    try {
      const { error } = await supabase
        .from('property_documents')
        .upsert({
          property_id: propertyId,
          document_key: docType.key,
          document_name: docType.name,
          is_not_applicable: newValue,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'property_id,document_key'
        });

      if (error) throw error;

      setNotApplicable(prev => ({
        ...prev,
        [docType.key]: newValue
      }));

      // If marking as N/A, remove any uploaded file
      if (newValue && files[docType.key]) {
        await handleRemoveFile(docType);
      }
    } catch (error) {
      console.error('Error updating N/A status:', error);
      alert('Error updating status: ' + error.message);
    }
  };

  const updateExpirationDate = async (docType, date) => {
    try {
      const { error } = await supabase
        .from('property_documents')
        .upsert({
          property_id: propertyId,
          document_key: docType.key,
          document_name: docType.name,
          expiration_date: date,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'property_id,document_key'
        });

      if (error) throw error;

      setExpirationDates(prev => ({
        ...prev,
        [docType.key]: date
      }));
    } catch (error) {
      console.error('Error updating expiration date:', error);
      alert('Error updating expiration date: ' + error.message);
    }
  };

  const isExpiringSoon = (date) => {
    if (!date) return false;
    const expDate = new Date(date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expDate <= thirtyDaysFromNow;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Property Documents - {propertyName}
        </h3>
        
        <div className="space-y-3">
          {DOCUMENT_TYPES.map((docType) => {
            const file = files[docType.key];
            const isNA = notApplicable[docType.key];
            const expDate = expirationDates[docType.key];
            const expiringSoon = isExpiringSoon(expDate);
            
            return (
              <div
                key={docType.key}
                className={`border rounded-lg p-4 ${
                  isNA ? 'bg-gray-50 border-gray-300' : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <h4 className="font-medium text-gray-900">
                        {docType.name}
                      </h4>
                      {docType.required && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                          Required
                        </span>
                      )}
                      {expiringSoon && (
                        <div className="flex items-center gap-1 text-amber-600">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-xs">Expiring Soon</span>
                        </div>
                      )}
                    </div>
                    
                    {file && !isNA && (
                      <div className="mt-2 text-sm text-gray-600">
                        <p>File: {file.name}</p>
                        <p>Updated: {new Date(file.updated_at).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* N/A Checkbox */}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={isNA}
                        onChange={() => toggleNotApplicable(docType)}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="text-gray-600">N/A</span>
                    </label>
                    
                    {/* Expiration Date */}
                    {!isNA && (
                      <input
                        type="date"
                        value={expDate || ''}
                        onChange={(e) => updateExpirationDate(docType, e.target.value)}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                        placeholder="Expiration"
                      />
                    )}
                    
                    {/* File Actions */}
                    {!isNA && (
                      <>
                        {file ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDownloadFile(docType)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Download"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleRemoveFile(docType)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Remove"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => handleFileUpload(docType, e.target.files[0])}
                              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                            />
                            <div className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700">
                              {uploading[docType.key] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                              <span className="text-sm">Upload</span>
                            </div>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PropertyFileManagement;
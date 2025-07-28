import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import {
  Building,
  Plus,
  Edit,
  Trash2,
  Search,
  Users,
  LogOut,
  X,
  Save,
  MapPin,
  Mail,
  Phone,
  User,
  ChevronDown,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import AdminLayout from './AdminLayout';

const AdminPropertiesManagement = ({ userRole }) => {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState(null);
  const [propertyFiles, setPropertyFiles] = useState({});
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    property_owner_name: '',
    property_owner_email: '',
    property_owner_phone: '',
    management_contact: '',
    phone: '',
    email: '',
    special_requirements: ''
  });

  const supabase = createClientComponentClient();
  const router = useRouter();

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    loadProperties(currentPage, searchTerm);
  }, [currentPage, pageSize]);

  useEffect(() => {
    if (properties.length > 0) {
      loadAllPropertyFiles();
    }
  }, [properties]);


  // Handle auto-opening edit modal from query parameter
  useEffect(() => {
    if (router.query.edit && properties.length > 0) {
      const propertyId = parseInt(router.query.edit);
      const property = properties.find(p => p.id === propertyId);
      if (property) {
        openEditModal(property);
        // Clean up the query parameter
        router.replace('/admin/properties', undefined, { shallow: true });
      }
    }
  }, [router.query.edit, properties]);


  const loadProperties = async (page = currentPage, search = searchTerm) => {
    try {
      setLoading(true);
      
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('hoa_properties')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true });

      // Apply search filter if provided
      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%,property_owner_name.ilike.%${search}%,property_owner_email.ilike.%${search}%`);
      }

      // Apply pagination
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;
      
      setProperties(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading properties:', error);
    } finally {
      setLoading(false);
    }
  };


  // File management functions
  const loadPropertyFiles = async (propertyId) => {
    try {
      const { data, error } = await supabase.storage
        .from('bucket0')
        .list(`property_files/${propertyId}`, {
          limit: 100,
          offset: 0
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error loading property files:', error);
      return [];
    }
  };

  const loadAllPropertyFiles = async () => {
    const filePromises = properties.map(async (property) => {
      if (property.documents_folder) {
        const files = await loadPropertyFiles(property.id);
        return { propertyId: property.id, files };
      }
      return { propertyId: property.id, files: [] };
    });

    const results = await Promise.all(filePromises);
    const filesMap = {};
    results.forEach(({ propertyId, files }) => {
      filesMap[propertyId] = files;
    });
    setPropertyFiles(filesMap);
  };

  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  };

  const uploadFiles = async (propertyId) => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = selectedFiles.map(async (file) => {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `property_files/${propertyId}/${fileName}`;

        const { error } = await supabase.storage
          .from('bucket0')
          .upload(filePath, file);

        if (error) throw error;
        return filePath;
      });

      await Promise.all(uploadPromises);
      
      // Update the documents_folder field in the database
      const documentsFolder = `bucket0/property_files/${propertyId}`;
      const { error: updateError } = await supabase
        .from('hoa_properties')
        .update({ 
          documents_folder: documentsFolder,
          updated_at: new Date().toISOString()
        })
        .eq('id', propertyId);

      if (updateError) throw updateError;

      setSelectedFiles([]);
      await loadProperties(); // Reload properties to get updated documents_folder
      await loadAllPropertyFiles(); // Reload all files
    } catch (error) {
      console.error('Error uploading files:', error);
      alert('Error uploading files: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const openAddModal = () => {
    setModalMode('add');
    setSelectedProperty(null);
    setFormData({
      name: '',
      location: '',
      property_owner_name: '',
      property_owner_email: '',
      property_owner_phone: '',
      management_contact: '',
      phone: '',
      email: '',
      special_requirements: ''
    });
    setSelectedFiles([]);
    setShowModal(true);
  };

  const openEditModal = (property) => {
    setModalMode('edit');
    setSelectedProperty(property);
    setFormData({
      name: property.name || '',
      location: property.location || '',
      property_owner_name: property.property_owner_name || '',
      property_owner_email: property.property_owner_email || '',
      property_owner_phone: property.property_owner_phone || '',
      management_contact: property.management_contact || '',
      phone: property.phone || '',
      email: property.email || '',
      special_requirements: property.special_requirements || ''
    });
    setSelectedFiles([]);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let propertyId;
      
      if (modalMode === 'add') {
        // Create new property
        const { data, error } = await supabase
          .from('hoa_properties')
          .insert([{
            ...formData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select();

        if (error) throw error;
        propertyId = data[0].id;

      } else {
        // Update existing property
        const { error } = await supabase
          .from('hoa_properties')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedProperty.id);

        if (error) throw error;
        propertyId = selectedProperty.id;
      }

      // Upload files if any are selected
      if (selectedFiles.length > 0) {
        await uploadFiles(propertyId);
      }

      setShowModal(false);
      loadProperties();
    } catch (error) {
      console.error('Error saving property:', error);
      alert('Error saving property: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (!propertyToDelete) return;

    try {
      const { error } = await supabase
        .from('hoa_properties')
        .delete()
        .eq('id', propertyToDelete.id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      setPropertyToDelete(null);
      loadProperties();
    } catch (error) {
      console.error('Error deleting property:', error);
      alert('Error deleting property: ' + error.message);
    }
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to first page when searching
    setTimeout(() => {
      loadProperties(1, value);
    }, 300); // Debounce search
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading properties...</p>
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                Properties Management
              </h1>
              <p className='text-gray-600'>
                Manage HOA properties and associated documents
              </p>
            </div>
            <button
              onClick={() => loadProperties(currentPage, searchTerm)}
              disabled={loading}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </button>
        </div>

        {/* Properties Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Property
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Files
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {properties.map((property) => (
                <tr key={property.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {property.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {property.location || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {property.property_owner_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {property.property_owner_email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <div className="text-sm">
                        {property.documents_folder ? (
                          <div>
                            <div className="text-gray-900 font-medium">
                              {propertyFiles[property.id]?.length || 0} file(s)
                            </div>
                            {propertyFiles[property.id]?.length > 0 && (
                              <div className="text-gray-500 text-xs">
                                {propertyFiles[property.id].slice(0, 2).map((file, index) => (
                                  <div key={index}>
                                    {file.name.split('_').slice(1).join('_')}
                                  </div>
                                ))}
                                {propertyFiles[property.id].length > 2 && (
                                  <div className="text-gray-400">
                                    +{propertyFiles[property.id].length - 2} more
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-500 italic">No files</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => openEditModal(property)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setPropertyToDelete(property);
                        setShowDeleteConfirm(true);
                      }}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow-md border p-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-700">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} properties
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  {modalMode === 'add' ? 'Add Property' : 'Edit Property'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Property Information */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Property Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Richmond, VA 23233"
                    />
                  </div>
                </div>

                {/* Property Owner Information */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Property Owner Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Name
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.property_owner_name}
                        onChange={(e) => setFormData({...formData, property_owner_name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Email
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.property_owner_email}
                        onChange={(e) => setFormData({...formData, property_owner_email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.property_owner_phone}
                        onChange={(e) => setFormData({...formData, property_owner_phone: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Management Information */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Management Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Management Contact
                      </label>
                      <input
                        type="text"
                        value={formData.management_contact}
                        onChange={(e) => setFormData({...formData, management_contact: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({...formData, phone: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Special Requirements */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Special Requirements
                  </label>
                  <textarea
                    rows={3}
                    value={formData.special_requirements}
                    onChange={(e) => setFormData({...formData, special_requirements: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Any special requirements or notes..."
                  />
                </div>

                {/* File Upload */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Property Files</h3>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Upload Files
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        multiple
                        onChange={handleFileSelect}
                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {selectedFiles.length > 0 && (
                        <span className="text-sm text-gray-600">
                          {selectedFiles.length} file(s) selected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Show existing files for edit mode */}
                  {modalMode === 'edit' && selectedProperty && propertyFiles[selectedProperty.id]?.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Files
                      </label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {propertyFiles[selectedProperty.id].map((file, index) => (
                          <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-md">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-700">
                              {file.name.split('_').slice(1).join('_')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        {modalMode === 'add' ? 'Add Property' : 'Update Property'}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h2 className="text-lg font-semibold mb-4">Confirm Delete</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete property "{propertyToDelete?.name}"? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPropertiesManagement; 
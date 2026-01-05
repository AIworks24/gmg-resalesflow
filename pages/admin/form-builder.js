import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminLayout from '../../components/admin/AdminLayout';
import UnifiedFormBuilder from '../../components/admin/formBuilder/UnifiedFormBuilder';
import {
  Plus,
  Upload,
  FileText,
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  Copy,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
  X
} from 'lucide-react';

export default function FormBuilderPage() {
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [creationMethod, setCreationMethod] = useState('visual'); // 'visual' or 'ai_import'
  const [activeJobs, setActiveJobs] = useState({}); // Map of template_id -> job status
  const [allActiveJobs, setAllActiveJobs] = useState([]); // All active jobs (for dedicated section)
  const jobPollIntervalRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

  // Load templates
  React.useEffect(() => {
    loadTemplates();
  }, []);

  // Load active jobs and poll for updates
  React.useEffect(() => {
    loadActiveJobs();
    
    // Poll for active jobs every 5 seconds
    jobPollIntervalRef.current = setInterval(() => {
      loadActiveJobs();
    }, 5000);

    return () => {
      if (jobPollIntervalRef.current) {
        clearInterval(jobPollIntervalRef.current);
      }
    };
  }, [templates]); // Re-run when templates change to match jobs to templates

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('form_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActiveJobs = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find all pending/processing jobs for PDF analysis
      const { data: jobs, error } = await supabase
        .from('ai_processing_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_type', 'pdf_analysis')
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading active jobs:', error);
        return;
      }

      // Store all active jobs for the dedicated section
      setAllActiveJobs(jobs || []);

      // Map jobs to templates
      // Strategy: Match jobs to templates created around the same time (within 2 minutes)
      // that are AI imports and might be incomplete
      const jobsMap = {};
      
      if (jobs && jobs.length > 0) {
        jobs.forEach(job => {
          // Try to find a matching template
          // Look for templates created within 2 minutes of the job
          const jobCreatedAt = new Date(job.created_at);
          const matchingTemplate = templates.find(t => {
            const templateCreatedAt = new Date(t.created_at);
            const timeDiff = Math.abs(templateCreatedAt - jobCreatedAt);
            
            return (
              t.creation_method === 'ai_import' &&
              timeDiff < 2 * 60 * 1000 && // Within 2 minutes
              (!t.form_structure || !t.form_structure.sections || t.form_structure.sections.length === 0)
            );
          });

          if (matchingTemplate) {
            jobsMap[matchingTemplate.id] = {
              status: job.status,
              progress: job.status === 'processing' 
                ? 'AI is analyzing the PDF... This may take 30-60 seconds.' 
                : 'Starting analysis...',
              jobId: job.id,
              fileName: job.input_data?.fileName || 'PDF',
              createdAt: job.created_at
            };
          }
        });
      }

      setActiveJobs(jobsMap);
    } catch (error) {
      console.error('Error loading active jobs:', error);
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (template.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterActive ? template.is_active : true;
    return matchesSearch && matchesFilter;
  });

  const handleCreateNew = (method) => {
    setCreationMethod(method);
    setEditingTemplate(null);
    setShowBuilder(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setCreationMethod(template.creation_method || 'visual');
    setShowBuilder(true);
  };

  const handleCloseBuilder = () => {
    setShowBuilder(false);
    setEditingTemplate(null);
    loadTemplates();
    loadActiveJobs(); // Refresh jobs when returning from builder
  };

  const handleDeleteClick = (template, e) => {
    e.stopPropagation();
    setTemplateToDelete(template);
    setShowDeleteModal(true);
    setOpenMenuId(null); // Close menu
  };

  const handleDeleteConfirm = async () => {
    if (!templateToDelete || isDeleting) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('form_templates')
        .delete()
        .eq('id', templateToDelete.id);

      if (error) throw error;

      // Remove from local state
      setTemplates(prev => prev.filter(t => t.id !== templateToDelete.id));
      setShowDeleteModal(false);
      setTemplateToDelete(null);
    } catch (error) {
      console.error('Error deleting template:', error);
      alert(`Failed to delete form: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
    setTemplateToDelete(null);
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  if (showBuilder) {
    return (
      <AdminLayout>
        <UnifiedFormBuilder
          template={editingTemplate}
          creationMethod={creationMethod}
          onClose={handleCloseBuilder}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Form Builder
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Create and manage form templates for applications
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <button
              onClick={() => handleCreateNew('ai_import')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border-2 border-gray-300 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm hover:shadow-md"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Import PDF</span>
              <span className="sm:hidden">Import</span>
            </button>
            <button
              onClick={() => handleCreateNew('visual')}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create New Form</span>
              <span className="sm:hidden">New Form</span>
            </button>
          </div>
        </div>

        {/* Active AI Analysis Jobs Section */}
        {allActiveJobs.length > 0 && (
          <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <h2 className="text-lg font-semibold text-blue-900">
                  Active AI Analysis Jobs ({allActiveJobs.length})
                </h2>
              </div>
            </div>
            <div className="space-y-3">
              {allActiveJobs.map((job) => {
                const fileName = job.input_data?.fileName || 'PDF';
                const createdAt = new Date(job.created_at);
                const timeAgo = Math.floor((Date.now() - createdAt.getTime()) / 1000);
                const minutesAgo = Math.floor(timeAgo / 60);
                const secondsAgo = timeAgo % 60;
                
                return (
                  <div
                    key={job.id}
                    className="bg-white rounded-lg border border-blue-200 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {fileName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            job.status === 'processing'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {job.status === 'processing' ? 'Analyzing' : 'Pending'}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span>
                            Started {minutesAgo > 0 ? `${minutesAgo}m ${secondsAgo}s` : `${secondsAgo}s`} ago
                          </span>
                          {job.status === 'processing' && (
                            <span className="flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              AI is analyzing the PDF...
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => {
                            // Try to find and open the associated template
                            const matchingTemplate = templates.find(t => {
                              const templateCreatedAt = new Date(t.created_at);
                              const jobCreatedAt = new Date(job.created_at);
                              const timeDiff = Math.abs(templateCreatedAt - jobCreatedAt);
                              return (
                                t.creation_method === 'ai_import' &&
                                timeDiff < 2 * 60 * 1000
                              );
                            });
                            
                            if (matchingTemplate) {
                              handleEdit(matchingTemplate);
                            } else {
                              // If no template found, show message
                              alert('Template not found yet. The form will appear here once analysis completes.');
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-blue-700 mt-4 text-center">
              💡 You can continue working on other pages. Analysis will complete in the background.
            </p>
          </div>
        )}

        {/* Search and Filter */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search templates..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all shadow-sm hover:shadow-md"
            />
          </div>
          <button
            onClick={() => setFilterActive(!filterActive)}
            className={`inline-flex items-center gap-2 px-5 py-3 border-2 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md ${
              filterActive
                ? 'bg-blue-50 border-blue-400 text-blue-700'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400'
            }`}
          >
            <Filter className="w-4 h-4" />
            Active Only
          </button>
        </div>

        {/* Templates List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading templates...</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className="text-center py-16 bg-gradient-to-br from-gray-50 to-white rounded-2xl border-2 border-gray-200 shadow-sm">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">No templates found</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              {searchTerm || filterActive
                ? 'Try adjusting your search or filter to find what you\'re looking for.'
                : 'Get started by creating your first form template'}
            </p>
            {(!searchTerm && !filterActive) && (
              <button
                onClick={() => handleCreateNew('visual')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                <Plus className="w-5 h-5" />
                Create New Form
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="group bg-white rounded-2xl border-2 border-gray-200 shadow-sm hover:shadow-xl transition-all duration-300 p-5 sm:p-6 transform hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0 pr-3">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-gray-900 truncate">
                        {template.name}
                      </h3>
                      {template.is_active ? (
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                        {template.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-5">
                  {activeJobs[template.id] && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200 shadow-sm">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {activeJobs[template.id].progress}
                    </span>
                  )}
                  {template.application_types && template.application_types.length > 0 && (
                    <span className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg border border-blue-200">
                      {template.application_types.length} app type{template.application_types.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {template.task_number && (
                    <span className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg border border-gray-200">
                      Task #{template.task_number}
                    </span>
                  )}
                  {!activeJobs[template.id] && (
                    <span className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                      template.creation_method === 'ai_import'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}>
                      {template.creation_method === 'ai_import' ? 'AI Import' : 'Visual'}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t-2 border-gray-100">
                  <div className="text-xs text-gray-500 font-medium">
                    {template.usage_count || 0} {template.usage_count === 1 ? 'use' : 'uses'}
                  </div>
                  <div className="flex items-center gap-1 relative" ref={openMenuId === template.id ? menuRef : null}>
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-200 group-hover:scale-110"
                      title="Edit"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === template.id ? null : template.id);
                        }}
                        className="p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all duration-200 group-hover:scale-110"
                        title="More options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === template.id && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-lg border-2 border-gray-200 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                          <button
                            onClick={(e) => handleDeleteClick(template, e)}
                            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete Form
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 transform animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Delete Form</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  Are you sure you want to delete <span className="font-semibold">"{templateToDelete?.name}"</span>?
                </p>
                <p className="text-sm text-gray-500">
                  This will permanently delete the form template and all its associated data.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                  className="px-5 py-2.5 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}


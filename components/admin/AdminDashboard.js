import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  FileText, CheckCircle, Clock, AlertTriangle, Eye, Mail, 
  Calendar, DollarSign, Building, User, Filter, Search,
  Download, RefreshCw, MessageSquare, Edit
} from 'lucide-react';

const AdminDashboard = () => {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const supabase = createClientComponentClient();

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, property_owner_email, property_owner_name),
          property_owner_forms(id, form_type, status, completed_at),
          notifications(id, notification_type, status, sent_at)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Process the data to group forms by application
      const processedData = data.map(app => ({
        ...app,
        forms: {
          inspectionForm: app.property_owner_forms?.find(f => f.form_type === 'inspection_form') || { status: 'not_created' },
          resaleCertificate: app.property_owner_forms?.find(f => f.form_type === 'resale_certificate') || { status: 'not_created' }
        },
        notifications: app.notifications || []
      }));

      setApplications(processedData);
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'draft': 'bg-gray-100 text-gray-800',
      'submitted': 'bg-blue-100 text-blue-800',
      'awaiting_property_owner_response': 'bg-yellow-100 text-yellow-800',
      'under_review': 'bg-purple-100 text-purple-800',
      'compliance_completed': 'bg-green-100 text-green-800',
      'approved': 'bg-green-100 text-green-800',
      'completed': 'bg-green-100 text-green-800',
      'rejected': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getFormStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'opened':
        return <Edit className="w-4 h-4 text-blue-600" />;
      case 'sent':
        return <Mail className="w-4 h-4 text-yellow-600" />;
      case 'not_created':
        return <Clock className="w-4 h-4 text-gray-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getFormStatusText = (status) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'opened': return 'In Progress';
      case 'sent': return 'Pending';
      case 'not_created': return 'Not Started';
      default: return 'Unknown';
    }
  };

  const isOverdue = (dueDate) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  const filteredApplications = applications.filter(app => {
    const matchesStatus = selectedStatus === 'all' || app.status === selectedStatus;
    const matchesSearch = searchTerm === '' || 
      app.property_address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.submitter_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.hoa_properties?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesStatus && matchesSearch;
  });

  const statusCounts = applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1;
    return acc;
  }, {});

  const handleCompleteForm = (applicationId, formType) => {
    // This will navigate to the form completion page
    window.open(`/admin/forms/${formType}/${applicationId}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">GMG ResaleFlow Admin Dashboard</h1>
            <p className="text-gray-600">Monitor application workflows and complete required forms</p>
          </div>
          <button
            onClick={loadApplications}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Total Applications</p>
              <p className="text-2xl font-bold text-gray-900">{applications.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-yellow-600" />
            <div>
              <p className="text-sm text-gray-600">Awaiting Action</p>
              <p className="text-2xl font-bold text-gray-900">
                {(statusCounts['submitted'] || 0) + (statusCounts['awaiting_property_owner_response'] || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {(statusCounts['completed'] || 0) + (statusCounts['approved'] || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-gray-600">Needs Attention</p>
              <p className="text-2xl font-bold text-gray-900">
                {applications.filter(app => 
                  app.property_owner_response_due && isOverdue(app.property_owner_response_due) ||
                  app.status === 'under_review'
                ).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="submitted">New Submissions</option>
              <option value="awaiting_property_owner_response">Awaiting Response</option>
              <option value="under_review">Under Review</option>
              <option value="compliance_completed">Compliance Completed</option>
              <option value="approved">Approved</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by property address, submitter, or HOA..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Applications Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Application
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Property Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Forms Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredApplications.map((app) => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">#{app.id}</div>
                        <div className="text-sm text-gray-500">
                          <User className="w-3 h-3 inline mr-1" />
                          {app.submitter_name}
                        </div>
                        <div className="text-xs text-gray-400 capitalize">
                          {app.submitter_type}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{app.property_address}</div>
                    <div className="text-sm text-gray-500">
                      <Building className="w-3 h-3 inline mr-1" />
                      {app.hoa_properties?.name}
                    </div>
                    <div className="text-xs text-gray-400">
                      {app.buyer_name} ← {app.seller_name}
                    </div>
                    <div className="text-xs text-gray-400">
                      <DollarSign className="w-3 h-3 inline mr-1" />
                      ${app.total_amount?.toFixed(2)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(app.status)}`}>
                      {app.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    {app.property_owner_response_due && isOverdue(app.property_owner_response_due) && (
                      <div className="flex items-center gap-1 mt-1 text-red-600">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="text-xs">Overdue</span>
                      </div>
                    )}
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          {getFormStatusIcon(app.forms.inspectionForm.status)}
                          <span className="text-gray-700">Inspection Form</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          app.forms.inspectionForm.status === 'completed' ? 'bg-green-100 text-green-800' :
                          app.forms.inspectionForm.status === 'opened' ? 'bg-blue-100 text-blue-800' :
                          app.forms.inspectionForm.status === 'sent' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getFormStatusText(app.forms.inspectionForm.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          {getFormStatusIcon(app.forms.resaleCertificate.status)}
                          <span className="text-gray-700">Resale Certificate</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          app.forms.resaleCertificate.status === 'completed' ? 'bg-green-100 text-green-800' :
                          app.forms.resaleCertificate.status === 'opened' ? 'bg-blue-100 text-blue-800' :
                          app.forms.resaleCertificate.status === 'sent' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getFormStatusText(app.forms.resaleCertificate.status)}
                        </span>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {app.submitted_at ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>{new Date(app.submitted_at).toLocaleDateString()}</span>
                      </div>
                    ) : (
                      <span className="text-gray-400">Draft</span>
                    )}
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedApplication(app)}
                        className="text-blue-600 hover:text-blue-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                      
                      {app.forms.inspectionForm.status !== 'completed' && (
                        <button
                          onClick={() => handleCompleteForm(app.id, 'inspection')}
                          className="text-green-600 hover:text-green-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-green-50"
                        >
                          <Edit className="w-4 h-4" />
                          Inspection
                        </button>
                      )}
                      
                      {app.forms.resaleCertificate.status !== 'completed' && (
                        <button
                          onClick={() => handleCompleteForm(app.id, 'resale')}
                          className="text-purple-600 hover:text-purple-900 flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-50"
                        >
                          <Edit className="w-4 h-4" />
                          Certificate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredApplications.length === 0 && (
          <div className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
            <p className="text-gray-500">Try adjusting your filters or search terms</p>
          </div>
        )}
      </div>

      {/* Application Detail Modal */}
      {selectedApplication && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-900">
                  Application #{selectedApplication.id} Details
                </h2>
                <button
                  onClick={() => setSelectedApplication(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Application Overview */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Property Information</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Address:</strong> {selectedApplication.property_address}</div>
                    <div><strong>Unit:</strong> {selectedApplication.unit_number || 'N/A'}</div>
                    <div><strong>HOA:</strong> {selectedApplication.hoa_properties?.name}</div>
                    <div><strong>Buyer:</strong> {selectedApplication.buyer_name}</div>
                    <div><strong>Seller:</strong> {selectedApplication.seller_name}</div>
                    <div><strong>Sale Price:</strong> ${selectedApplication.sale_price?.toLocaleString()}</div>
                    <div><strong>Closing Date:</strong> {selectedApplication.closing_date ? new Date(selectedApplication.closing_date).toLocaleDateString() : 'TBD'}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">Submission Details</h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Submitted by:</strong> {selectedApplication.submitter_name}</div>
                    <div><strong>Email:</strong> {selectedApplication.submitter_email}</div>
                    <div><strong>Phone:</strong> {selectedApplication.submitter_phone}</div>
                    <div><strong>Type:</strong> {selectedApplication.submitter_type}</div>
                    <div><strong>License:</strong> {selectedApplication.realtor_license || 'N/A'}</div>
                    <div><strong>Package:</strong> {selectedApplication.package_type}</div>
                    <div><strong>Total Amount:</strong> ${selectedApplication.total_amount?.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Forms Status */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Required Forms</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getFormStatusIcon(selectedApplication.forms.inspectionForm.status)}
                        <span className="font-medium">Property Inspection Form</span>
                      </div>
                      <button
                        onClick={() => handleCompleteForm(selectedApplication.id, 'inspection')}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                      >
                        {selectedApplication.forms.inspectionForm.status === 'completed' ? 'View' : 'Complete'}
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">
                      Status: <span className="capitalize font-medium">{getFormStatusText(selectedApplication.forms.inspectionForm.status)}</span>
                    </div>
                    {selectedApplication.forms.inspectionForm.completed_at && (
                      <div className="text-sm text-gray-600">
                        Completed: {new Date(selectedApplication.forms.inspectionForm.completed_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getFormStatusIcon(selectedApplication.forms.resaleCertificate.status)}
                        <span className="font-medium">Virginia Resale Certificate</span>
                      </div>
                      <button
                        onClick={() => handleCompleteForm(selectedApplication.id, 'resale')}
                        className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                      >
                        {selectedApplication.forms.resaleCertificate.status === 'completed' ? 'View' : 'Complete'}
                      </button>
                    </div>
                    <div className="text-sm text-gray-600">
                      Status: <span className="capitalize font-medium">{getFormStatusText(selectedApplication.forms.resaleCertificate.status)}</span>
                    </div>
                    {selectedApplication.forms.resaleCertificate.completed_at && (
                      <div className="text-sm text-gray-600">
                        Completed: {new Date(selectedApplication.forms.resaleCertificate.completed_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button 
                  onClick={() => setSelectedApplication(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                  Send Forms to Customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Search,
  Building,
  LogOut,
  X,
  Save,
  Eye,
  EyeOff,
  User,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import useAdminAuthStore from '../../stores/adminAuthStore';
import {
  useUsers,
  useUserStats,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  usePrefetchUser,
} from '../../hooks/useUsers';
import AdminLayout from './AdminLayout';

const AdminUsersManagement = () => {
  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({
    show: false,
    message: '',
    type: 'success' // 'success' or 'error'
  });

  // Auto-dismiss snackbar after 4 seconds
  React.useEffect(() => {
    if (snackbar.show) {
      const timer = setTimeout(() => {
        setSnackbar({ show: false, message: '', type: 'success' });
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [snackbar.show]);

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    role: 'staff',
  });

  const router = useRouter();
  const { signOut, user, role } = useAdminAuthStore();
  const prefetchUser = usePrefetchUser();

  // Redirect staff users away from user management (admin only)
  React.useEffect(() => {
    if (role === 'staff') {
      router.push('/admin/dashboard');
    }
  }, [role, router]);

  // React Query hooks
  const {
    data: usersResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useUsers(currentPage, pageSize);

  const users = usersResponse?.data || [];
  const totalUsers = usersResponse?.total || 0;
  const totalPages = usersResponse?.totalPages || 0;

  // Debug logging
  console.log('User Management Debug:', {
    usersResponse,
    users: users.length,
    totalUsers,
    totalPages,
    currentPage,
    pageSize
  });

  const { data: userStats } = useUserStats();

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  // Filter users based on search term (client-side for now)
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    
    const term = searchTerm.toLowerCase();
    return users.filter(user =>
      user.email?.toLowerCase().includes(term) ||
      user.first_name?.toLowerCase().includes(term) ||
      user.last_name?.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const resetForm = () => {
    setFormData({
      email: '',
      password: '',
      first_name: '',
      last_name: '',
      role: 'staff',
    });
    setSelectedUser(null);
    setShowPassword(false);
    setFormError('');
  };

  const handleAddUser = () => {
    resetForm();
    setModalMode('add');
    setShowModal(true);
  };

  const handleEditUser = (user) => {
    setFormData({
      email: user.email || '',
      password: '', // Don't prefill password
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role || 'staff',
    });
    setSelectedUser(user);
    setModalMode('edit');
    setShowModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError(''); // Clear previous errors

    try {
      if (modalMode === 'add') {
        console.log('Creating user with data:', {
          email: formData.email,
          password: formData.password ? '[PROVIDED]' : '[MISSING]',
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
        });

        const result = await createUserMutation.mutateAsync({
          email: formData.email,
          password: formData.password,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
        });

        console.log('User creation successful:', result);
        setShowModal(false);
        resetForm();
        setSnackbar({
          show: true,
          message: `User created successfully! ${formData.first_name} ${formData.last_name} has been added as ${formData.role}.`,
          type: 'success'
        });
      } else {
        const updates = {
          email: formData.email,
          first_name: formData.first_name,
          last_name: formData.last_name,
          role: formData.role,
        };

        // Only include password if it's provided
        if (formData.password.trim()) {
          updates.password = formData.password;
        }

        await updateUserMutation.mutateAsync({
          id: selectedUser.id,
          updates,
        });

        setShowModal(false);
        resetForm();
        setSnackbar({
          show: true,
          message: `User updated successfully! ${formData.first_name} ${formData.last_name} is now ${formData.role}.`,
          type: 'success'
        });
      }
    } catch (error) {
      console.error('Save user error:', error);
      setFormError(error?.message || 'Failed to save user. Please try again.');
      setSnackbar({
        show: true,
        message: error?.message || 'Failed to save user. Please try again.',
        type: 'error'
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await deleteUserMutation.mutateAsync(userToDelete.id);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
      setSnackbar({
        show: true,
        message: `User deleted successfully! ${userToDelete.email} has been removed.`,
        type: 'success'
      });
    } catch (error) {
      console.error('Delete user error:', error);
      setSnackbar({
        show: true,
        message: error?.message || 'Failed to delete user. Please try again.',
        type: 'error'
      });
    }
  };


  const getRoleBadgeColor = (userRole) => {
    switch (userRole) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'staff':
        return 'bg-blue-100 text-blue-800';
      case 'accounting':
        return 'bg-purple-100 text-purple-800';
      case 'user':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-600">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Users</h2>
          <p className="text-gray-600 mb-4">{error?.message || 'Failed to load users'}</p>
          <button 
            onClick={() => refetch()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Try Again
          </button>
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
                User Management
              </h1>
              <p className='text-gray-600'>
                Manage admin and staff users
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleAddUser}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {userStats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total Users</p>
                  <p className="text-2xl font-bold text-gray-900">{userStats.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-red-600" />
                <div>
                  <p className="text-sm text-gray-600">Admins</p>
                  <p className="text-2xl font-bold text-gray-900">{userStats.admin}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Staff</p>
                  <p className="text-2xl font-bold text-gray-900">{userStats.staff}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Accounting</p>
                  <p className="text-2xl font-bold text-gray-900">{userStats.accounting || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md border">
              <div className="flex items-center gap-3">
                <User className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Regular Users</p>
                  <p className="text-2xl font-bold text-gray-900">{userStats.user + userStats.null}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white p-6 rounded-lg shadow-md border mb-8">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-lg shadow-md border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((userItem) => (
                  <tr 
                    key={userItem.id} 
                    className="hover:bg-gray-50"
                    onMouseEnter={() => prefetchUser(userItem.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {userItem.first_name || userItem.last_name
                              ? `${userItem.first_name || ''} ${userItem.last_name || ''}`.trim()
                              : ''}
                          </div>
                          <div className="text-sm text-gray-500">{userItem.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(
                          userItem.role
                        )}`}
                      >
                        {userItem.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(userItem.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEditUser(userItem)}
                          className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center space-x-1"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Edit</span>
                        </button>
                        {role === 'admin' && userItem.id !== user?.id && (
                          <button
                            onClick={() => {
                              setUserToDelete(userItem);
                              setShowDeleteConfirm(true);
                            }}
                            className="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-md hover:bg-red-200 flex items-center space-x-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm ? 'No users found' : 'No users yet'}
              </h3>
              <p className="text-gray-500">
                {searchTerm
                  ? 'Try adjusting your search terms'
                  : 'Get started by adding your first user'}
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {(
          <div className="bg-white rounded-lg shadow-md border p-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-700">
                  Showing {totalUsers > 0 ? ((currentPage - 1) * pageSize) + 1 : 0} to {Math.min(currentPage * pageSize, totalUsers)} of {totalUsers} users
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
                  disabled={currentPage === 1 || totalPages <= 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, Math.max(1, totalPages)) }, (_, i) => {
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
                  disabled={currentPage === totalPages || totalPages <= 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit User Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {modalMode === 'add' ? 'Add New User' : 'Edit User'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {modalMode === 'edit' && '(leave blank to keep current)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={modalMode === 'add'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="accounting">Accounting</option>
                  </select>
                </div>

                {/* Error Display */}
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-red-800 text-sm">{formError}</p>
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createUserMutation.isPending || updateUserMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
                  >
                    {(createUserMutation.isPending || updateUserMutation.isPending) && (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    <Save className="w-4 h-4" />
                    <span>
                      {modalMode === 'add' ? 'Create User' : 'Update User'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && userToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
                <h2 className="text-xl font-bold text-gray-900">Confirm Delete</h2>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete the user "{userToDelete.email}"? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={deleteUserMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center space-x-2 disabled:opacity-50"
                >
                  {deleteUserMutation.isPending && (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  )}
                  <span>Delete User</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Snackbar Notification */}
        {snackbar.show && (
          <div className='fixed bottom-4 right-4 z-[90]'>
            <div className={`
              px-6 py-4 rounded-lg shadow-lg border flex items-center gap-3 max-w-md
              ${snackbar.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
              }
            `}>
              {snackbar.type === 'success' ? (
                <CheckCircle className='w-5 h-5' />
              ) : (
                <AlertTriangle className='w-5 h-5' />
              )}
              <span className='text-sm font-medium'>{snackbar.message}</span>
              <button
                onClick={() => setSnackbar({ show: false, message: '', type: 'success' })}
                className='text-current opacity-70 hover:opacity-100'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminUsersManagement;
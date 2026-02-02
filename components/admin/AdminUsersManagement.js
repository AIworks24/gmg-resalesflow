import React, { useState } from 'react';
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
  UserCircle,
} from 'lucide-react';
import useAdminAuthStore from '../../stores/adminAuthStore';
import useImpersonationStore from '../../stores/impersonationStore';
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
  // Tab state - 'admin' for admin/staff/accounting, 'requester' for requesters
  const [activeTab, setActiveTab] = useState('admin');
  
  // Separate search terms for each tab
  const [adminSearchTerm, setAdminSearchTerm] = useState('');
  const [requesterSearchTerm, setRequesterSearchTerm] = useState('');
  const [debouncedAdminSearchTerm, setDebouncedAdminSearchTerm] = useState('');
  const [debouncedRequesterSearchTerm, setDebouncedRequesterSearchTerm] = useState('');
  
  // Separate pagination for each tab
  const [adminPage, setAdminPage] = useState(1);
  const [requesterPage, setRequesterPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  // UI State
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [showImpersonateConfirm, setShowImpersonateConfirm] = useState(false);
  const [impersonateTargetUser, setImpersonateTargetUser] = useState(null);
  const [userApplicationCount, setUserApplicationCount] = useState(0);
  const [isCheckingApplications, setIsCheckingApplications] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [verifyingUserId, setVerifyingUserId] = useState(null);

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
  const { startImpersonation } = useImpersonationStore();
  const prefetchUser = usePrefetchUser();
  const [impersonatingUserId, setImpersonatingUserId] = useState(null);

  // Impersonation feature: set NEXT_PUBLIC_IMPERSONATE_DISABLED=true in env to disable
  const IMPERSONATE_FEATURE_DISABLED = process.env.NEXT_PUBLIC_IMPERSONATE_DISABLED === 'true';

  // Redirect staff users away from user management (admin only)
  React.useEffect(() => {
    if (role === 'staff') {
      router.push('/admin/dashboard');
    }
  }, [role, router]);

  // Debounce search terms to prevent too many API calls
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAdminSearchTerm(adminSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [adminSearchTerm]);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRequesterSearchTerm(requesterSearchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [requesterSearchTerm]);

  // Reset to page 1 when search changes
  React.useEffect(() => {
    if (debouncedAdminSearchTerm !== '') {
      setAdminPage(1);
    }
  }, [debouncedAdminSearchTerm]);

  React.useEffect(() => {
    if (debouncedRequesterSearchTerm !== '') {
      setRequesterPage(1);
    }
  }, [debouncedRequesterSearchTerm]);

  // Get current tab's search term and page
  const currentSearchTerm = activeTab === 'admin' ? debouncedAdminSearchTerm : debouncedRequesterSearchTerm;
  const currentPage = activeTab === 'admin' ? adminPage : requesterPage;
  const setCurrentPage = activeTab === 'admin' ? setAdminPage : setRequesterPage;

  // React Query hooks - fetch admin roles (admin, staff, accounting) or requesters
  const roleFilter = activeTab === 'admin' ? 'admin,staff,accounting' : 'requester';
  const {
    data: usersResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useUsers(currentPage, pageSize, currentSearchTerm, roleFilter, '');

  const users = usersResponse?.data || [];
  const totalUsers = usersResponse?.total || 0;
  const totalPages = usersResponse?.totalPages || 0;

  // Helper to check if user is admin role (admin, staff, accounting)
  const isAdminRole = (userRole) => {
    return userRole === 'admin' || userRole === 'staff' || userRole === 'accounting';
  };

  const { data: userStats } = useUserStats();

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const deleteUserMutation = useDeleteUser();

  // No need for client-side filtering anymore - server handles it
  const filteredUsers = users;

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
    // Set default role based on active tab
    if (activeTab === 'admin') {
      setFormData(prev => ({ ...prev, role: 'staff' }));
    } else {
      setFormData(prev => ({ ...prev, role: 'requester' }));
    }
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
        
        // Reset to page 1 to see the new user (if filters match)
        setCurrentPage(1);
        
        // Explicitly refetch the users list to ensure it updates immediately
        await refetch();
        
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
        
        // Explicitly refetch the users list to ensure it updates immediately
        await refetch();
        
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

  const checkUserApplications = async (userId) => {
    try {
      setIsCheckingApplications(true);
      const response = await fetch(`/api/admin/check-user-applications?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (response.ok) {
        setUserApplicationCount(result.applicationCount || 0);
      } else {
        console.error('Error checking applications:', result.error);
        setUserApplicationCount(0);
      }
    } catch (error) {
      console.error('Error checking applications:', error);
      setUserApplicationCount(0);
    } finally {
      setIsCheckingApplications(false);
    }
  };

  const handleDeleteClick = async (userItem) => {
    setUserToDelete(userItem);
    setShowDeleteConfirm(true);
    // Check for applications if user is requester
    if (userItem.role === 'requester') {
      await checkUserApplications(userItem.id);
    } else {
      setUserApplicationCount(0);
    }
  };

  const handleImpersonateClick = (userItem) => {
    if (IMPERSONATE_FEATURE_DISABLED) return;
    if (userItem.role !== 'requester' && userItem.role !== null) return;
    setImpersonateTargetUser(userItem);
    setShowImpersonateConfirm(true);
  };

  const handleConfirmImpersonate = async () => {
    if (!impersonateTargetUser) return;
    const userItem = impersonateTargetUser;
    setImpersonatingUserId(userItem.id);
    try {
      const res = await fetch('/api/admin/impersonation-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: userItem.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start impersonation');
      }
      startImpersonation(userItem);
      setShowImpersonateConfirm(false);
      setImpersonateTargetUser(null);
      window.location.href = '/';
    } catch (err) {
      setSnackbar({ show: true, message: err.message || 'Impersonation failed', type: 'error' });
    } finally {
      setImpersonatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    try {
      await deleteUserMutation.mutateAsync(userToDelete.id);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
      setUserApplicationCount(0);
      setSnackbar({
        show: true,
        message: `User deleted successfully! ${userToDelete.email} has been removed.${userToDelete.role === 'requester' && userApplicationCount > 0 ? ` ${userApplicationCount} application(s) were also deleted.` : ''}`,
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
      case 'requester':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const handleVerifyUser = async (userId) => {
    try {
      setVerifyingUserId(userId);
      
      const response = await fetch(`/api/admin/verify-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to verify user');
      }

      setSnackbar({
        show: true,
        message: 'User verified successfully!',
        type: 'success'
      });

      // Refetch users to update the list
      refetch();
    } catch (error) {
      console.error('Verify user error:', error);
      setSnackbar({
        show: true,
        message: error?.message || 'Failed to verify user. Please try again.',
        type: 'error'
      });
    } finally {
      setVerifyingUserId(null);
    }
  };

  const isUserVerified = (user) => {
    return user.email_confirmed_at !== null && user.email_confirmed_at !== undefined;
  };

  // Loading state - only show full loading on initial load (no search term)
  // During search, show the normal UI with loading indicator in table
  const isInitialLoad = isLoading && users.length === 0 && !currentSearchTerm;
  
  if (isInitialLoad) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-600">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>Loading users...</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Error state
  if (isError) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Users</h2>
            <p className="text-gray-600 mb-6">{error?.message || 'Failed to load users'}</p>
            <button 
              onClick={() => refetch()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className='mb-6 sm:mb-8'>
          <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'>
            <div>
              <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight mb-1 sm:mb-2'>
                User Management
              </h1>
              <p className='text-sm text-gray-500'>
                Manage admin, staff, and user accounts
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 hover:text-gray-900 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
                {isFetching ? 'Refreshing...' : 'Refresh'}
              </button>
              <button
                onClick={handleAddUser}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add User
              </button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        {userStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
            <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Total Users</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{userStats.total}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Admins</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{userStats.admin}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Staff</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{userStats.staff}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Accounting</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{userStats.accounting || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <User className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-gray-500 font-medium">Regular Users</p>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">{(userStats.requester || 0) + (userStats.null || 0)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 sm:mb-8 overflow-hidden">
          {/* Tab Headers */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'admin'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Users className="w-4 h-4" />
                  <span>Admin Roles</span>
                  {activeTab === 'admin' && userStats && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {(userStats.admin || 0) + (userStats.staff || 0) + (userStats.accounting || 0)}
                    </span>
                  )}
                </div>
              </button>
              <button
                onClick={() => setActiveTab('requester')}
                className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === 'requester'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <User className="w-4 h-4" />
                  <span>Requesters</span>
                  {activeTab === 'requester' && userStats && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                      {(userStats.requester || 0) + (userStats.null || 0)}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Tab Content - Search Bar */}
          <div className="p-5">
            <div className="relative">
              <Search className='w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400' />
              <input
                type="text"
                placeholder={activeTab === 'admin' ? 'Search admin, staff, or accounting users...' : 'Search requester users...'}
                value={activeTab === 'admin' ? adminSearchTerm : requesterSearchTerm}
                onChange={(e) => {
                  if (activeTab === 'admin') {
                    setAdminSearchTerm(e.target.value);
                  } else {
                    setRequesterSearchTerm(e.target.value);
                  }
                }}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>
            
            {currentSearchTerm && (
              <p className="text-xs sm:text-sm text-gray-500 mt-3">
                Showing <span className="font-medium text-gray-900">{totalUsers}</span> result{totalUsers !== 1 ? 's' : ''}
                {currentSearchTerm && ` • Search: "${currentSearchTerm}"`}
              </p>
            )}
          </div>
        </div>

        {/* Users Table (Desktop) */}
        <div className="hidden sm:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  {activeTab === 'requester' && (
                    <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Verification
                    </th>
                  )}
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading && currentSearchTerm ? (
                  <tr>
                    <td colSpan={activeTab === 'requester' ? 5 : 4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                        <p className="text-gray-600">Searching users...</p>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={activeTab === 'requester' ? 5 : 4} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="w-12 h-12 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900">
                          {currentSearchTerm 
                            ? 'No users found' 
                            : `No ${activeTab === 'admin' ? 'admin roles' : 'requesters'} yet`}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {currentSearchTerm 
                            ? 'Try adjusting your search criteria' 
                            : `Users will appear here once created`}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  users.map((userItem) => (
                    <tr 
                      key={userItem.id} 
                      className="hover:bg-blue-50/30 transition-colors"
                      onMouseEnter={() => prefetchUser(userItem.id)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-gray-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 mb-0.5">
                              {userItem.first_name || userItem.last_name
                                ? `${userItem.first_name || ''} ${userItem.last_name || ''}`.trim()
                                : 'No name'}
                            </div>
                            <div className="text-xs text-gray-500 truncate">{userItem.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(
                            userItem.role
                          )}`}
                        >
                          {userItem.role || 'requester'}
                        </span>
                      </td>
                      {activeTab === 'requester' && (
                        <td className="px-6 py-4 text-center">
                          {isUserVerified(userItem) ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Unverified
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-6 py-4 text-center text-sm text-gray-900">
                        {formatDate(userItem.created_at)}
                      </td>
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {activeTab === 'requester' && userItem.role === 'requester' && !isUserVerified(userItem) && (
                            <button
                              onClick={() => handleVerifyUser(userItem.id)}
                              disabled={verifyingUserId === userItem.id}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {verifyingUserId === userItem.id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Verifying...</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="w-3 h-3" />
                                  <span>Verify</span>
                                </>
                              )}
                            </button>
                          )}
                          {activeTab === 'requester' && (userItem.role === 'requester' || userItem.role == null) && (
                            <button
                              type="button"
                              onClick={() => handleImpersonateClick(userItem)}
                              disabled={IMPERSONATE_FEATURE_DISABLED || impersonatingUserId === userItem.id}
                              title={IMPERSONATE_FEATURE_DISABLED ? 'Coming soon' : undefined}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:hover:bg-gray-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            >
                              {impersonatingUserId === userItem.id ? (
                                <>
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  <span>Starting...</span>
                                </>
                              ) : IMPERSONATE_FEATURE_DISABLED ? (
                                <>
                                  <UserCircle className="w-3 h-3" />
                                  <span>Impersonate</span>
                                </>
                              ) : (
                                <>
                                  <UserCircle className="w-3 h-3" />
                                  <span>Impersonate</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleEditUser(userItem)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                          >
                            <Edit className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                          {role === 'admin' && userItem.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteClick(userItem)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Users List (Mobile) */}
        <div className="sm:hidden space-y-4">
          {isLoading && currentSearchTerm ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Searching users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {currentSearchTerm 
                  ? 'No users found' 
                  : `No ${activeTab === 'admin' ? 'admin roles' : 'requesters'} yet`}
              </h3>
              <p className="text-sm text-gray-500">
                {currentSearchTerm 
                  ? 'Try adjusting your search criteria' 
                  : 'Users will appear here once created'}
              </p>
            </div>
          ) : (
            users.map((userItem) => (
              <div 
                key={userItem.id} 
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4"
                onMouseEnter={() => prefetchUser(userItem.id)}
              >
                {/* Header: Name and Verification (only for requesters) */}
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <User className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-semibold text-gray-900 truncate">
                        {userItem.first_name || userItem.last_name
                          ? `${userItem.first_name || ''} ${userItem.last_name || ''}`.trim()
                          : 'No name'}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">{userItem.email}</p>
                    </div>
                  </div>
                  {activeTab === 'requester' && (
                    isUserVerified(userItem) ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 flex-shrink-0">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 flex-shrink-0">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Unverified
                      </span>
                    )
                  )}
                </div>

                {/* Details Grid */}
                <div className={`grid ${activeTab === 'requester' ? 'grid-cols-2' : 'grid-cols-1'} gap-4 border-t border-gray-100 pt-3`}>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Role</div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoleBadgeColor(userItem.role)}`}>
                      {userItem.role || 'requester'}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Created</div>
                    <div className="text-sm font-medium text-gray-900">{formatDate(userItem.created_at)}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                  {activeTab === 'requester' && userItem.role === 'requester' && !isUserVerified(userItem) && (
                    <button
                      onClick={() => handleVerifyUser(userItem.id)}
                      disabled={verifyingUserId === userItem.id}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {verifyingUserId === userItem.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Verifying...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Verify User</span>
                        </>
                      )}
                    </button>
                  )}
                  {activeTab === 'requester' && (userItem.role === 'requester' || userItem.role == null) && (
                    <button
                      type="button"
                      onClick={() => handleImpersonateClick(userItem)}
                      disabled={IMPERSONATE_FEATURE_DISABLED || impersonatingUserId === userItem.id}
                      title={IMPERSONATE_FEATURE_DISABLED ? 'Coming soon' : undefined}
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg transition-colors font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 disabled:hover:bg-gray-100 bg-amber-50 text-amber-700 hover:bg-amber-100"
                    >
                      {impersonatingUserId === userItem.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Starting...</span>
                        </>
                      ) : IMPERSONATE_FEATURE_DISABLED ? (
                        <>
                          <UserCircle className="w-4 h-4" />
                          <span>Impersonate</span>
                        </>
                      ) : (
                        <>
                          <UserCircle className="w-4 h-4" />
                          <span>Impersonate</span>
                        </>
                      )}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditUser(userItem)}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                    >
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    {role === 'admin' && userItem.id !== user?.id && (
                      <button
                        onClick={() => handleDeleteClick(userItem)}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalUsers > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-500">
                  Showing <span className="font-medium text-gray-900">{totalUsers > 0 ? ((currentPage - 1) * pageSize) + 1 : 0}</span> to <span className="font-medium text-gray-900">{Math.min(currentPage * pageSize, totalUsers)}</span> of <span className="font-medium text-gray-900">{totalUsers}</span> users
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
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
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
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
                        className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'border border-gray-200 hover:bg-gray-50 text-gray-700'
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
                  className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit User Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  {modalMode === 'add' ? 'Add New User' : 'Edit User'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => {
                      const email = e.target.value;
                      // All users are assigned "requester" role by default
                      let newRole = formData.role;
                      // Auto-assign "requester" role for new users without a role
                      if (!newRole) {
                        newRole = 'requester';
                      }
                      setFormData({ ...formData, email, role: newRole });
                    }}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password {modalMode === 'edit' && <span className="text-gray-500 font-normal">(leave blank to keep current)</span>}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required={modalMode === 'add'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  >
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="accounting">Accounting</option>
                    <option value="requester">Requester</option>
                  </select>
                </div>

                {/* Error Display */}
                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-red-800 text-sm">{formError}</p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createUserMutation.isPending || updateUserMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
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

        {/* Impersonation Confirmation Modal */}
        {showImpersonateConfirm && impersonateTargetUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
              <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <UserCircle className="w-5 h-5 text-amber-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Enter impersonation mode</h2>
              </div>
              <div className="p-6">
                <p className="text-gray-600 mb-4">
                  You are about to enter impersonation mode for the user{' '}
                  <span className="font-medium text-gray-900">{impersonateTargetUser.email}</span>.
                </p>
                <ul className="text-sm text-gray-600 space-y-2 mb-6 list-disc list-inside">
                  <li>You will see the applicant portal as this user.</li>
                  <li>Your permissions will be limited to requester-only actions.</li>
                  <li>All payments will be in test mode—no real charges will be made.</li>
                  <li>All actions are logged for audit.</li>
                </ul>
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowImpersonateConfirm(false);
                      setImpersonateTargetUser(null);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmImpersonate}
                    disabled={impersonatingUserId === impersonateTargetUser?.id}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
                  >
                    {impersonatingUserId === impersonateTargetUser?.id && (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    <span>Enter impersonation</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && userToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
              <div className="px-6 py-5 border-b border-gray-200 flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">Confirm Delete</h2>
              </div>
              
              <div className="p-6">
                {isCheckingApplications ? (
                  <div className="flex items-center gap-2 text-gray-600 mb-6">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Checking for applications...</span>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-600 mb-4">
                      Are you sure you want to delete the user <span className="font-medium text-gray-900">"{userToDelete.email}"</span>? This action cannot be undone.
                    </p>
                    
                    {userToDelete.role === 'requester' && userApplicationCount > 0 && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800 mb-1">
                              Warning: This user has {userApplicationCount} application{userApplicationCount !== 1 ? 's' : ''}
                            </p>
                            <p className="text-sm text-yellow-700">
                              All applications associated with this external user will also be deleted (soft delete).
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setUserToDelete(null);
                      setUserApplicationCount(0);
                    }}
                    className="px-4 py-2 border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteUser}
                    disabled={deleteUserMutation.isPending || isCheckingApplications}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
                  >
                    {deleteUserMutation.isPending && (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    )}
                    <span>Delete User</span>
                  </button>
                </div>
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
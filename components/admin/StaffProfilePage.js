import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  User,
  Save,
  Eye,
  EyeOff,
  Building,
  LogOut,
  ChevronDown,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import useAdminAuthStore from '../../stores/adminAuthStore';
import { useUpdateUser } from '../../hooks/useUsers';

const StaffProfilePage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [formError, setFormError] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
  });

  const router = useRouter();
  const { signOut, user, role, profile } = useAdminAuthStore();
  const updateUserMutation = useUpdateUser();

  // Initialize form with current profile data
  useEffect(() => {
    if (profile && user) {
      setFormData({
        email: profile.email || user.email || '',
        password: '',
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
      });
    }
  }, [profile, user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setFormError('');
    setShowSuccessMessage(false);

    try {
      const updates = {
        email: formData.email,
        first_name: formData.first_name,
        last_name: formData.last_name,
      };

      // Only include password if it's provided
      if (formData.password.trim()) {
        updates.password = formData.password;
      }

      await updateUserMutation.mutateAsync({
        id: user.id,
        updates,
      });

      setShowSuccessMessage(true);
      setFormData(prev => ({ ...prev, password: '' })); // Clear password field
      
      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccessMessage(false), 3000);
    } catch (error) {
      console.error('Update profile error:', error);
      setFormError(error?.message || 'Failed to update profile. Please try again.');
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/admin/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 bg-white p-4 rounded-lg shadow-md border">
          <div className="flex items-center gap-3">
            <Building className="w-8 h-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">My Profile</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium"
            >
              Dashboard
            </button>
            <button
              onClick={() => router.push('/admin/properties')}
              className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium"
            >
              Properties
            </button>
            
            {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm font-medium"
              >
                <User className="w-4 h-4" />
                {role && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {role}
                  </span>
                )}
                <ChevronDown className="w-4 h-4" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border z-50">
                  <div className="py-2">
                    <div className="px-4 py-2 text-sm text-gray-700 border-b">
                      <div className="font-medium">Signed in as:</div>
                      <div className="text-gray-600 truncate">{user?.email}</div>
                    </div>
                    <div className="border-t mt-2">
                      <button
                        onClick={() => {
                          handleLogout();
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <LogOut className="w-4 h-4" />
                        Logout
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Success Message */}
        {showSuccessMessage && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Profile updated successfully!</span>
            </div>
          </div>
        )}

        {/* Profile Form */}
        <div className="bg-white rounded-lg shadow-md border p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Update Your Profile</h1>
            <p className="text-gray-600">Manage your personal information and account settings</p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                New Password (leave blank to keep current)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new password to change"
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
              <input
                type="text"
                value={role || 'staff'}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">Your role cannot be changed</p>
            </div>

            {/* Error Display */}
            {formError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3">
                <div className="flex items-center gap-2 text-red-800">
                  <AlertTriangle className="w-5 h-5" />
                  <p className="text-sm">{formError}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={updateUserMutation.isPending}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
              >
                {updateUserMutation.isPending && (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                )}
                <Save className="w-4 h-4" />
                <span>Update Profile</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default StaffProfilePage;
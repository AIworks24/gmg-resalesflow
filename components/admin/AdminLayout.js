import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import useAdminAuthStore from '../../stores/adminAuthStore';
import NotificationBell from './NotificationBell';
import {
  Building,
  User,
  LogOut,
  ChevronDown,
  HelpCircle,
} from 'lucide-react';

const AdminLayout = ({ children, onStartTour }) => {
  const [userEmail, setUserEmail] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { role: userRole, user } = useAdminAuthStore();

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showUserMenu && !event.target.closest('.user-menu-container')) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const navigationItems = [
    { href: '/admin/dashboard', label: 'Dashboard', roles: ['admin', 'staff', 'accounting'] },
    { href: '/admin/applications', label: 'Applications', roles: ['admin', 'staff', 'accounting'] },
    { href: '/admin/properties', label: 'Properties', roles: ['admin', 'staff', 'accounting'] },
    { href: '/admin/reports', label: 'Reports', roles: ['admin', 'staff', 'accounting'] },
    { href: '/admin/users', label: 'Users', roles: ['admin'] },
  ];

  const isActive = (href) => {
    return router.pathname === href;
  };

  const canAccessRoute = (roles) => {
    if (!userRole) return true; // Show all items if userRole is not loaded yet
    return roles.includes(userRole);
  };

  return (
    <div className='min-h-screen bg-gray-100'>
      <header className='w-full bg-white border-b border-gray-200 shadow-sm'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex items-center justify-between h-16'>
            <div className='flex items-center space-x-8'>
              <div className='flex items-center space-x-3'>
                <Building className='w-8 h-8 text-blue-600' />
                <div className='flex flex-col'>
                  <span className='text-lg font-bold text-gray-900'>
                    GMG ResaleFlow
                  </span>
                  <span className='text-xs text-gray-500'>Admin Portal</span>
                </div>
              </div>

              <nav className='hidden md:flex space-x-1'>
                {navigationItems
                  .filter((item) => canAccessRoute(item.roles))
                  .map((item) => (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                        isActive(item.href)
                          ? 'bg-blue-100 text-blue-700 border border-blue-200'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
              </nav>
            </div>

            <div className='flex items-center space-x-4'>
              {onStartTour && (
                <button
                  onClick={onStartTour}
                  className='flex items-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-md text-sm font-medium border border-green-200 transition-colors duration-200'
                >
                  <HelpCircle className='w-4 h-4' />
                  <span className='hidden sm:inline'>Start Tour</span>
                </button>
              )}

              <div className='flex items-center gap-2'>
                {/* Combined Notifications Bell (Applications + Expiring Documents) */}
                <NotificationBell user={user} userEmail={userEmail} />

                {/* User Menu */}
                <div className='relative user-menu-container'>
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className='flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-md text-sm font-medium border border-gray-200 transition-colors duration-200 relative'
                  >
                    <User className='w-4 h-4' />
                    {userRole && (
                      <span className='px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full'>
                        {userRole}
                      </span>
                    )}
                    <ChevronDown className='w-4 h-4' />
                  </button>

                  {showUserMenu && (
                    <div className='absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border border-gray-200 z-50'>
                      <div className='py-2'>
                        <div className='px-4 py-3 border-b border-gray-100'>
                          <div className='text-sm font-medium text-gray-900'>
                            Signed in as:
                          </div>
                          <div className='text-sm text-gray-600 truncate'>
                            {userEmail}
                          </div>
                          <div className='text-xs text-gray-500 mt-1'>
                            Role: {userRole}
                          </div>
                        </div>
                        <div className='py-1'>
                          <button
                            onClick={() => {
                              router.push('/admin/profile');
                              setShowUserMenu(false);
                            }}
                            className='w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2'
                          >
                            <User className='w-4 h-4' />
                            Profile
                          </button>
                          <button
                            onClick={() => {
                              handleLogout();
                              setShowUserMenu(false);
                            }}
                            className='w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2'
                          >
                            <LogOut className='w-4 h-4' />
                            Logout
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className='md:hidden border-t border-gray-200 bg-gray-50'>
          <nav className='max-w-7xl mx-auto px-4 py-2'>
            <div className='flex space-x-1 overflow-x-auto'>
              {navigationItems
                .filter((item) => canAccessRoute(item.roles))
                .map((item) => (
                  <button
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-200 ${
                      isActive(item.href)
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </nav>
        </div>
      </header>

      <main className='flex-1'>
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
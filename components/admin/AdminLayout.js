import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import useAdminAuthStore from '../../stores/adminAuthStore';
import {
  Building,
  User,
  LogOut,
  ChevronDown,
  HelpCircle,
  Bell,
  AlertCircle,
  X,
} from 'lucide-react';

const AdminLayout = ({ children, onStartTour }) => {
  const [userEmail, setUserEmail] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [clearedNotifications, setClearedNotifications] = useState(new Set());
  const router = useRouter();
  const supabase = createClientComponentClient();
  const { role: userRole, user } = useAdminAuthStore();

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
      // Load cleared notifications from localStorage
      const storageKey = `cleared_notifications_${user.email}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const cleared = JSON.parse(stored);
          setClearedNotifications(new Set(cleared));
        } catch (e) {
          console.error('Error loading cleared notifications:', e);
        }
      }
    }
  }, [user]);

  // Fetch notifications when user email is available
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!userEmail) return;
      
      setLoadingNotifications(true);
      try {
        const response = await fetch(`/api/notifications/expiring-documents?email=${encodeURIComponent(userEmail)}`);
        if (response.ok) {
          const data = await response.json();
          const allNotifications = data.notifications || [];
          
          // Filter out cleared notifications
          const activeNotifications = allNotifications.filter(
            (notification) => !clearedNotifications.has(notification.property_id)
          );
          
          // Calculate total count from active notifications
          const activeCount = activeNotifications.reduce(
            (sum, notification) => sum + notification.documents.length,
            0
          );
          
          setNotifications(activeNotifications);
          setNotificationCount(activeCount);
        }
      } catch (error) {
        console.error('Error fetching notifications:', error);
      } finally {
        setLoadingNotifications(false);
      }
    };

    fetchNotifications();
    // Refresh notifications every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [userEmail, clearedNotifications]);

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

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showNotifications && !event.target.closest('.notifications-container')) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const clearNotification = (propertyId, e) => {
    // Prevent the click from bubbling up to the notification button
    if (e) {
      e.stopPropagation();
    }
    
    // Find the notification before removing it
    const removedNotification = notifications.find(
      (n) => n.property_id === propertyId
    );
    
    // Add to cleared set
    const newCleared = new Set(clearedNotifications);
    newCleared.add(propertyId);
    setClearedNotifications(newCleared);
    
    // Save to localStorage
    if (userEmail) {
      const storageKey = `cleared_notifications_${userEmail}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newCleared)));
    }
    
    // Remove from displayed notifications
    setNotifications((prev) => 
      prev.filter((notification) => notification.property_id !== propertyId)
    );
    
    // Update count
    if (removedNotification) {
      setNotificationCount((prev) => 
        Math.max(0, prev - removedNotification.documents.length)
      );
    }
  };

  const handleNotificationClick = (propertyId, e) => {
    // Clear the notification when clicked
    clearNotification(propertyId, e);
    
    // Navigate to property
    router.push(`/admin/property-files/${propertyId}`);
    setShowNotifications(false);
    setShowUserMenu(false);
  };

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
                {/* Notifications Button */}
                <div className='relative notifications-container'>
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className='relative flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-md text-sm font-medium border border-gray-200 transition-colors duration-200'
                  >
                    <Bell className='w-4 h-4' />
                    {notificationCount > 0 && (
                      <span className='absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold'>
                        {notificationCount > 9 ? '9+' : notificationCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Panel */}
                  {showNotifications && (
                    <div className='absolute right-0 mt-2 w-96 bg-white rounded-md shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col'>
                      <div className='px-4 py-3 border-b border-gray-100 flex items-center justify-between'>
                        <h3 className='text-sm font-semibold text-gray-900'>Notifications</h3>
                        <button
                          onClick={() => setShowNotifications(false)}
                          className='text-gray-400 hover:text-gray-600'
                        >
                          <X className='w-4 h-4' />
                        </button>
                      </div>
                      <div className='overflow-y-auto flex-1'>
                        {loadingNotifications ? (
                          <div className='px-4 py-8 text-center text-sm text-gray-500'>
                            Loading notifications...
                          </div>
                        ) : notifications.length === 0 ? (
                          <div className='px-4 py-8 text-center text-sm text-gray-500'>
                            No notifications
                          </div>
                        ) : (
                          <div className='py-2'>
                            {notifications.map((notification) => (
                              <div
                                key={notification.property_id}
                                className='relative w-full px-4 py-3 hover:bg-gray-50 border-b border-gray-100 transition-colors'
                              >
                                <button
                                  onClick={(e) => handleNotificationClick(notification.property_id, e)}
                                  className='w-full text-left'
                                >
                                  <div className='flex items-start gap-3 pr-6'>
                                    <AlertCircle className='w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0' />
                                    <div className='flex-1 min-w-0'>
                                      <div className='text-sm font-medium text-gray-900 truncate'>
                                        {notification.property_name}
                                      </div>
                                      {notification.property_location && (
                                        <div className='text-xs text-gray-500 truncate'>
                                          {notification.property_location}
                                        </div>
                                      )}
                                      <div className='mt-1 text-xs text-gray-600'>
                                        {notification.documents.length} document{notification.documents.length !== 1 ? 's' : ''} expiring
                                      </div>
                                      <div className='mt-1 flex flex-wrap gap-1'>
                                        {notification.documents.slice(0, 2).map((doc, idx) => (
                                          <span
                                            key={idx}
                                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                              doc.days_until_expiration <= 7
                                                ? 'bg-red-100 text-red-800'
                                                : doc.days_until_expiration <= 14
                                                ? 'bg-orange-100 text-orange-800'
                                                : 'bg-yellow-100 text-yellow-800'
                                            }`}
                                          >
                                            {doc.days_until_expiration} day{doc.days_until_expiration !== 1 ? 's' : ''}
                                          </span>
                                        ))}
                                        {notification.documents.length > 2 && (
                                          <span className='text-xs text-gray-500'>
                                            +{notification.documents.length - 2} more
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </button>
                                <button
                                  onClick={(e) => clearNotification(notification.property_id, e)}
                                  className='absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors p-1'
                                  title='Clear notification'
                                >
                                  <X className='w-4 h-4' />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

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
                              setShowNotifications(true);
                              setShowUserMenu(false);
                            }}
                            className='w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 relative'
                          >
                            <Bell className='w-4 h-4' />
                            Notifications
                            {notificationCount > 0 && (
                              <span className='ml-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold'>
                                {notificationCount > 9 ? '9+' : notificationCount}
                              </span>
                            )}
                          </button>
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
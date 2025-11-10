import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Bell, X, Check, FileText, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/router';

const NotificationBell = ({ user, userEmail }) => {
  const [notifications, setNotifications] = useState([]);
  const [expiringDocs, setExpiringDocs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clearedNotifications, setClearedNotifications] = useState(new Set());
  const supabase = createClientComponentClient();
  const router = useRouter();

  // Load cleared notifications from localStorage
  useEffect(() => {
    if (userEmail) {
      const storageKey = `cleared_notifications_${userEmail}`;
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
  }, [userEmail]);

  // Fetch application notifications
  // IMPORTANT: Fetch ALL notifications (not just unread) to show all stored notifications
  // This ensures notifications created when user was offline are visible when they log in
  const fetchApplicationNotifications = async () => {
    if (!user) return;
    
    try {
      // Fetch more notifications (100) to ensure we get all stored notifications
      // The API will filter by property owner email for admin/staff/accounting
      const response = await fetch('/api/notifications/get?limit=100&unreadOnly=false');
      if (response.ok) {
        const data = await response.json();
        console.log(`Fetched ${data.notifications?.length || 0} notifications, ${data.unreadCount || 0} unread`);
        return {
          notifications: data.notifications || [],
          unreadCount: data.unreadCount || 0,
        };
      } else {
        const errorData = await response.json();
        console.error('Error fetching notifications:', errorData);
      }
    } catch (error) {
      console.error('Error fetching application notifications:', error);
    }
    return { notifications: [], unreadCount: 0 };
  };

  // Fetch expiring documents notifications
  const fetchExpiringDocuments = async () => {
    if (!userEmail) return [];
    
    try {
      const response = await fetch(`/api/notifications/expiring-documents?email=${encodeURIComponent(userEmail)}`);
      if (response.ok) {
        const data = await response.json();
        const allNotifications = data.notifications || [];
        
        // Filter out cleared notifications
        const activeNotifications = allNotifications.filter(
          (notification) => !clearedNotifications.has(notification.property_id)
        );
        
        return activeNotifications;
      }
    } catch (error) {
      console.error('Error fetching expiring documents:', error);
    }
    return [];
  };

  // Fetch all notifications
  const fetchNotifications = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const [appNotifications, expiringDocsList] = await Promise.all([
        fetchApplicationNotifications(),
        fetchExpiringDocuments(),
      ]);

      setNotifications(appNotifications.notifications);
      setExpiringDocs(expiringDocsList);
      
      // Calculate total unread count
      const expiringDocsCount = expiringDocsList.reduce(
        (sum, notification) => sum + notification.documents.length,
        0
      );
      setUnreadCount(appNotifications.unreadCount + expiringDocsCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Clear expiring document notification
  const clearExpiringDoc = (propertyId, e) => {
    if (e) e.stopPropagation();
    
    const newCleared = new Set(clearedNotifications);
    newCleared.add(propertyId);
    setClearedNotifications(newCleared);
    
    if (userEmail) {
      const storageKey = `cleared_notifications_${userEmail}`;
      localStorage.setItem(storageKey, JSON.stringify(Array.from(newCleared)));
    }
    
    setExpiringDocs(prev => prev.filter(n => n.property_id !== propertyId));
    
    // Update count
    const removed = expiringDocs.find(n => n.property_id === propertyId);
    if (removed) {
      setUnreadCount(prev => Math.max(0, prev - removed.documents.length));
    }
  };

  // Initial fetch
  useEffect(() => {
    if (user && userEmail) {
      fetchNotifications();
    }
  }, [user, userEmail, clearedNotifications]);

  // Set up real-time subscription for notifications
  useEffect(() => {
    if (!user || !userEmail) return;

    console.log('Setting up real-time notification subscription for user:', user.email);

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        (payload) => {
          console.log('Notification change detected:', payload.eventType, payload.new || payload.old);
          
          // Only refresh if it's a notification for this user
          const notification = payload.new || payload.old;
          if (notification) {
            // Check multiple conditions for matching:
            // 1. Direct recipient (user ID or email match)
            // 2. For admin/staff: also check if application is assigned to them
            // 3. Check if user email matches property owner email
            const isDirectRecipient = 
              notification.recipient_user_id === user.id ||
              notification.recipient_email?.toLowerCase() === userEmail?.toLowerCase();
            
            // If it's an INSERT and we can't determine if it's for this user,
            // refresh anyway to let the API filter it properly
            const shouldRefresh = payload.eventType === 'INSERT' || isDirectRecipient;
            
            if (shouldRefresh) {
              console.log('Notification change detected, refreshing...', {
                eventType: payload.eventType,
                notificationId: notification.id,
                isDirectRecipient,
                recipientEmail: notification.recipient_email,
                userEmail,
              });
              // Silent refresh - update in background by calling fetchNotifications
              fetchNotifications();
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time notification subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time notification subscription error');
        } else {
          console.log('Notification subscription status:', status);
        }
      });

    return () => {
      console.log('Cleaning up notification subscription');
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userEmail, supabase]); // fetchNotifications is stable, doesn't need to be in deps

  // Mark notification as read - OPTIMISTIC UPDATE
  // Updates UI immediately, syncs with backend in background
  const markAsRead = async (notificationId) => {
    // OPTIMISTIC UPDATE: Update UI immediately
    const notification = notifications.find(n => n.id === notificationId);
    const wasUnread = notification && !notification.is_read;
    
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === notificationId
          ? { ...notif, is_read: true, read_at: new Date().toISOString() }
          : notif
      )
    );
    
    if (wasUnread) {
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    // Sync with backend in background (don't block UI)
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [notificationId] }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('Failed to mark notification as read in backend:', errorData);
        // If backend fails, the notification will reappear on refresh
        // User will notice if it doesn't clear after refresh/re-login
      }
    } catch (error) {
      console.warn('Error syncing notification read status with backend:', error);
      // Error logged, but UI already updated optimistically
      // User will notice if notification doesn't clear after refresh
    }
  };

  // Mark all as read - OPTIMISTIC UPDATE
  // Updates UI immediately, syncs with backend in background
  const markAllAsRead = async () => {
    // OPTIMISTIC UPDATE: Update UI immediately
    const currentUnreadCount = unreadCount;
    
    setNotifications(prev =>
      prev.map(notif => ({ ...notif, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);

    // Sync with backend in background (don't block UI)
    try {
      const response = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationIds: [] }), // Empty array = mark all
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('Failed to mark all notifications as read in backend:', errorData);
        // If backend fails, notifications will reappear on refresh
        // User will notice if they don't clear after refresh/re-login
      } else {
        const data = await response.json();
        console.log(`Successfully marked ${data.markedRead || 0} notifications as read`);
      }
    } catch (error) {
      console.warn('Error syncing "mark all as read" with backend:', error);
      // Error logged, but UI already updated optimistically
      // User will notice if notifications don't clear after refresh
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsRead(notification.id);
    }

    // Navigate to application if available
    if (notification.application_id) {
      router.push(`/admin/applications?applicationId=${notification.application_id}`);
      setShowDropdown(false);
    }
  };

  // Format time ago
  const getTimeAgo = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const unreadNotifications = notifications.filter(n => !n.is_read);

  return (
    <div className="relative notifications-container">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setShowDropdown(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : notifications.length === 0 && expiringDocs.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* Application Notifications */}
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                        !notification.is_read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`flex-shrink-0 mt-1 ${
                          notification.notification_type === 'new_application'
                            ? 'text-blue-600'
                            : 'text-green-600'
                        }`}>
                          {notification.notification_type === 'new_application' ? (
                            <FileText className="w-5 h-5" />
                          ) : (
                            <Check className="w-5 h-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-sm font-medium ${
                              !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                            }`}>
                              {notification.subject}
                            </p>
                            {!notification.is_read && (
                              <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1.5" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {getTimeAgo(notification.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Expiring Documents Notifications */}
                  {expiringDocs.map((docNotification) => (
                    <div
                      key={`expiring-${docNotification.property_id}`}
                      className="p-4 hover:bg-gray-50 transition-colors bg-yellow-50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1 text-yellow-600">
                          <AlertCircle className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900">
                              Documents Expiring - {docNotification.property_name}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="flex-shrink-0 w-2 h-2 bg-yellow-600 rounded-full mt-1.5" />
                              <button
                                onClick={(e) => clearExpiringDoc(docNotification.property_id, e)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">
                            {docNotification.documents.length} document(s) expiring within 30 days
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span className="text-xs text-gray-500">
                              {docNotification.documents[0]?.days_until_expiration || 0} days left
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/admin/property-files/${docNotification.property_id}`);
                                setShowDropdown(false);
                              }}
                              className="ml-auto text-xs text-blue-600 hover:text-blue-800"
                            >
                              View →
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-200 text-center">
                <button
                  onClick={() => {
                    router.push('/admin/applications');
                    setShowDropdown(false);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View all applications
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;


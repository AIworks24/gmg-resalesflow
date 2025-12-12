import React, { useState, useEffect, useRef } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Bell, X, Check, FileText, Clock, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/router';
import useNotificationStore from '../../stores/notificationStore';
import { useServerTime } from '../../hooks/useServerTime';

const NotificationBell = ({ user, userEmail }) => {
  // Get server time for accurate timestamp calculations
  const serverTime = useServerTime();
  
  // Use global store for persistent notification state
  const {
    unreadCount,
    notifications: storeNotifications,
    expiringDocs: storeExpiringDocs,
    isLoading: storeLoading,
    updateUnreadCount,
    setNotifications,
    setExpiringDocs,
    setLoading,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
    clearExpiringDoc: storeClearExpiringDoc,
  } = useNotificationStore();

  // Local state for UI only
  const [showDropdown, setShowDropdown] = useState(false);
  const [clearedNotifications, setClearedNotifications] = useState(new Set());
  const supabase = createClientComponentClient();
  const router = useRouter();
  
  // Keep a ref to track if we've initialized to prevent unnecessary refetches
  const initializedRef = useRef(false);

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
  const fetchApplicationNotifications = async (bypassCache = false) => {
    if (!user) return { notifications: [], unreadCount: 0 };
    
    try {
      // Add timestamp to prevent caching stale data when bypassing cache
      const cacheBuster = bypassCache ? `&_t=${Date.now()}` : '';
      const url = `/api/notifications/get?limit=100&unreadOnly=false${cacheBuster}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': bypassCache ? 'no-cache, no-store, must-revalidate' : 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
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
  const fetchNotifications = async (silent = false, bypassCache = false) => {
    if (!user) return;
    
    // Only show loading if not a silent refresh (real-time updates are silent)
    // IMPORTANT: Don't reset unreadCount during loading - keep existing count visible
    if (!silent) {
      setLoading(true);
    }
    
    try {
      const [appNotifications, expiringDocsList] = await Promise.all([
        fetchApplicationNotifications(bypassCache),
        fetchExpiringDocuments(),
      ]);

      // Update global store (this persists across page navigations)
      // The count will update smoothly without flickering
      setNotifications(appNotifications.notifications);
      setExpiringDocs(expiringDocsList);
      updateUnreadCount(appNotifications.notifications, expiringDocsList);
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      // On error, keep existing count (don't reset to 0)
    } finally {
      if (!silent) {
        setLoading(false);
      }
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
    
    // Update global store
    storeClearExpiringDoc(propertyId);
  };

  // Initial fetch - only if we don't have recent data
  useEffect(() => {
    if (!user || !userEmail) return;
    
    const { lastFetched, unreadCount: storedCount } = useNotificationStore.getState();
    
    // If we have stored count, show it immediately (no flicker!)
    // Only fetch if we don't have data or it's been more than 5 minutes
    const shouldFetch = !lastFetched || 
      (new Date().getTime() - new Date(lastFetched).getTime() > 5 * 60 * 1000);
    
    if (shouldFetch && !initializedRef.current) {
      initializedRef.current = true;
      fetchNotifications();
    } else if (storedCount > 0) {
      // We have stored count, just ensure it's displayed (already in store)
      console.log(`Using stored notification count: ${storedCount}`);
    }
  }, [user, userEmail]);

  // Re-fetch when clearedNotifications change (for expiring docs)
  useEffect(() => {
    if (user && userEmail && initializedRef.current) {
      // Only re-fetch expiring docs, not all notifications
      fetchExpiringDocuments().then(expiringDocsList => {
        setExpiringDocs(expiringDocsList);
        // Recalculate unread count with updated expiring docs
        const currentNotifications = useNotificationStore.getState().notifications;
        updateUnreadCount(currentNotifications, expiringDocsList);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearedNotifications]);

  // Set up real-time subscription for notifications
  useEffect(() => {
    if (!user || !userEmail) return;

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
          const notification = payload.new || payload.old;
          if (!notification) {
            console.warn('⚠️ Notification payload missing new/old data');
            return;
          }
          
          // Check if this notification is for the current user
          // Handle both direct email match and normalized email (with/without owner. prefix)
          const normalizedNotificationEmail = (notification.recipient_email || '').toLowerCase().replace(/^owner\./, '');
          const normalizedUserEmail = (userEmail || '').toLowerCase().replace(/^owner\./, '');
          
          const isDirectRecipient = 
            notification.recipient_user_id === user.id ||
            normalizedNotificationEmail === normalizedUserEmail ||
            notification.recipient_email?.toLowerCase() === userEmail?.toLowerCase();
          
          // Handle different event types
          if (payload.eventType === 'UPDATE' && payload.new) {
            if (!isDirectRecipient) {
              return;
            }
            
            // UPDATE event: Always refresh notifications when updated
            // This ensures we get the latest data from the database
            
            // Optimistic update: Update store immediately if notification is already there
            const currentNotifications = useNotificationStore.getState().notifications;
            const notificationIndex = currentNotifications.findIndex(n => n.id === notification.id);
            
            if (notificationIndex !== -1) {
              // Update immediately for instant UI feedback
              const updatedNotifications = [...currentNotifications];
              updatedNotifications[notificationIndex] = {
                ...updatedNotifications[notificationIndex],
                ...payload.new,
              };
              setNotifications(updatedNotifications);
              
              const expiringDocs = useNotificationStore.getState().expiringDocs;
              updateUnreadCount(updatedNotifications, expiringDocs);
            }
            
            // Always fetch to ensure we have the latest data (bypasses cache)
            // Use a small delay to batch multiple rapid updates
            setTimeout(() => {
              fetchNotifications(true, true); // Silent + bypass cache
            }, 100);
          } else if (payload.eventType === 'INSERT') {
            // INSERT event: Fetch to get full notification data
            if (isDirectRecipient || !notification.recipient_email) {
              fetchNotifications(true, true); // Silent + bypass cache
            }
          } else if (payload.eventType === 'DELETE') {
            // DELETE event: Remove from store
            const currentNotifications = useNotificationStore.getState().notifications;
            const filteredNotifications = currentNotifications.filter(n => n.id !== notification.id);
            setNotifications(filteredNotifications);
            
            const expiringDocs = useNotificationStore.getState().expiringDocs;
            updateUnreadCount(filteredNotifications, expiringDocs);
          } else {
            console.warn('⚠️ Unknown event type:', payload.eventType);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time notification subscription error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userEmail, supabase]); // fetchNotifications is stable, doesn't need to be in deps

  // Mark notification as read - OPTIMISTIC UPDATE
  // Updates UI immediately, syncs with backend in background
  const markAsRead = async (notificationId) => {
    // Update global store immediately (optimistic update)
    storeMarkAsRead(notificationId);

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
        // Refresh to get correct state if backend fails
        fetchNotifications(true);
      }
    } catch (error) {
      console.warn('Error syncing notification read status with backend:', error);
      // Refresh to get correct state if sync fails
      fetchNotifications(true);
    }
  };

  // Mark all as read - Actually clears all notifications
  // Updates UI immediately, syncs with backend in background
  const markAllAsRead = async () => {
    // Update global store immediately (optimistic update)
    storeMarkAllAsRead();

    // Sync with backend in background (don't block UI)
    try {
      const response = await fetch('/api/notifications/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('Failed to delete all notifications in backend:', errorData);
        // Refresh to get correct state if backend fails
        fetchNotifications(true);
      } else {
        const data = await response.json();
      }
    } catch (error) {
      console.warn('Error syncing "delete all notifications" with backend:', error);
      // Refresh to get correct state if sync fails
      fetchNotifications(true);
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

  // Note: No need for periodic updates with 12-hour time format
  // Time format is static once displayed (doesn't change like "time ago")

  // Format time with smart date context:
  // - Today: "5:44 PM"
  // - Yesterday: "Yesterday, 5:44 PM"
  // - 2+ days ago: "Jan 10, 2025, 5:44 PM" (exact date and time)
  // IMPORTANT: Uses SERVER TIME but displays in user's local timezone
  const formatTime = (dateString) => {
    if (!dateString) return '';
    
    try {
      let date;
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Use server time for accurate "now" comparison
      const now = serverTime;
      
      if (dateString instanceof Date) {
        date = dateString;
      } else if (typeof dateString === 'string') {
        // Supabase returns ISO strings from TIMESTAMP WITH TIME ZONE
        // Ensure proper UTC parsing
        let isoString = dateString.trim();
        
        // If missing timezone indicator, assume UTC
        if (isoString.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) && 
            !isoString.endsWith('Z') && 
            !isoString.match(/[+-]\d{2}:\d{2}$/)) {
          isoString = isoString + 'Z';
        }
        
        date = new Date(isoString);
        
        if (isNaN(date.getTime())) {
          date = new Date(dateString);
          if (isNaN(date.getTime())) {
            console.warn('Invalid date string:', dateString);
            return '';
          }
        }
      } else {
        console.warn('Invalid date value type:', typeof dateString);
        return '';
      }
      
      if (isNaN(date.getTime())) {
        console.warn('Invalid date after parsing:', dateString);
        return '';
      }
      
      // Format time in 12-hour format
      const timeString = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: userTimezone
      });
      
      // Calculate days difference (in user's local timezone)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const notificationDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const daysDiff = Math.floor((today - notificationDate) / (1000 * 60 * 60 * 24));
      
      // Format based on how old the notification is
      if (daysDiff === 0) {
        // Today: Just show time
        return timeString;
      } else if (daysDiff === 1) {
        // Yesterday: Show "Yesterday, 5:44 PM"
        return `Yesterday, ${timeString}`;
      } else {
        // 2+ days ago: Show exact date and time
        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
        return `${formattedDate}, ${timeString}`;
      }
    } catch (error) {
      console.error('Error formatting time:', error, dateString);
      return '';
    }
  };

  // Use notifications from store (persists across navigations)
  const notifications = storeNotifications;
  const expiringDocs = storeExpiringDocs;
  const loading = storeLoading;
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
                    Clear all
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
                      key={`notification-${notification.id}`}
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
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="w-3 h-3 text-gray-400" />
                            <span 
                              className="text-xs text-gray-500" 
                              title={notification.sent_at || notification.created_at || 'No timestamp'}
                            >
                              {formatTime(notification.sent_at || notification.created_at)}
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
                                // Get the document_key from the first expiring document
                                const documentKey = docNotification.documents[0]?.document_key;
                                const url = documentKey 
                                  ? `/admin/property-files/${docNotification.property_id}?docKey=${encodeURIComponent(documentKey)}`
                                  : `/admin/property-files/${docNotification.property_id}`;
                                router.push(url);
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


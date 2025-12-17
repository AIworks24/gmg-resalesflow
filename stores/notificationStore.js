import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Global notification store
 * Persists notification state across page navigations
 * This prevents the notification badge from disappearing when switching pages
 */
const useNotificationStore = create(
  persist(
    (set, get) => ({
      // State
      unreadCount: 0,
      notifications: [],
      expiringDocs: [],
      lastFetched: null,
      isLoading: false,

      // Actions
      setUnreadCount: (count) => {
        set({ unreadCount: Math.max(0, count) });
      },

      setNotifications: (notifications) => {
        set({ notifications });
      },

      setExpiringDocs: (expiringDocs) => {
        set({ expiringDocs });
      },

      setLoading: (isLoading) => {
        set({ isLoading });
      },

      updateUnreadCount: (notifications, expiringDocs) => {
        // Calculate unread count from notifications
        const unreadNotifications = notifications.filter(n => !n.is_read);
        const unreadCount = unreadNotifications.length;
        
        // Add expiring docs count
        const expiringDocsCount = expiringDocs.reduce(
          (sum, notification) => sum + notification.documents.length,
          0
        );
        
        const totalUnread = unreadCount + expiringDocsCount;
        set({ 
          unreadCount: totalUnread,
          notifications,
          expiringDocs,
          lastFetched: new Date().toISOString()
        });
      },

      markAsRead: (notificationId) => {
        const { notifications, unreadCount } = get();
        const notification = notifications.find(n => n.id === notificationId);
        const wasUnread = notification && !notification.is_read;
        
        const updatedNotifications = notifications.map(notif =>
          notif.id === notificationId
            ? { ...notif, is_read: true, read_at: new Date().toISOString() }
            : notif
        );
        
        set({
          notifications: updatedNotifications,
          unreadCount: wasUnread ? Math.max(0, unreadCount - 1) : unreadCount
        });
      },

      markAllAsRead: () => {
        // Clear all notifications and expiring docs (delete them)
        set({
          notifications: [],
          expiringDocs: [],
          unreadCount: 0
        });
      },

      clearExpiringDoc: (propertyId) => {
        const { expiringDocs, unreadCount } = get();
        const removed = expiringDocs.find(n => n.property_id === propertyId);
        const removedCount = removed ? removed.documents.length : 0;
        
        set({
          expiringDocs: expiringDocs.filter(n => n.property_id !== propertyId),
          unreadCount: Math.max(0, unreadCount - removedCount)
        });
      },

      // Reset store (for logout)
      reset: () => {
        set({
          unreadCount: 0,
          notifications: [],
          expiringDocs: [],
          lastFetched: null,
          isLoading: false
        });
      },
    }),
    {
      name: 'notification-store', // localStorage key
      version: 1, // Increment this to invalidate old cache
      storage: createJSONStorage(() => localStorage),
      // Only persist unreadCount and lastFetched (not full notifications to save space)
      partialize: (state) => ({
        unreadCount: state.unreadCount,
        lastFetched: state.lastFetched,
      }),
      migrate: (persistedState, version) => {
        // If stored version is older than current, reset the cache
        if (version < 1) {
          console.log('[NotificationStore] Cache version outdated, resetting');
          return {
            unreadCount: 0,
            lastFetched: null,
          };
        }
        return persistedState;
      },
    }
  )
);

export default useNotificationStore;


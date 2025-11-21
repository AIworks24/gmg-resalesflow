import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Wifi, WifiOff } from 'lucide-react';
import { getConnectionMonitor } from '../lib/connectionStatus';
import { hasValidCachedSession } from '../lib/sessionCache';

/**
 * Connection Status Indicator Component
 * 
 * Shows users when Supabase is disconnected and they're using cached data.
 * Only displays on admin pages.
 */
export default function ConnectionStatusIndicator() {
  const router = useRouter();
  const [isConnected, setIsConnected] = useState(true);
  const [isUsingCachedSession, setIsUsingCachedSession] = useState(false);

  // Only show on admin routes
  const isAdminRoute = router.pathname?.startsWith('/admin');

  useEffect(() => {
    const connectionMonitor = getConnectionMonitor();
    
    // Subscribe to connection status
    const unsubscribe = connectionMonitor.subscribe((connected) => {
      setIsConnected(connected);
      
      // Check if we have a cached session when disconnected
      if (!connected) {
        setIsUsingCachedSession(hasValidCachedSession());
      } else {
        setIsUsingCachedSession(false);
      }
    });

    // Initial check
    setIsConnected(connectionMonitor.getStatus().isConnected);
    if (!connectionMonitor.getStatus().isConnected) {
      setIsUsingCachedSession(hasValidCachedSession());
    }

    return unsubscribe;
  }, []);

  // Don't show on non-admin routes
  if (!isAdminRoute) {
    return null;
  }

  // Don't show anything when everything is working
  if (isConnected && !isUsingCachedSession) {
    return null;
  }

  // Adjust top position if in development mode (to account for dev banner)
  const topOffset = process.env.NODE_ENV === 'development' ? '48px' : '0';

  return (
    <div
      style={{
        position: 'fixed',
        top: topOffset,
        left: 0,
        right: 0,
        zIndex: 9998,
        backgroundColor: isConnected ? '#fef3c7' : '#fee2e2',
        borderBottom: `2px solid ${isConnected ? '#f59e0b' : '#ef4444'}`,
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontSize: '14px',
        fontWeight: 500,
        color: isConnected ? '#92400e' : '#991b1b',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      {isConnected ? (
        <>
          <Wifi size={18} />
          <span>Reconnecting to server...</span>
        </>
      ) : (
        <>
          <WifiOff size={18} />
          <span>
            {isUsingCachedSession
              ? 'Offline mode: Using cached data. Some features may be limited.'
              : 'Connection lost. Please check your internet connection.'}
          </span>
        </>
      )}
    </div>
  );
}


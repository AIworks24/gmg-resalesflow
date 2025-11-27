/**
 * Connection Status Monitor for Supabase
 * 
 * Monitors Supabase connectivity and provides fallback mechanisms
 * when the service is disconnected or unavailable.
 */

const CONNECTION_CHECK_INTERVAL = 30000; // Check every 30 seconds
const CONNECTION_TIMEOUT = 5000; // 5 second timeout for health checks
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 5000]; // Exponential backoff delays in ms

class ConnectionStatusMonitor {
  constructor() {
    this.isConnected = true;
    this.isChecking = false;
    this.listeners = new Set();
    this.checkInterval = null;
    this.lastCheckTime = null;
    this.consecutiveFailures = 0;
  }

  /**
   * Check if Supabase is reachable
   */
  async checkConnection(supabaseClient) {
    if (this.isChecking) {
      return this.isConnected;
    }

    this.isChecking = true;
    this.lastCheckTime = Date.now();

    try {
      // Simple health check - try to get the current session
      // This is lightweight and doesn't require authentication
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT);

      const result = await Promise.race([
        supabaseClient.auth.getSession(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), CONNECTION_TIMEOUT)
        )
      ]);

      clearTimeout(timeoutId);

      // If we get here, Supabase is reachable (even if no session)
      this.consecutiveFailures = 0;
      if (!this.isConnected) {
        this.isConnected = true;
        this.notifyListeners(true);
      }
      return true;
    } catch (error) {
      console.warn('[ConnectionStatus] Supabase connection check failed:', error.message);
      this.consecutiveFailures++;
      
      if (this.isConnected) {
        this.isConnected = false;
        this.notifyListeners(false);
      }
      return false;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Start monitoring connection status
   */
  startMonitoring(supabaseClient) {
    if (this.checkInterval) {
      return; // Already monitoring
    }

    // Initial check
    this.checkConnection(supabaseClient);

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkConnection(supabaseClient);
    }, CONNECTION_CHECK_INTERVAL);
  }

  /**
   * Stop monitoring connection status
   */
  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Subscribe to connection status changes
   */
  subscribe(callback) {
    this.listeners.add(callback);
    // Immediately notify with current status
    callback(this.isConnected);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Notify all listeners of status change
   */
  notifyListeners(isConnected) {
    this.listeners.forEach(callback => {
      try {
        callback(isConnected);
      } catch (error) {
        console.error('[ConnectionStatus] Error in listener:', error);
      }
    });
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      lastCheckTime: this.lastCheckTime,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}

// Singleton instance
let monitorInstance = null;

export const getConnectionMonitor = () => {
  if (!monitorInstance) {
    monitorInstance = new ConnectionStatusMonitor();
  }
  return monitorInstance;
};

/**
 * Retry a Supabase operation with exponential backoff
 */
export async function retrySupabaseOperation(operation, options = {}) {
  const maxRetries = options.maxRetries || MAX_RETRIES;
  const delays = options.delays || RETRY_DELAYS;
  const onRetry = options.onRetry || (() => {});

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        operation(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Operation timeout')), options.timeout || 10000)
        )
      ]);
      
      return { success: true, data: result };
    } catch (error) {
      lastError = error;
      
      // Don't retry on authentication errors (4xx)
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        return { success: false, error, shouldRetry: false };
      }

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Wait before retrying
      const delay = delays[Math.min(attempt, delays.length - 1)];
      onRetry(attempt + 1, delay, error);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: lastError, shouldRetry: false };
}

/**
 * Check if an error is a connection/network error
 */
export function isConnectionError(error) {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || '';
  const errorCode = error.code?.toLowerCase() || '';
  
  return (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('networkerror') ||
    errorCode === 'network_error' ||
    errorCode === 'timeout' ||
    error.status === 0 || // Network error
    error.status === 408 || // Request timeout
    error.status === 503 || // Service unavailable
    error.status === 504 // Gateway timeout
  );
}








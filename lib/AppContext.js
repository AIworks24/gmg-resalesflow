import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from './supabase';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [hoaProperties, setHoaProperties] = useState([]);
  const [stripePrices, setStripePrices] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load HOA properties - only once per session
  const loadHOAProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('id, name, location')
        .order('name');

      if (error) {
        console.error('❌ HOA Properties error:', error);
        setHoaProperties([]);
        return;
      }

      setHoaProperties(data || []);
    } catch (error) {
      console.error('❌ HOA Properties load failed:', error);
      setHoaProperties([]);
    }
  };

  // Load Stripe prices - only once per session
  const loadStripePrices = async () => {
    try {
      const response = await fetch('/api/get-stripe-prices');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const prices = await response.json();
      setStripePrices(prices);
    } catch (error) {
      console.error('Error loading Stripe prices:', error);
      // Set fallback prices
      setStripePrices({
        standard: {
          baseAmount: 31795,
          displayAmount: 317.95
        },
        rush: {
          baseAmount: 31795,
          rushFeeAmount: 7066,
          displayAmount: 317.95,
          rushFeeDisplay: 70.66
        },
        convenienceFee: {
          amount: 995,
          display: 9.95
        }
      });
    }
  };

  // Initialize static data once when the provider mounts
  useEffect(() => {
    const initializeStaticData = async () => {
      if (isDataLoaded) return; // Don't reload if already loaded

      setIsLoading(true);
      
      // Set a timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.warn('⏰ Context loading timeout - marking as loaded');
        setIsDataLoaded(true);
        setIsLoading(false);
      }, 15000); // 15 second timeout
      
      try {
        // Load both in parallel
        await Promise.allSettled([
          loadHOAProperties(),
          loadStripePrices()
        ]);
        
        clearTimeout(timeout);
        setIsDataLoaded(true);
      } catch (error) {
        console.error('❌ Static data initialization failed:', error);
        clearTimeout(timeout);
        // Even if loading fails, mark as loaded to prevent infinite loading
        setIsDataLoaded(true);
      } finally {
        setIsLoading(false);
      }
    };

    initializeStaticData();
  }, []); // Empty dependency array - only run once

  // Function to refresh data if needed (optional)
  const refreshStaticData = async () => {
    setIsLoading(true);
    await Promise.allSettled([
      loadHOAProperties(),
      loadStripePrices()
    ]);
    setIsLoading(false);
  };

  const value = {
    hoaProperties,
    stripePrices,
    isDataLoaded,
    isLoading,
    refreshStaticData
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}; 
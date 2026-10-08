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

const PROPERTY_FIELDS = 'id, name, location, status, is_multi_community, allow_public_offering, pos_notice, allow_info_packet, info_packet_price, info_packet_allowed_domains, force_price_enabled, force_price_value, multi_community_comment';

export const AppProvider = ({ children }) => {
  const [hoaProperties, setHoaProperties] = useState([]);
  // Requester-facing list: published properties only (and MC primaries with no draft linked property)
  const [orderableHoaProperties, setOrderableHoaProperties] = useState([]);
  const [stripePrices, setStripePrices] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load HOA properties - once per session, then again on realtime property changes
  const loadHOAProperties = async () => {
    try {
      const [allResult, orderableResult] = await Promise.all([
        supabase
          .from('hoa_properties')
          .select(PROPERTY_FIELDS)
          .is('deleted_at', null) // Only get non-deleted properties
          .order('name'),
        supabase
          .rpc('get_orderable_hoa_properties')
          .select(PROPERTY_FIELDS),
      ]);

      if (allResult.error) {
        console.error('❌ HOA Properties error:', allResult.error);
        setHoaProperties([]);
      } else {
        setHoaProperties(allResult.data || []);
      }

      if (orderableResult.error) {
        console.error('❌ Orderable HOA Properties error:', orderableResult.error);
        setOrderableHoaProperties([]);
      } else {
        setOrderableHoaProperties(orderableResult.data || []);
      }
    } catch (error) {
      console.error('❌ HOA Properties load failed:', error);
      setHoaProperties([]);
      setOrderableHoaProperties([]);
    }
  };

  // Realtime: an admin publishing / moving a property to draft (or re-linking an MC group)
  // is reflected in open requester sessions without a refresh.
  useEffect(() => {
    let timer;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { loadHOAProperties(); }, 500);
    };
    const channel = supabase
      .channel('hoa-properties-availability')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hoa_properties' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'linked_properties' }, reload)
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, []);

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
    orderableHoaProperties,
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
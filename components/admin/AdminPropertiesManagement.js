import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { deleteCachePattern } from '../../lib/redis';
import {
  Building,
  Plus,
  Edit,
  Trash2,
  Search,
  Users,
  LogOut,
  X,
  Save,
  MapPin,
  Mail,
  Phone,
  User,
  ChevronDown,
  FileText,
  Upload,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Link,
  Unlink,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { 
  getLinkedProperties, 
  hasLinkedProperties, 
  linkProperties, 
  unlinkProperties 
} from '../../lib/multiCommunityUtils';
import AdminLayout from './AdminLayout';
import useAdminAuthStore from '../../stores/adminAuthStore';

// Helper function to normalize location value for dropdown
const normalizeLocation = (location) => {
  if (!location) return '';
  const locationUpper = location.toUpperCase();
  if (locationUpper.includes('VA') || locationUpper.includes('VIRGINIA')) {
    return 'Virginia';
  }
  if (locationUpper.includes('NC') || locationUpper.includes('NORTH CAROLINA')) {
    return 'North Carolina';
  }
  // If it's already one of our valid values, return it
  if (location === 'Virginia' || location === 'North Carolina') {
    return location;
  }
  return '';
};

const AdminPropertiesManagement = () => {
  const { role: userRole } = useAdminAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add'); // 'add' or 'edit'
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState(null);
  const [relatedApplicationsCount, setRelatedApplicationsCount] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Multi-community state
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [selectedLinkedProperties, setSelectedLinkedProperties] = useState([]);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingProperty, setLinkingProperty] = useState(null);

  // Snackbar state
  const [snackbar, setSnackbar] = useState({ show: false, message: '', type: 'success' });

  // Snackbar helper function
  const showSnackbar = (message, type = 'success') => {
    setSnackbar({ show: true, message, type });
    setTimeout(() => {
      setSnackbar({ show: false, message: '', type: 'success' });
    }, 4000); // Auto-close after 4 seconds
  };

  const [formData, setFormData] = useState({
    name: '',
    location: '',
    property_owner_name: '',
    property_owner_email: '',
    property_owner_phone: '',
    management_contact: '',
    phone: '',
    email: '',
    special_requirements: '',
    is_multi_community: false,
    allow_public_offering: false,
    force_price_enabled: false,
    force_price_value: null
  });

  const supabase = createClientComponentClient();
  const router = useRouter();

  // SWR fetcher function
  const fetcher = async (url) => {
    const res = await fetch(url);
    if (!res.ok) {
      const error = new Error('Failed to fetch properties');
      error.info = await res.json();
      error.status = res.status;
      throw error;
    }
    return res.json();
  };

  // Debounce search term to prevent too many API calls and input focus issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset to page 1 when debounced search term changes
  useEffect(() => {
    if (debouncedSearchTerm !== '') {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm]);

  // Build API URL with query parameters
  // Always bypass cache to ensure fresh data for properties
  const apiUrl = `/api/admin/hoa-properties?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(debouncedSearchTerm)}&bypassCache=true`;

  // Fetch properties using SWR
  const { data: swrData, error: swrError, isLoading, mutate } = useSWR(
    apiUrl,
    fetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );

  // Extract data from SWR response
  const properties = swrData?.properties || [];
  const totalCount = swrData?.totalCount || 0;

  // Handle auto-opening edit modal from query parameter
  useEffect(() => {
    if (router.query.edit && properties.length > 0) {
      const propertyId = parseInt(router.query.edit);
      const property = properties.find(p => p.id === propertyId);
      if (property) {
        openEditModal(property);
        // Clean up the query parameter
        router.replace('/admin/properties', undefined, { shallow: true });
      }
    }
  }, [router.query.edit, properties]);


  const openAddModal = () => {
    setModalMode('add');
    setSelectedProperty(null);
    setFormData({
      name: '',
      location: '',
      property_owner_name: '',
      property_owner_email: '',
      property_owner_phone: '',
      management_contact: '',
      phone: '',
      email: '',
      special_requirements: '',
      is_multi_community: false,
      allow_public_offering: false,
      force_price_enabled: false,
      force_price_value: null
    });
    setLinkedProperties([]);
    setShowModal(true);
  };

  const openEditModal = async (property) => {
    setModalMode('edit');
    setSelectedProperty(property);
    
    // Load linked properties first to determine actual multi-community status
    let linked = [];
    try {
      linked = await getLinkedProperties(property.id, supabase);
    } catch (error) {
      console.error('Error loading linked properties:', error);
    }
    
    // Multi-community status is automatically managed by linked properties
    const actuallyMultiCommunity = linked.length > 0;
    
    setFormData({
      name: property.name || '',
      location: normalizeLocation(property.location),
      property_owner_name: property.property_owner_name || '',
      property_owner_email: property.property_owner_email || '',
      property_owner_phone: property.property_owner_phone || '',
      management_contact: property.management_contact || '',
      phone: property.phone || '',
      email: property.email || '',
      special_requirements: property.special_requirements || '',
      is_multi_community: actuallyMultiCommunity,
      allow_public_offering: property.allow_public_offering || false,
      force_price_enabled: property.force_price_enabled || false,
      force_price_value: property.force_price_value || null
    });
    setLinkedProperties(linked);
    
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      let propertyId;
      
      if (modalMode === 'add') {
        // Create new property
        const { data, error } = await supabase
          .from('hoa_properties')
          .insert([{
            name: formData.name,
            location: formData.location,
            property_owner_name: formData.property_owner_name,
            property_owner_email: formData.property_owner_email,
            property_owner_phone: formData.property_owner_phone,
            management_contact: formData.management_contact,
            phone: formData.phone,
            email: formData.email,
            special_requirements: formData.special_requirements,
            // is_multi_community is automatically managed by linked properties
            // When properties are linked/unlinked, it's automatically updated in the database
            // For new properties, default to false (will be set to true when properties are linked)
            is_multi_community: linkedProperties.length > 0,
            allow_public_offering: formData.allow_public_offering || false,
            force_price_enabled: formData.force_price_enabled || false,
            force_price_value: formData.force_price_enabled ? (formData.force_price_value || null) : null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }])
          .select();

        if (error) throw error;
        propertyId = data[0].id;

      } else {
        // Update existing property
        const { error } = await supabase
          .from('hoa_properties')
          .update({
            name: formData.name,
            location: formData.location,
            property_owner_name: formData.property_owner_name,
            property_owner_email: formData.property_owner_email,
            property_owner_phone: formData.property_owner_phone,
            management_contact: formData.management_contact,
            phone: formData.phone,
            email: formData.email,
            special_requirements: formData.special_requirements,
            // is_multi_community is automatically managed by linked properties
            // When properties are linked/unlinked, it's automatically updated in the database
            // For new properties, default to false (will be set to true when properties are linked)
            is_multi_community: linkedProperties.length > 0,
            allow_public_offering: formData.allow_public_offering || false,
            force_price_enabled: formData.force_price_enabled || false,
            force_price_value: formData.force_price_enabled ? (formData.force_price_value || null) : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedProperty.id);

        if (error) throw error;
        propertyId = selectedProperty.id;
      }

      // Fetch the updated/new property directly from database to bypass cache
      // This ensures we have the latest data including all fields
      const { data: updatedProperty, error: fetchError } = await supabase
        .from('hoa_properties')
        .select('*')
        .eq('id', propertyId)
        .single();

      if (fetchError) {
        console.warn('Could not fetch updated property:', fetchError);
      }

      // Close modal first
      setShowModal(false);
      
      // For new properties, navigate to page 1 and clear search to ensure visibility
      if (modalMode === 'add') {
        setCurrentPage(1);
        setSearchTerm('');
        setDebouncedSearchTerm('');
      }
      
      // Invalidate Redis cache pattern for all property caches for this user
      // This ensures no stale cache data is returned
      try {
        await deleteCachePattern(`admin:hoa_properties:*`);
      } catch (cacheError) {
        console.warn('Could not invalidate cache pattern:', cacheError);
        // Continue even if cache invalidation fails
      }
      
      // For new properties, optimistically add to list for immediate feedback
      if (modalMode === 'add' && updatedProperty && swrData?.properties) {
        // Add the new property to the beginning of the list
        const newProperties = [updatedProperty, ...swrData.properties];
        // Update total count
        const newTotalCount = (swrData.totalCount || 0) + 1;
        // Optimistically update the cache to show the new property immediately
        mutate({ 
          ...swrData, 
          properties: newProperties,
          totalCount: newTotalCount
        }, false);
      } else if (modalMode === 'edit' && updatedProperty && swrData?.properties) {
        // For edits, replace the existing property in the list
        const updatedProperties = swrData.properties.map(p => 
          p.id === propertyId ? updatedProperty : p
        );
        // Update cache optimistically
        mutate({ ...swrData, properties: updatedProperties }, false);
      }
      
      // Force SWR to revalidate by fetching with bypassCache parameter
      // Use page 1 and empty search for new properties to ensure they're visible
      const refreshPage = modalMode === 'add' ? 1 : currentPage;
      const refreshSearch = modalMode === 'add' ? '' : debouncedSearchTerm;
      const refreshUrl = `/api/admin/hoa-properties?page=${refreshPage}&pageSize=${pageSize}&search=${encodeURIComponent(refreshSearch)}&bypassCache=true&_t=${Date.now()}`;
      
      try {
        const freshResponse = await fetch(refreshUrl);
        if (!freshResponse.ok) throw new Error('Failed to refresh');
        const freshData = await freshResponse.json();
        
        // Update SWR cache with fresh data (this will replace the optimistic update with correct sorted data)
        mutate(freshData, false);
      } catch (refreshError) {
        console.warn('Could not refresh properties cache:', refreshError);
        // Fallback: force revalidation which will trigger a fresh fetch
        mutate();
      }
      
      // Show success message
      showSnackbar('Property saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving property:', error);
      console.error('Full error details:', JSON.stringify(error, null, 2));
      
      // Show detailed error message
      const errorMessage = error.message || 'Unknown error occurred';
      const errorDetails = error.details || error.hint || '';
      showSnackbar(`Error saving property: ${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`, 'error');
    }
  };

  const handleDelete = async () => {
    if (!propertyToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      // Get all applications that reference this property
      const { data: directApplications, error: appsError } = await supabase
        .from('applications')
        .select('id')
        .eq('hoa_property_id', propertyToDelete.id);

      if (appsError) {
        console.error('Error fetching direct applications:', appsError);
      }

      // Get all property groups that reference this property (for multi-community apps)
      const { data: propertyGroups, error: groupsError } = await supabase
        .from('application_property_groups')
        .select('application_id, id')
        .eq('property_id', propertyToDelete.id);

      if (groupsError) {
        console.error('Error fetching property groups:', groupsError);
      }

      // Collect all unique application IDs that need to be deleted
      const applicationIdsToDelete = new Set();
      
      // Add direct applications
      if (directApplications) {
        directApplications.forEach(app => applicationIdsToDelete.add(app.id));
      }

      // Add applications from property groups
      if (propertyGroups) {
        propertyGroups.forEach(group => {
          if (group.application_id) {
            applicationIdsToDelete.add(group.application_id);
          }
        });
      }

      // Delete all related applications and their data
      if (applicationIdsToDelete.size > 0) {
        const appIdsArray = Array.from(applicationIdsToDelete);
        
        // For each application, delete related data first
        for (const appId of appIdsArray) {
          // Delete notifications for this application first using API endpoint with service role
          try {
            const notificationsResponse = await fetch('/api/admin/delete-application-notifications', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ applicationId: appId }),
            });

            if (!notificationsResponse.ok) {
              const errorData = await notificationsResponse.json();
              console.error(`Error deleting notifications for application ${appId}:`, errorData);
              throw new Error(`Failed to delete notifications for application ${appId}: ${errorData.error || 'Unknown error'}`);
            }
          } catch (notificationsError) {
            console.error(`Error deleting notifications for application ${appId}:`, notificationsError);
            throw notificationsError; // Don't continue if notifications deletion fails
          }

          // Soft delete property owner forms for this application
          // Note: We'll keep forms as hard delete since they're child records
          const { error: formsError } = await supabase
            .from('property_owner_forms')
            .delete()
            .eq('application_id', appId);

          if (formsError) {
            console.error(`Error deleting forms for application ${appId}:`, formsError);
            // Continue with deletion even if forms deletion fails
          }

          // Soft delete application property groups for this application
          // Note: We'll keep groups as hard delete since they're child records
          const { error: groupsDeleteError } = await supabase
            .from('application_property_groups')
            .delete()
            .eq('application_id', appId);

          if (groupsDeleteError) {
            console.error(`Error deleting property groups for application ${appId}:`, groupsDeleteError);
            // Continue with deletion even if groups deletion fails
          }

          // Soft delete the application itself (set deleted_at timestamp instead of hard deleting)
          const { error: appDeleteError } = await supabase
            .from('applications')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', appId);

          if (appDeleteError) {
            console.error(`Error deleting application ${appId}:`, appDeleteError);
            throw new Error(`Failed to delete application ${appId}: ${appDeleteError.message}`);
          }
        }
      }

      // Also soft delete any remaining property groups that reference this property
      // (in case some weren't caught above)
      // Note: We'll keep groups as hard delete since they're child records
      if (propertyGroups && propertyGroups.length > 0) {
        const { error: remainingGroupsError } = await supabase
          .from('application_property_groups')
          .delete()
          .eq('property_id', propertyToDelete.id);

        if (remainingGroupsError) {
          console.error('Error deleting remaining property groups:', remainingGroupsError);
          // Continue with property deletion
        }
      }

      // Soft delete the property (set deleted_at timestamp instead of hard deleting)
      const { error } = await supabase
        .from('hoa_properties')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', propertyToDelete.id);

      if (error) throw error;

      setShowDeleteConfirm(false);
      setPropertyToDelete(null);
      setRelatedApplicationsCount(0);
      setIsDeleting(false);
      mutate();
      
      const deletedCount = applicationIdsToDelete.size;
      if (deletedCount > 0) {
        showSnackbar(
          `Property and ${deletedCount} related application(s) deleted successfully!`,
          'success'
        );
      } else {
        showSnackbar('Property deleted successfully!', 'success');
      }
    } catch (error) {
      console.error('Error deleting property:', error);
      showSnackbar('Error deleting property: ' + (error.message || 'Unknown error occurred'), 'error');
      setIsDeleting(false);
      // Don't close modal on error so user can try again or cancel
    }
  };

  const handleSearch = (value) => {
    setSearchTerm(value);
    // Page reset is handled by useEffect when debouncedSearchTerm changes
  };

  // Multi-community functions
  const loadAvailableProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('id, name, location')
        .is('deleted_at', null) // Only get non-deleted properties
        .order('name');

      if (error) throw error;
      setAvailableProperties(data || []);
    } catch (error) {
      console.error('Error loading available properties:', error);
    }
  };

  const openLinkModal = async (property) => {
    setLinkingProperty(property);
    setSelectedLinkedProperties([]);
    loadAvailableProperties();
    
    // Load existing linked properties for this property
    try {
      const linked = await getLinkedProperties(property.id, supabase);
      setLinkedProperties(linked);
    } catch (error) {
      console.error('Error loading linked properties:', error);
      setLinkedProperties([]);
    }
    
    setShowLinkModal(true);
  };

  const handleLinkProperties = async () => {
    if (!linkingProperty || selectedLinkedProperties.length === 0) return;

    try {
      // Store reference to property ID before closing modal
      const propertyIdToUpdate = linkingProperty.id;
      
      // Optimistically update the cache IMMEDIATELY to show the change right away
      if (swrData?.properties) {
        const updatedProperties = swrData.properties.map(p => 
          p.id === propertyIdToUpdate 
            ? { ...p, is_multi_community: true }
            : p
        );
        // Update cache optimistically - this shows the change instantly
        mutate({ ...swrData, properties: updatedProperties }, false);
      }
      
      // Close modal first for better UX
      setShowLinkModal(false);
      setLinkingProperty(null);
      setSelectedLinkedProperties([]);
      
      // Now perform the actual database operation
      await linkProperties(propertyIdToUpdate, selectedLinkedProperties, supabase);
      
      // Verify the database update was successful by directly querying the property
      const { data: verifiedProperty, error: verifyError } = await supabase
        .from('hoa_properties')
        .select('id, is_multi_community')
        .eq('id', propertyIdToUpdate)
        .single();
      
      if (verifyError) {
        console.error('Error verifying property update:', verifyError);
      } else if (verifiedProperty) {
        console.log(`✅ Database verification: Property ${propertyIdToUpdate} has is_multi_community=${verifiedProperty.is_multi_community}`);
        if (!verifiedProperty.is_multi_community) {
          console.error('❌ CRITICAL: Database update failed! Property does not have is_multi_community=true');
          // Try to fix it
          const { error: fixError } = await supabase
            .from('hoa_properties')
            .update({ is_multi_community: true })
            .eq('id', propertyIdToUpdate);
          if (fixError) {
            console.error('Failed to fix is_multi_community:', fixError);
          } else {
            console.log('✅ Fixed is_multi_community in database');
          }
        }
      }
      
      // Small delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Force SWR to revalidate by fetching with bypassCache parameter
      // This ensures we have the latest data from the database
      const refreshUrl = `/api/admin/hoa-properties?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(debouncedSearchTerm)}&bypassCache=true&_t=${Date.now()}`;
      try {
        const freshResponse = await fetch(refreshUrl);
        if (!freshResponse.ok) throw new Error('Failed to refresh');
        const freshData = await freshResponse.json();
        
        // CRITICAL: Verify the updated property is in the response and has is_multi_community: true
        // If server returned stale cached data, we must fix it to preserve the optimistic update
        const updatedPropertyInResponse = freshData?.properties?.find(p => p.id === propertyIdToUpdate);
        if (updatedPropertyInResponse) {
          // Property found in response - ALWAYS ensure it has is_multi_community: true
          // This prevents the server's stale cache from overwriting our optimistic update
          if (!updatedPropertyInResponse.is_multi_community) {
            console.warn('⚠️ Server returned stale data: Property does not have is_multi_community=true, fixing...');
            updatedPropertyInResponse.is_multi_community = true;
          } else {
            console.log('✅ Server response has correct is_multi_community status');
          }
        } else {
          console.log('ℹ️ Property not in current page response (pagination)');
        }
        // If property not in response, it's not on current page - that's fine, optimistic update will remain
        
        // Update SWR cache with fresh data (with corrected property status if needed)
        mutate(freshData, false);
      } catch (refreshError) {
        console.warn('Could not refresh properties cache:', refreshError);
        // On error, keep the optimistic update - don't revert
        // The property should still show as multi-community
      }
      
      // Reload linked properties to update state (for future modal opens)
      try {
        const linked = await getLinkedProperties(propertyIdToUpdate, supabase);
        setLinkedProperties(linked);
        
        // Safety check: Ensure is_multi_community matches actual linked properties
        // This fixes any discrepancies if the update didn't work
        if (linked.length > 0) {
          // Verify the property actually has is_multi_community=true
          const { data: propertyCheck } = await supabase
            .from('hoa_properties')
            .select('is_multi_community')
            .eq('id', propertyIdToUpdate)
            .single();
          
          if (propertyCheck && !propertyCheck.is_multi_community) {
            console.warn('⚠️ Property has links but is_multi_community=false, fixing...');
            // Use API endpoint to fix it
            try {
              await fetch('/api/admin/update-property-multi-community', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  propertyId: propertyIdToUpdate,
                  isMultiCommunity: true
                })
              });
            } catch (fixError) {
              console.warn('Could not fix is_multi_community:', fixError);
            }
          }
        }
      } catch (error) {
        console.error('Error reloading linked properties:', error);
      }
      
      // If we're in edit mode, update form state
      if (selectedProperty && selectedProperty.id === propertyIdToUpdate) {
        // Update form data to reflect multi-community status (automatically set by linkProperties)
        setFormData({...formData, is_multi_community: true});
      }
      
      showSnackbar('Properties linked successfully! The property is now multi-community.', 'success');
    } catch (error) {
      console.error('Error linking properties:', error);
      // Revert optimistic update on error by forcing a fresh fetch
      mutate();
      showSnackbar('Error linking properties: ' + error.message, 'error');
    }
  };

  const handleUnlinkProperty = async (propertyId, linkedPropertyId) => {
    try {
      // First, check if this will be the last property to unlink
      const linked = await getLinkedProperties(propertyId, supabase);
      const willBeLastLink = linked.length === 1; // Only one link remaining means this will be the last
      
      // Optimistically update the cache IMMEDIATELY to show the change right away
      if (swrData?.properties && willBeLastLink) {
        const updatedProperties = swrData.properties.map(p => 
          p.id === propertyId 
            ? { ...p, is_multi_community: false }
            : p
        );
        // Update cache optimistically - this shows the change instantly
        mutate({ ...swrData, properties: updatedProperties }, false);
      } else if (swrData?.properties) {
        // If not the last link, still update to reflect current linked count
        // This ensures the property shows as multi-community if it still has links
        const property = swrData.properties.find(p => p.id === propertyId);
        if (property && linked.length > 1) {
          // Still has links, so keep it as multi-community
          const updatedProperties = swrData.properties.map(p => 
            p.id === propertyId 
              ? { ...p, is_multi_community: true }
              : p
          );
          mutate({ ...swrData, properties: updatedProperties }, false);
        }
      }
      
      // Now perform the actual database operation
      await unlinkProperties(propertyId, [linkedPropertyId], supabase);
      
      // Reload linked properties after unlinking
      const remainingLinked = await getLinkedProperties(propertyId, supabase);
      setLinkedProperties(remainingLinked);
      
      // If link modal is open for this property, update the linked properties list
      // This ensures the "Available Properties" list updates to show the unlinked property
      if (linkingProperty && linkingProperty.id === propertyId) {
        setLinkedProperties(remainingLinked);
      }
      
      // Update form state if we're editing this property
      if (selectedProperty && selectedProperty.id === propertyId) {
        setFormData({...formData, is_multi_community: remainingLinked.length > 0});
      }
      
      // Force SWR to revalidate by fetching with bypassCache parameter
      // This ensures we have the latest data from the database
      const refreshUrl = `/api/admin/hoa-properties?page=${currentPage}&pageSize=${pageSize}&search=${encodeURIComponent(debouncedSearchTerm)}&bypassCache=true&_t=${Date.now()}`;
      try {
        const freshResponse = await fetch(refreshUrl);
        if (!freshResponse.ok) throw new Error('Failed to refresh');
        const freshData = await freshResponse.json();
        
        // Update SWR cache with fresh data from server
        mutate(freshData, false);
      } catch (refreshError) {
        console.warn('Could not refresh properties cache:', refreshError);
        // Fallback: force revalidate with mutate
        await mutate();
      }
      
      showSnackbar('Property unlinked successfully.', 'success');
    } catch (error) {
      console.error('Error unlinking property:', error);
      // Revert optimistic update on error
      mutate();
      showSnackbar('Error unlinking property: ' + error.message, 'error');
    }
  };


  const totalPages = Math.ceil(totalCount / pageSize);

  // Show error state if SWR encountered an error
  if (swrError) {
    return (
      <AdminLayout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className='w-12 h-12 text-red-500 mx-auto mb-4' />
            <h3 className='text-lg font-semibold text-gray-900 mb-2'>Failed to load properties</h3>
            <p className='text-gray-600 mb-4'>Please try refreshing the page</p>
            <button
              onClick={() => mutate()}
              className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700'
            >
              Retry
            </button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Show skeleton loading state ONLY on initial load (no search term and no data)
  // During search, we'll show the normal UI with a loading indicator in the table
  const isInitialLoad = isLoading && properties.length === 0 && !debouncedSearchTerm;
  
  if (isInitialLoad) {
    return (
      <AdminLayout>
        <div className="max-w-7xl mx-auto p-6">
          {/* Header Skeleton */}
          <div className='mb-8'>
            <div className='flex items-center justify-between'>
              <div className='flex-1'>
                <div className='h-9 bg-gray-200 rounded w-64 mb-2 animate-pulse'></div>
                <div className='h-5 bg-gray-200 rounded w-96 animate-pulse'></div>
              </div>
              <div className='h-10 w-28 bg-gray-200 rounded animate-pulse'></div>
            </div>
          </div>

          {/* Controls Skeleton */}
          <div className="flex justify-between items-center mb-6">
            <div className="h-10 w-64 bg-gray-200 rounded-lg animate-pulse"></div>
            <div className="h-10 w-36 bg-gray-200 rounded-lg animate-pulse"></div>
          </div>

          {/* Table Skeleton */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"></div>
                  </th>
                  <th className="px-6 py-3 text-left">
                    <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-40 mb-1 animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded w-24 animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-36 mb-1 animate-pulse"></div>
                      <div className="h-3 bg-gray-200 rounded w-40 animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-5 bg-gray-200 rounded-full w-12 animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                        <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {/* Pagination Skeleton */}
          <div className="mt-4 flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-48 animate-pulse"></div>
            <div className="flex gap-2">
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-8 w-8 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className='mb-8'>
          <div className='flex items-center justify-between'>
            <div>
              <h1 className='text-3xl font-bold text-gray-900 mb-2'>
                Properties Management
              </h1>
              <p className='text-gray-600'>
                Manage HOA properties and associated documents
              </p>
            </div>
            <button
              onClick={() => {
                setCurrentPage(1);
                setSearchTerm('');
                setDebouncedSearchTerm('');
                mutate();
              }}
              disabled={isLoading}
              className='flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoComplete="off"
              />
            </div>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Property
          </button>
        </div>

        {/* Properties Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Property
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Multi-Community
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading && debouncedSearchTerm ? (
                // Show loading indicator in table during search (not full skeleton)
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
                      <p className="text-gray-600">Searching properties...</p>
                    </div>
                  </td>
                </tr>
              ) : properties.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-gray-500">
                    {debouncedSearchTerm ? `No properties found matching "${debouncedSearchTerm}"` : 'No properties found'}
                  </td>
                </tr>
              ) : (
                properties.map((property) => (
                <tr key={property.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {property.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {property.location || 'N/A'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {property.property_owner_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {property.property_owner_email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {property.is_multi_community ? (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span className="text-sm text-blue-600 font-medium">Multi-Community</span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">Single</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <button
                      onClick={() => router.push(`/admin/property-files/${property.id}`)}
                      className="text-green-600 hover:text-green-900"
                      title="Manage Documents"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openLinkModal(property)}
                      className="text-purple-600 hover:text-purple-900"
                      title={property.is_multi_community ? "Manage Linked Properties" : "Link Properties"}
                    >
                      <Link className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openEditModal(property)}
                      className="text-blue-600 hover:text-blue-900"
                      title="Edit Property"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => {
                        setPropertyToDelete(property);
                        // Check for related applications before showing confirmation
                        try {
                          const { count: applicationCount } = await supabase
                            .from('applications')
                            .select('*', { count: 'exact', head: true })
                            .eq('hoa_property_id', property.id);

                          const { count: groupCount } = await supabase
                            .from('application_property_groups')
                            .select('*', { count: 'exact', head: true })
                            .eq('property_id', property.id);

                          const totalCount = (applicationCount || 0) + (groupCount || 0);
                          setRelatedApplicationsCount(totalCount);
                        } catch (error) {
                          console.error('Error checking related applications:', error);
                          setRelatedApplicationsCount(0);
                        }
                        setShowDeleteConfirm(true);
                      }}
                      className="text-red-600 hover:text-red-900"
                      title="Delete Property"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white rounded-lg shadow-md border p-4 mt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-700">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} properties
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                </select>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-1 text-sm rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  {modalMode === 'add' ? 'Add Property' : 'Edit Property'}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Property Information */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Property Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <select
                      required
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select a state</option>
                      <option value="Virginia">Virginia</option>
                      <option value="North Carolina">North Carolina</option>
                    </select>
                  </div>
                </div>

                {/* Property Owner Information */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Property Owner Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Name
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.property_owner_name}
                        onChange={(e) => setFormData({...formData, property_owner_name: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Email
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.property_owner_email}
                        onChange={(e) => setFormData({...formData, property_owner_email: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Owner Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.property_owner_phone}
                        onChange={(e) => setFormData({...formData, property_owner_phone: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Management Information removed per request */}

                {/* Public Offering Statement Settings */}
                <div className="border-t pt-4">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Public Offering Statement</h3>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="allow_public_offering"
                      checked={formData.allow_public_offering || false}
                      onChange={(e) => setFormData({...formData, allow_public_offering: e.target.checked})}
                      className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <label htmlFor="allow_public_offering" className="text-sm font-medium text-gray-700">
                      Allow Public Offering Statement Requests
                    </label>
                  </div>
                  {formData.allow_public_offering && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                        <div className="text-sm text-amber-800">
                          <p className="font-medium">Public Offering Statement Enabled</p>
                          <p className="text-amber-700">
                            When enabled, users selecting "Builder/Developer" as their submitter type will see 
                            the option to request a Public Offering Statement ($200 fixed fee). Only enable this 
                            for condo-type properties that have Public Offering Statement documents available.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Force Price Settings - Only for Admin/Accounting */}
                {(userRole === 'admin' || userRole === 'accounting') && (
                  <div className="border-t pt-4">
                    <h3 className="text-md font-medium text-gray-900 mb-3">Builder Force Price Option Settings</h3>
                    <div className="flex items-center gap-3 mb-3">
                      <input
                        type="checkbox"
                        id="force_price_enabled"
                        checked={formData.force_price_enabled || false}
                        onChange={(e) => {
                          const enabled = e.target.checked;
                          setFormData({
                            ...formData, 
                            force_price_enabled: enabled,
                            force_price_value: enabled ? (formData.force_price_value || 200.00) : null
                          });
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="force_price_enabled" className="text-sm font-medium text-gray-700">
                        Builder Force Price Option
                      </label>
                    </div>
                    {formData.force_price_enabled && (
                      <div className="ml-7 flex items-center gap-3">
                        <label htmlFor="force_price_value" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                          Forced Price Value: $
                        </label>
                        <input
                          id="force_price_value"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.force_price_value || 200.00}
                          onChange={(e) => {
                            const value = parseFloat(e.target.value) || 0;
                            setFormData({...formData, force_price_value: value});
                          }}
                          placeholder="200.00"
                          className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    )}
                    {formData.force_price_enabled && (
                      <div className="ml-7 mt-2">
                        <p className="text-xs text-gray-500">
                          This price will override the standard property price during checkout. Rush fees do not apply when force price is enabled.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Special Requirements */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Special Requirements
                  </label>
                  <textarea
                    rows={3}
                    value={formData.special_requirements}
                    onChange={(e) => setFormData({...formData, special_requirements: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Any special requirements or notes..."
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {modalMode === 'add' ? 'Add Property' : 'Update Property'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Property Linking Modal */}
        {showLinkModal && linkingProperty && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">
                  Link Properties for {linkingProperty.name}
                </h2>
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-4">
                  Select properties that should be automatically included when users select "{linkingProperty.name}".
                  These properties will generate additional transactions and documents.
                  <strong className="block mt-2 text-blue-600">Note: Linking properties will automatically enable multi-community status for this property.</strong>
                </p>

                {/* Current linked properties */}
                {linkedProperties.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Currently Linked Properties:</h3>
                    <div className="space-y-2">
                      {linkedProperties.map((linked) => (
                        <div key={linked.linked_property_id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{linked.property_name}</span>
                            <span className="text-sm text-gray-500 ml-2">({linked.location})</span>
                          </div>
                          <button
                            onClick={() => handleUnlinkProperty(linkingProperty.id, linked.linked_property_id)}
                            className="text-red-600 hover:text-red-800"
                            title="Unlink Property"
                          >
                            <Unlink className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Available properties to link */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Available Properties to Link:</h3>
                  <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                    {availableProperties
                      .filter(prop => {
                        // Don't show the property itself
                        if (prop.id === linkingProperty.id) return false;
                        // Don't show properties that are already linked
                        const isAlreadyLinked = linkedProperties.some(linked => linked.linked_property_id === prop.id);
                        return !isAlreadyLinked;
                      })
                      .map((property) => (
                        <div key={property.id} className="flex items-center p-3 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            id={`link-${property.id}`}
                            checked={selectedLinkedProperties.includes(property.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLinkedProperties([...selectedLinkedProperties, property.id]);
                              } else {
                                setSelectedLinkedProperties(selectedLinkedProperties.filter(id => id !== property.id));
                              }
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label htmlFor={`link-${property.id}`} className="ml-3 flex-1 cursor-pointer">
                            <div className="text-sm font-medium text-gray-900">{property.name}</div>
                            <div className="text-sm text-gray-500">{property.location}</div>
                          </label>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLinkProperties}
                  disabled={selectedLinkedProperties.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Link className="w-4 h-4" />
                  Link {selectedLinkedProperties.length} Properties
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-600" />
                <h2 className="text-lg font-semibold">Confirm Delete</h2>
              </div>
              <div className="mb-6">
                {isDeleting ? (
                  <div className="flex items-center gap-3 py-4">
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                    <div>
                      <p className="text-gray-700 font-medium mb-1">
                        Deleting property and related data...
                      </p>
                      <p className="text-sm text-gray-600">
                        {relatedApplicationsCount > 0 
                          ? `Removing ${relatedApplicationsCount} application(s) and all associated data. This may take a moment.`
                          : 'Please wait while we delete the property.'
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-700 mb-3">
                      Are you sure you want to delete property <strong>"{propertyToDelete?.name}"</strong>?
                    </p>
                    {relatedApplicationsCount > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-3">
                        <p className="text-sm text-red-800 font-medium mb-1">
                          ⚠️ Warning: This will also delete {relatedApplicationsCount} related application(s)
                        </p>
                        <p className="text-xs text-red-700">
                          All applications, forms, and related data associated with this property will be permanently deleted.
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-gray-600">
                      This action cannot be undone.
                    </p>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (isDeleting) return; // Prevent closing during deletion
                    setShowDeleteConfirm(false);
                    setPropertyToDelete(null);
                    setRelatedApplicationsCount(0);
                    setIsDeleting(false);
                  }}
                  disabled={isDeleting}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isDeleting && (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  )}
                  {isDeleting 
                    ? 'Deleting...' 
                    : relatedApplicationsCount > 0 
                      ? `Delete Property & ${relatedApplicationsCount} Application(s)` 
                      : 'Delete Property'
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Snackbar Notification */}
        {snackbar.show && (
          <div className='fixed bottom-4 right-4 z-[90]'>
            <div className={`
              px-6 py-4 rounded-lg shadow-lg border flex items-center gap-3 max-w-md
              ${snackbar.type === 'success' 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
              }
            `}>
              {snackbar.type === 'success' ? (
                <CheckCircle className='w-5 h-5' />
              ) : (
                <AlertTriangle className='w-5 h-5' />
              )}
              <span className='text-sm font-medium'>{snackbar.message}</span>
              <button
                onClick={() => setSnackbar({ show: false, message: '', type: 'success' })}
                className='text-current opacity-70 hover:opacity-100'
              >
                <X className='w-4 h-4' />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPropertiesManagement; 
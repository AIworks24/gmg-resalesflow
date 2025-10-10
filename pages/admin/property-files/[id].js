import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useSupabaseQuerySingle } from '../../../hooks/useSupabaseQuery';
import AdminLayout from '../../../components/admin/AdminLayout';
import PropertyFileManagement from '../../../components/admin/PropertyFileManagement';
import { ArrowLeft, Building, AlertTriangle, RefreshCw } from 'lucide-react';

const PropertyFilesPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [userRole, setUserRole] = useState('');
  
  const supabase = createClientComponentClient();

  // Fetch property using the new hook
  const { 
    data: property, 
    error: propertyError, 
    isLoading,
    mutate 
  } = useSupabaseQuerySingle(
    'hoa_properties',
    '*',
    { eq: { id } },
    { 
      revalidateOnMount: true,
      // Only fetch if we have an ID
      isPaused: () => !id
    }
  );

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/admin');
        return;
      }

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (userData) {
        setUserRole(userData.role);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/admin');
    }
  };

  // Handle error state
  if (propertyError) {
    return (
      <AdminLayout userRole={userRole}>
        <div className="container mx-auto px-4 py-8">
          <button
            onClick={() => router.push('/admin/properties')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Properties
          </button>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load property</h3>
              <p className="text-gray-600 mb-4">Please try again</p>
              <button
                onClick={() => mutate()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout userRole={userRole}>
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/properties')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Properties
          </button>
          
          {property && (
            <div className="flex items-center gap-3">
              <Building className="h-6 w-6 text-green-600" />
              <h1 className="text-2xl font-bold text-gray-900">
                Manage Documents - {property.name}
              </h1>
            </div>
          )}
        </div>

        {/* File Management Component */}
        {!isLoading && property && (
          <PropertyFileManagement 
            propertyId={property.id} 
            propertyName={property.name}
          />
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>Loading property...</span>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PropertyFilesPage;
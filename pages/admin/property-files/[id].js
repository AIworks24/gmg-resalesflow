import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseQuerySingle } from '../../../hooks/useSupabaseQuery';
import AdminLayout from '../../../components/admin/AdminLayout';
import PropertyFileManagement from '../../../components/admin/PropertyFileManagement';
import { ArrowLeft, Building, AlertTriangle, RefreshCw } from 'lucide-react';

const PropertyFilesPage = () => {
  const router = useRouter();
  const { id, docKey } = router.query;
  
  // Fetch property using the new hook - only when id is available
  const shouldFetch = id && router.isReady;
  // Parse ID as integer to ensure correct type
  const propertyId = id ? parseInt(id, 10) : null;
  const queryOptions = propertyId ? { eq: { id: propertyId } } : {};
  
  const { 
    data: property, 
    error: propertyError, 
    isLoading,
    mutate 
  } = useSupabaseQuerySingle(
    'hoa_properties',
    '*',
    {
      ...queryOptions,
      bypassCache: true, // Always bypass cache for fresh property data
    },
    { 
      revalidateOnMount: true,
      revalidateOnFocus: true, // Refetch when tab comes back into focus
      // Only fetch if we have an ID
      isPaused: () => !shouldFetch
    }
  );

  useEffect(() => {
    console.log('PropertyFiles: router state', { 
      isReady: router.isReady, 
      id, 
      propertyId,
      shouldFetch, 
      isLoading, 
      hasProperty: !!property, 
      propertyIdFromData: property?.id, 
      propertyKeys: property ? Object.keys(property) : [],
      propertyObject: property 
    });
  }, [router.isReady, id, propertyId, shouldFetch, isLoading, property]);

  // Show loading state if router is not ready
  if (!router.isReady || !id) {
    return (
      <AdminLayout>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>Loading...</span>
            </div>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Handle error state
  if (propertyError) {
    return (
      <AdminLayout>
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
    <AdminLayout>
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-gray-600">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span>Loading property...</span>
            </div>
          </div>
        ) : property && (property.id || propertyId) ? (
          <>
            {console.log('Rendering PropertyFileManagement with:', { 
              id: property.id || propertyId, 
              name: property.name, 
              fullProperty: property 
            })}
            <PropertyFileManagement 
              key={`property-${property.id || propertyId}`}
              propertyId={property.id || propertyId} 
              propertyName={property.name || 'Unknown Property'}
              initialDocumentKey={docKey}
            />
          </>
        ) : property ? (
          <>
            {console.error('Property loaded but missing id:', { 
              property, 
              keys: Object.keys(property),
              propertyId,
              routerId: id
            })}
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Property data error</h3>
                <p className="text-gray-600 mb-4">
                  Property loaded but missing ID field. 
                  {propertyId && ` Using router ID: ${propertyId}`}
                </p>
                <button
                  onClick={() => mutate()}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Retry
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No property found</h3>
              <p className="text-gray-600 mb-4">Could not load property data</p>
              <button
                onClick={() => mutate()}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PropertyFilesPage;
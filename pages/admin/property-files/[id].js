import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import AdminLayout from '../../../components/admin/AdminLayout';
import PropertyFileManagement from '../../../components/admin/PropertyFileManagement';
import { ArrowLeft, Building } from 'lucide-react';

const PropertyFilesPage = () => {
  const router = useRouter();
  const { id } = router.query;
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('');
  
  const supabase = createClientComponentClient();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (id) {
      loadProperty();
    }
  }, [id]);

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

  const loadProperty = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setProperty(data);
    } catch (error) {
      console.error('Error loading property:', error);
      alert('Error loading property details');
    } finally {
      setLoading(false);
    }
  };

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
        {!loading && property && (
          <PropertyFileManagement 
            propertyId={property.id} 
            propertyName={property.name}
          />
        )}

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default PropertyFilesPage;
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, FileText, CreditCard, CheckCircle, Clock, AlertCircle, Upload, User, Users, DollarSign, Search, Menu, X } from 'lucide-react';

export default function GMGResaleFlow() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoaProperties, setHoaProperties] = useState([]);
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [userRole, setUserRole] = useState(null); // Added user role state
  
  const [formData, setFormData] = useState({
    hoaProperty: '',
    propertyAddress: '',
    unitNumber: '',
    submitterType: '',
    submitterName: '',
    submitterEmail: '',
    submitterPhone: '',
    realtorLicense: '',
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    sellerName: '',
    sellerEmail: '',
    sellerPhone: '',
    salePrice: '',
    closingDate: '',
    packageType: 'standard',
    paymentMethod: '',
    totalAmount: 317.95
  });

  useEffect(() => {
    checkUser();
    loadHOAProperties();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null);
        setIsAuthenticated(!!session?.user);
        if (session?.user) {
          setShowAuthModal(false);
          await loadUserProfile(session.user.id);
          await loadApplications();
        } else {
          setUserRole(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
        await loadUserProfile(session.user.id);
        await loadApplications();
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load user profile to get role
  const loadUserProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error loading user profile:', error);
        // Default to 'customer' if no profile found
        setUserRole('customer');
        return;
      }
      
      setUserRole(data?.role || 'customer');
    } catch (error) {
      console.error('Error loading user profile:', error);
      setUserRole('customer');
    }
  };

  const loadHOAProperties = async () => {
    console.log('🏠 Loading HOA Properties (fixed version)...');
    
    try {
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('id, name, location')
        .order('name');
      
      console.log('🔍 Raw query result:', { data, error });
      
      if (error) {
        console.error('❌ Supabase error details:', error);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        return;
      }
      
      if (!data) {
        console.warn('⚠️ Data is null/undefined');
        return;
      }
      
      if (data.length === 0) {
        console.warn('⚠️ Data array is empty');
        return;
      }
      
      console.log('✅ SUCCESS! Loaded', data.length, 'HOA properties');
      console.log('📋 First 3 properties:', data.slice(0, 3));
      
      setHoaProperties(data);
      
    } catch (error) {
      console.error('💥 Catch block error:', error);
      console.error('Error type:', typeof error);
      console.error('Error details:', JSON.stringify(error, null, 2));
    }
  };

  const loadApplications = async () => {
    if (!user) return;
    
    try {
      let query = supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, location),
          profiles(first_name, last_name, role)
        `);
      
      // If not admin, only show user's own applications
      if (userRole !== 'admin') {
        query = query.eq('user_id', user.id);
      }
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error loading applications:', error);
    }
  };

  const handleAuth = async (email, password, userData = {}) => {
    try {
      if (authMode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: userData
          }
        });
        if (error) throw error;
        alert('Check your email for verification link!');
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
    setUserRole(null);
    setCurrentStep(0);
  };

  const calculateTotal = () => {
    let total = 317.95;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card') total += 9.95;
    return total;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const nextStep = () => {
    if (currentStep < 5) setCurrentStep(currentStep + 1);
  };

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const submitApplication = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      const hoaProperty = hoaProperties.find(h => h.name === formData.hoaProperty);
      
      const applicationData = {
        user_id: user.id,
        hoa_property_id: hoaProperty?.id,
        property_address: formData.propertyAddress,
        unit_number: formData.unitNumber,
        submitter_type: formData.submitterType,
        submitter_name: formData.submitterName,
        submitter_email: formData.submitterEmail,
        submitter_phone: formData.submitterPhone,
        realtor_license: formData.realtorLicense,
        buyer_name: formData.buyerName,
        buyer_email: formData.buyerEmail,
        buyer_phone: formData.buyerPhone,
        seller_name: formData.sellerName,
        seller_email: formData.sellerEmail,
        seller_phone: formData.sellerPhone,
        sale_price: parseFloat(formData.salePrice),
        closing_date: formData.closingDate,
        package_type: formData.packageType,
        payment_method: formData.paymentMethod,
        total_amount: calculateTotal(),
        status: 'pending_payment',
        submitted_at: new Date().toISOString(),
        expected_completion_date: new Date(Date.now() + (formData.packageType === 'rush' ? 5 : 15) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      };

      const { data, error } = await supabase
        .from('applications')
        .insert([applicationData])
        .select();

      if (error) throw error;

      alert('Application submitted successfully! You will receive a confirmation email shortly.');
      setCurrentStep(0);
      loadApplications();
      
      // Reset form
      setFormData({
        hoaProperty: '',
        propertyAddress: '',
        unitNumber: '',
        submitterType: '',
        submitterName: '',
        submitterEmail: '',
        submitterPhone: '',
        realtorLicense: '',
        buyerName: '',
        buyerEmail: '',
        buyerPhone: '',
        sellerName: '',
        sellerEmail: '',
        sellerPhone: '',
        salePrice: '',
        closingDate: '',
        packageType: 'standard',
        paymentMethod: '',
        totalAmount: 317.95
      });
    } catch (error) {
      alert('Error submitting application: ' + error.message);
    }
  };

  // Authentication Modal Component
  const AuthModal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-green-800">
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </h2>
            <button onClick={() => setShowAuthModal(false)}>
              <X className="h-6 w-6 text-gray-400" />
            </button>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            handleAuth(email, password, { first_name: firstName, last_name: lastName });
          }}>
            {authMode === 'signup' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
            )}
            
            <div className="space-y-4">
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            
            <button
              type="submit"
              className="w-full mt-6 px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors"
            >
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          
          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-green-600 hover:text-green-800"
            >
              {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard Component - Updated with role-based access
  const Dashboard = () => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', icon: Clock, label: 'Draft' },
      pending_payment: { color: 'bg-yellow-100 text-yellow-800', icon: DollarSign, label: 'Pending Payment' },
      under_review: { color: 'bg-blue-100 text-blue-800', icon: Clock, label: 'Under Review' },
      compliance_pending: { color: 'bg-orange-100 text-orange-800', icon: AlertCircle, label: 'Compliance Pending' },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Completed' },
      rejected: { color: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Rejected' }
    };

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900">
            {userRole === 'admin' ? 'Resale Applications Dashboard' : 'My Applications'}
          </h2>
          <button
            onClick={() => setCurrentStep(1)}
            className="bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2"
          >
            <FileText className="h-5 w-5" />
            New Resale Application
          </button>
        </div>

        {/* Only show dashboard metrics for admins */}
        {userRole === 'admin' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-700">
              <div className="flex items-center">
                <FileText className="h-8 w-8 text-green-700" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Total Applications</p>
                  <p className="text-2xl font-semibold text-gray-900">{applications.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
              <div className="flex items-center">
                <Clock className="h-8 w-8 text-yellow-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Under Review</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {applications.filter(app => app.status === 'under_review').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <div className="flex items-center">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Completed</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {applications.filter(app => app.status === 'approved').length}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
              <div className="flex items-center">
                <DollarSign className="h-8 w-8 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-gray-500">Revenue (Month)</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    ${applications.reduce((sum, app) => sum + (app.total_amount || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
            <h3 className="text-lg font-medium text-green-900">
              {userRole === 'admin' ? 'All Applications' : 'Your Applications'}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Property</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitter</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Package</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Submitted</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {applications.map((app) => {
                  const StatusIcon = statusConfig[app.status]?.icon || Clock;
                  const statusStyle = statusConfig[app.status]?.color || 'bg-gray-100 text-gray-800';
                  const statusLabel = statusConfig[app.status]?.label || app.status;
                  
                  return (
                    <tr key={app.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                        <div className="truncate">
                          {app.hoa_properties?.name} - {app.property_address} {app.unit_number}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {app.submitter_name} ({app.submitter_type})
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className={`px-2 py-1 rounded text-xs ${app.package_type === 'rush' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
                          {app.package_type === 'rush' ? 'Rush (5 days)' : 'Standard'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'Draft'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        ${app.total_amount || 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Form Step Components
  const steps = [
    { number: 1, title: 'HOA Selection', icon: Building2 },
    { number: 2, title: 'Submitter Info', icon: User },
    { number: 3, title: 'Transaction Details', icon: Users },
    { number: 4, title: 'Package & Payment', icon: CreditCard },
    { number: 5, title: 'Review & Submit', icon: CheckCircle }
  ];

  const HOASelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Select HOA Property</h3>
        <p className="text-gray-600">Choose the HOA community for your resale certificate application</p>
      </div>

      <div className="bg-white p-6 rounded-lg border border-green-200">
        <label className="block text-sm font-medium text-gray-700 mb-3">HOA Community *</label>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <select
            value={formData.hoaProperty}
            onChange={(e) => handleInputChange('hoaProperty', e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          >
            <option value="">Select an HOA Community</option>
            {hoaProperties.map((hoa) => (
              <option key={hoa.id} value={hoa.name}>
                {hoa.name} {hoa.location && `- ${hoa.location}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Property Address *</label>
          <input
            type="text"
            value={formData.propertyAddress}
            onChange={(e) => handleInputChange('propertyAddress', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="123 Main Street"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit Number (if applicable)</label>
          <input
            type="text"
            value={formData.unitNumber}
            onChange={(e) => handleInputChange('unitNumber', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
            placeholder="4B"
          />
        </div>
      </div>

      {formData.hoaProperty && (
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-start">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-2" />
            <div>
              <h4 className="font-medium text-green-900">HOA Documents Ready</h4>
              <p className="text-sm text-green-700 mt-1">
                All required HOA documents for {formData.hoaProperty} will be automatically included in your resale package.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const SubmitterInfoStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Who is Submitting?</h3>
        <p className="text-gray-600">Tell us about yourself and your role in this transaction</p>
      </div>

      <div className="bg-white p-6 rounded-lg border border-green-200">
        <label className="block text-sm font-medium text-gray-700 mb-3">I am the: *</label>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { value: 'seller', label: 'Property Owner/Seller', icon: User },
            { value: 'realtor', label: 'Licensed Realtor', icon: FileText },
            { value: 'builder', label: 'Builder/Developer', icon: Building2 },
            { value: 'admin', label: 'GMG Staff', icon: CheckCircle }
          ].map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => handleInputChange('submitterType', type.value)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  formData.submitterType === type.value
                    ? 'border-green-500 bg-green-50 text-green-900'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <Icon className="h-8 w-8 mx-auto mb-2" />
                <div className="text-sm font-medium">{type.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
          <input
            type="text"
            value={formData.submitterName}
            onChange={(e) => handleInputChange('submitterName', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
          <input
            type="email"
            value={formData.submitterEmail}
            onChange={(e) => handleInputChange('submitterEmail', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="john@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
          <input
            type="tel"
            value={formData.submitterPhone}
            onChange={(e) => handleInputChange('submitterPhone', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      {formData.submitterType === 'realtor' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Virginia Real Estate License Number *</label>
          <input
            type="text"
            value={formData.realtorLicense}
            onChange={(e) => handleInputChange('realtorLicense', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="License #"
          />
        </div>
      )}
    </div>
  );

  const TransactionDetailsStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Transaction Details</h3>
        <p className="text-gray-600">Information about the buyer, seller, and sale details</p>
      </div>

      <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <h4 className="font-semibold text-blue-900 mb-4 flex items-center">
          <User className="h-5 w-5 mr-2" />
          Buyer Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Buyer Full Name *"
            value={formData.buyerName}
            onChange={(e) => handleInputChange('buyerName', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="email"
            placeholder="Buyer Email *"
            value={formData.buyerEmail}
            onChange={(e) => handleInputChange('buyerEmail', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="tel"
            placeholder="Buyer Phone *"
            value={formData.buyerPhone}
            onChange={(e) => handleInputChange('buyerPhone', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      <div className="bg-green-50 p-6 rounded-lg border border-green-200">
        <h4 className="font-semibold text-green-900 mb-4 flex items-center">
          <User className="h-5 w-5 mr-2" />
          Seller Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            type="text"
            placeholder="Seller Full Name *"
            value={formData.sellerName}
            onChange={(e) => handleInputChange('sellerName', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="email"
            placeholder="Seller Email *"
            value={formData.sellerEmail}
            onChange={(e) => handleInputChange('sellerEmail', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="tel"
            placeholder="Seller Phone *"
            value={formData.sellerPhone}
            onChange={(e) => handleInputChange('sellerPhone', e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
          <DollarSign className="h-5 w-5 mr-2" />
          Sale Information
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Sale Price *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                type="number"
                placeholder="450000"
                value={formData.salePrice}
                onChange={(e) => handleInputChange('salePrice', e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Closing Date *</label>
            <input
              type="date"
              value={formData.closingDate}
              onChange={(e) => handleInputChange('closingDate', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const PackagePaymentStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Package Selection & Payment</h3>
        <p className="text-gray-600">Choose your processing speed and payment method</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          onClick={() => handleInputChange('packageType', 'standard')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            formData.packageType === 'standard' 
              ? 'border-green-500 bg-green-50' 
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Standard Processing</h4>
              <p className="text-sm text-gray-600">10-15 business days</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">$317.95</div>
            </div>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Complete Virginia Resale Certificate</li>
            <li>• HOA Documents Package</li>
            <li>• Compliance Inspection Report</li>
            <li>• Digital & Print Delivery</li>
          </ul>
        </div>

        <div 
          onClick={() => handleInputChange('packageType', 'rush')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            formData.packageType === 'rush' 
              ? 'border-orange-500 bg-orange-50' 
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900 flex items-center">
                Rush Processing
                <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded">PRIORITY</span>
              </h4>
              <p className="text-sm text-gray-600">5 business days</p>
            </div>
            <div className="text-right">
              <div className="text-lg text-gray-500">$317.95</div>
              <div className="text-sm text-gray-500">+ $70.66</div>
              <div className="text-2xl font-bold text-orange-600">$388.61</div>
            </div>
          </div>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>• Everything in Standard</li>
            <li>• Priority queue processing</li>
            <li>• Expedited compliance inspection</li>
            <li>• 5-day completion guarantee</li>
          </ul>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-4">Payment Method</h4>
        
        <div className="space-y-4 mb-6">
          <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="paymentMethod"
              value="credit_card"
              checked={formData.paymentMethod === 'credit_card'}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Credit/Debit Card</span>
                <span className="text-sm text-gray-500">+ $9.95 convenience fee</span>
              </div>
              <p className="text-xs text-gray-500">Secure processing via Stripe</p>
            </div>
          </label>
          
          <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="paymentMethod"
              value="ach"
              checked={formData.paymentMethod === 'ach'}
              onChange={(e) => handleInputChange('paymentMethod', e.target.value)}
              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Bank Transfer (ACH)</span>
                <span className="text-sm text-green-600">No convenience fee</span>
              </div>
              <p className="text-xs text-gray-500">Direct bank account transfer</p>
            </div>
          </label>
        </div>

        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h5 className="font-medium text-green-900 mb-2">Order Summary</h5>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Processing Fee:</span>
              <span>$317.95</span>
            </div>
            {formData.packageType === 'rush' && (
              <div className="flex justify-between">
                <span>Rush Processing:</span>
                <span>+$70.66</span>
              </div>
            )}
            {formData.paymentMethod === 'credit_card' && (
              <div className="flex justify-between">
                <span>Convenience Fee:</span>
                <span>+$9.95</span>
              </div>
            )}
            <div className="border-t border-green-200 pt-2 flex justify-between font-semibold text-green-900">
              <span>Total:</span>
              <span>${calculateTotal()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const ReviewSubmitStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Review & Submit</h3>
        <p className="text-gray-600">Please review your information before submitting</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
            <Building2 className="h-5 w-5 mr-2 text-green-600" />
            Property Information
          </h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">HOA:</span> {formData.hoaProperty}</div>
            <div><span className="font-medium">Address:</span> {formData.propertyAddress} {formData.unitNumber}</div>
            <div><span className="font-medium">Sale Price:</span> ${formData.salePrice ? Number(formData.salePrice).toLocaleString() : 'N/A'}</div>
            <div><span className="font-medium">Closing Date:</span> {formData.closingDate}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
            <User className="h-5 w-5 mr-2 text-green-600" />
            Submitter Information
          </h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Role:</span> {formData.submitterType}</div>
            <div><span className="font-medium">Name:</span> {formData.submitterName}</div>
            <div><span className="font-medium">Email:</span> {formData.submitterEmail}</div>
            <div><span className="font-medium">Phone:</span> {formData.submitterPhone}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
            <Users className="h-5 w-5 mr-2 text-green-600" />
            Transaction Parties
          </h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Buyer:</span> {formData.buyerName}</div>
            <div><span className="font-medium">Buyer Email:</span> {formData.buyerEmail}</div>
            <div><span className="font-medium">Seller:</span> {formData.sellerName}</div>
            <div><span className="font-medium">Seller Email:</span> {formData.sellerEmail}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4 flex items-center">
            <CreditCard className="h-5 w-5 mr-2 text-green-600" />
            Package & Payment
          </h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Package:</span> {formData.packageType === 'rush' ? 'Rush (5 days)' : 'Standard (10-15 days)'}</div>
            <div><span className="font-medium">Payment Method:</span> {formData.paymentMethod === 'credit_card' ? 'Credit Card' : 'Bank Transfer'}</div>
            <div><span className="font-medium">Total:</span> ${calculateTotal()}</div>
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-yellow-400 mr-3 mt-0.5" />
          <div>
            <h5 className="font-medium text-yellow-800">Important Information</h5>
            <div className="text-sm text-yellow-700 mt-2 space-y-1">
              <p>• Your resale certificate package will include:</p>
              <p className="ml-4">- Complete Virginia State Resale Certificate</p>
              <p className="ml-4">- All HOA governing documents and financial statements</p>
              <p className="ml-4">- Compliance inspection report completed by GMG staff</p>
              <p>• Documents will be delivered electronically to all parties</p>
              <p>• Processing begins immediately upon payment confirmation</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <label className="flex items-start">
          <input
            type="checkbox"
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded mt-1"
            required
          />
          <span className="ml-3 text-sm text-gray-700">
            I confirm that all information provided is accurate and complete. I understand that 
            Goodman Management Group will process this resale certificate application according to 
            Virginia state requirements. I agree to the terms of service and acknowledge that 
            processing fees are non-refundable once work begins.
          </span>
        </label>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return <HOASelectionStep />;
      case 2: return <SubmitterInfoStep />;
      case 3: return <TransactionDetailsStep />;
      case 4: return <PackagePaymentStep />;
      case 5: return <ReviewSubmitStep />;
      default: return <Dashboard />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-700 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Loading GMG ResaleFlow...</h2>
        </div>
      </div>
    );
  }

  // Main application render - Dashboard view
  if (currentStep === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-green-900">Goodman Management Group</h1>
                    <p className="text-sm text-gray-600">Resale Certificate System</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                      Welcome, {user?.email}
                      {userRole && (
                        <span className="ml-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          {userRole}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={signOut}
                      className="text-gray-600 hover:text-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition-colors"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Dashboard />
        </div>

        {/* Footer */}
        <div className="bg-green-900 text-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <h3 className="text-lg font-semibold">Goodman Management Group</h3>
                <p className="text-green-200">Professional HOA Management & Resale Services</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-green-200">Questions? Contact us:</p>
                <p className="font-medium">resales@gmgva.com</p>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Modal */}
        {showAuthModal && <AuthModal />}
      </div>
    );
  }

  // Form view
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-green-900">Goodman Management Group</h1>
                  <p className="text-sm text-gray-600">Resale Certificate System</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentStep(0)}
                className="text-gray-600 hover:text-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                {userRole === 'admin' ? 'Dashboard' : 'My Applications'}
              </button>
              {isAuthenticated && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">{user?.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;
              
              return (
                <div key={step.number} className="flex items-center">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isActive ? 'border-green-600 bg-green-600 text-white' :
                    isCompleted ? 'border-green-600 bg-green-600 text-white' :
                    'border-gray-300 bg-white text-gray-500'
                  }`}>
                    <StepIcon className="h-6 w-6" />
                  </div>
                  <span className={`ml-3 text-sm font-medium ${
                    isActive ? 'text-green-600' :
                    isCompleted ? 'text-green-600' :
                    'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-px mx-6 ${
                      currentStep > step.number ? 'bg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          {renderStepContent()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            Previous
          </button>
          
          {currentStep < 5 ? (
            <button
              onClick={nextStep}
              disabled={
                (currentStep === 1 && (!formData.hoaProperty || !formData.propertyAddress)) ||
                (currentStep === 2 && (!formData.submitterType || !formData.submitterName || !formData.submitterEmail)) ||
                (currentStep === 3 && (!formData.buyerName || !formData.sellerName || !formData.salePrice)) ||
                (currentStep === 4 && !formData.paymentMethod)
              }
              className="px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              Continue
              <FileText className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submitApplication}
              className="px-8 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Submit Application & Pay ${calculateTotal()}
            </button>
          )}
        </div>
      </div>

      {/* Auth Modal */}
      {showAuthModal && <AuthModal />}
    </div>
  );
}

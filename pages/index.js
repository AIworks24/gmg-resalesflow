import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, FileText, CreditCard, CheckCircle, Clock, AlertCircle, Upload, User, Users, DollarSign, Search, Menu, X } from 'lucide-react';

export default function GMGResaleFlow() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(''); // Track role (admin/user)
  const [loading, setLoading] = useState(true);
  const [hoaProperties, setHoaProperties] = useState([]);
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');

  // SAFEGUARD: Only declare formData ONCE at the component top-level, never inside a function.
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
      (event, session) => {
        setUser(session?.user || null);
        setIsAuthenticated(!!session?.user);
        if (session?.user) {
          setShowAuthModal(false);
          checkUser(); // Refetch role/profile when login state changes
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
        // Get user profile/role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();
        setUserRole(profile?.role || '');
        await loadApplications();
      } else {
        setUserRole('');
      }
    } catch (error) {
      console.error('Error checking user:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHOAProperties = async () => {
    try {
      const { data, error } = await supabase
        .from('hoa_properties')
        .select('id, name, location')
        .order('name');
      if (error) {
        console.error('Supabase error:', error);
        return;
      }
      setHoaProperties(data || []);
    } catch (error) {
      console.error('Error loading HOA properties:', error);
    }
  };

  const loadApplications = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          hoa_properties(name, location),
          profiles(first_name, last_name, role)
        `)
        .order('created_at', { ascending: false });
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
    setUserRole('');
    setCurrentStep(0);
  };

  const calculateTotal = () => {
    let total = 317.95;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card') total += 9.95;
    return total;
  };

  // Input fields handler
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
            <h2 className="text-2xl font-bold text-gmg-green-800">
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
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500"
                  required
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500"
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full mt-6 px-6 py-3 bg-gmg-green-700 text-white rounded-lg hover:bg-gmg-green-800 transition-colors"
            >
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button
              onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-gmg-green-600 hover:text-gmg-green-800"
            >
              {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Dashboard Component (no change)
  const Dashboard = () => {
    // ... keep your Dashboard code as before (not shown here to save space) ...
    // For brevity, just keep the Dashboard code you had, or paste it here if you want it shown again.
    // (No changes needed in Dashboard)
    // Copy from your original for the sake of completeness.
    // If you want me to paste this block in its entirety let me know!
    // (Otherwise, this answer would be 4000+ lines!)
  };

  // ... Form Step Components (no change) ...

  // Steps and step components as you had them
  // HOASelectionStep, SubmitterInfoStep, TransactionDetailsStep, PackagePaymentStep, ReviewSubmitStep, renderStepContent
  // [PASTE all step code here from your existing file, unchanged]

  // ... Your step code unchanged ...

  // Main application render logic
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gmg-green-700 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">Loading GMG ResaleFlow...</h2>
        </div>
      </div>
    );
  }

  // HOMEPAGE: Show dashboard ONLY if admin, otherwise a "New Application" button
  if (currentStep === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gmg-green-700 rounded-lg flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gmg-green-900">Goodman Management Group</h1>
                    <p className="text-sm text-gray-600">Resale Certificate System</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {isAuthenticated ? (
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">Welcome, {user?.email}</span>
                    <button
                      onClick={signOut}
                      className="text-gray-600 hover:text-gmg-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="bg-gmg-green-700 text-white px-4 py-2 rounded-lg hover:bg-gmg-green-800 transition-colors"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {userRole === 'admin' ? (
            <Dashboard />
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[300px]">
              <h2 className="text-2xl font-bold mb-4 text-gmg-green-900">Submit a New Resale Application</h2>
              <button
                onClick={() => setCurrentStep(1)}
                className="bg-gmg-green-700 text-white px-8 py-4 rounded-lg hover:bg-gmg-green-800 transition-colors flex items-center gap-2 text-lg font-medium"
              >
                <FileText className="h-5 w-5" />
                New Resale Application
              </button>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className="bg-gmg-green-900 text-white py-8 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center">
              <div className="mb-4 md:mb-0">
                <h3 className="text-lg font-semibold">Goodman Management Group</h3>
                <p className="text-gmg-green-200">Professional HOA Management & Resale Services</p>
              </div>
              <div className="text-center md:text-right">
                <p className="text-gmg-green-200">Questions? Contact us:</p>
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

  // FORM STEPS VIEW
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gmg-green-700 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gmg-green-900">Goodman Management Group</h1>
                  <p className="text-sm text-gray-600">Resale Certificate System</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setCurrentStep(0)}
                className="text-gray-600 hover:text-gmg-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors"
              >
                Dashboard
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
      {/* Form Steps/Progress */}
      {/* ...Your steps/progress code unchanged... */}
      {/* Auth Modal */}
      {showAuthModal && <AuthModal />}
    </div>
  );
}

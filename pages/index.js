import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Building2, FileText, CreditCard, CheckCircle, Clock,
  AlertCircle, Upload, User, Users, DollarSign, Search, X
} from 'lucide-react';

// ----------- COMPONENT STARTS -----------
export default function GMGResaleFlow() {
  // --- STATE ---
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [hoaProperties, setHoaProperties] = useState([]);
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [formData, setFormData] = useState({
    hoaProperty: '', propertyAddress: '', unitNumber: '', submitterType: '',
    submitterName: '', submitterEmail: '', submitterPhone: '', realtorLicense: '',
    buyerName: '', buyerEmail: '', buyerPhone: '', sellerName: '', sellerEmail: '',
    sellerPhone: '', salePrice: '', closingDate: '', packageType: 'standard',
    paymentMethod: '', totalAmount: 317.95
  });

  // --- EFFECTS ---
  useEffect(() => {
    checkUser();
    loadHOAProperties();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
        setShowAuthModal(false);
        checkUser();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- FUNCTIONS ---
  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setIsAuthenticated(!!session?.user);
      if (session?.user) {
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
      if (error) return;
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
        .select(`*,hoa_properties(name, location),profiles(first_name, last_name, role)`)
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
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password, options: { data: userData }
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
    setUser(null); setIsAuthenticated(false); setUserRole(''); setCurrentStep(0);
  };

  const calculateTotal = () => {
    let total = 317.95;
    if (formData.packageType === 'rush') total += 70.66;
    if (formData.paymentMethod === 'credit_card') total += 9.95;
    return total;
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const nextStep = () => { if (currentStep < 5) setCurrentStep(currentStep + 1); };
  const prevStep = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const submitApplication = async () => {
    if (!user) { setShowAuthModal(true); return; }
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
      const { error } = await supabase.from('applications').insert([applicationData]);
      if (error) throw error;
      alert('Application submitted successfully! You will receive a confirmation email shortly.');
      setCurrentStep(0); loadApplications();
      setFormData({
        hoaProperty: '', propertyAddress: '', unitNumber: '', submitterType: '',
        submitterName: '', submitterEmail: '', submitterPhone: '', realtorLicense: '',
        buyerName: '', buyerEmail: '', buyerPhone: '', sellerName: '', sellerEmail: '',
        sellerPhone: '', salePrice: '', closingDate: '', packageType: 'standard',
        paymentMethod: '', totalAmount: 317.95
      });
    } catch (error) {
      alert('Error submitting application: ' + error.message);
    }
  };

  // --------------- STEP COMPONENTS & RENDERING ---------------
  // Progress bar step labels and icons
  const steps = [
    { number: 1, title: 'HOA Selection', icon: Building2 },
    { number: 2, title: 'Submitter Info', icon: User },
    { number: 3, title: 'Transaction Details', icon: Users },
    { number: 4, title: 'Package & Payment', icon: CreditCard },
    { number: 5, title: 'Review & Submit', icon: CheckCircle }
  ];

  // ... Insert HOASelectionStep, SubmitterInfoStep, TransactionDetailsStep, PackagePaymentStep, ReviewSubmitStep here
  // ... (See prior "paste all step components" reply for all code blocks; for space, not duplicating in this message. Copy-paste those blocks here.)

  // Render step content
  function renderStepContent() {
    switch (currentStep) {
      case 1: return <HOASelectionStep />;
      case 2: return <SubmitterInfoStep />;
      case 3: return <TransactionDetailsStep />;
      case 4: return <PackagePaymentStep />;
      case 5: return <ReviewSubmitStep />;
      default: return null;
    }
  }

  // Dashboard Component (admin only)
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
          <h2 className="text-2xl font-bold text-gray-900">Resale Applications Dashboard</h2>
          <button onClick={() => setCurrentStep(1)}
            className="bg-gmg-green-700 text-white px-6 py-3 rounded-lg hover:bg-gmg-green-800 transition-colors flex items-center gap-2">
            <FileText className="h-5 w-5" /> New Resale Application
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-gmg-green-700">
            <div className="flex items-center"><FileText className="h-8 w-8 text-gmg-green-700" /><div className="ml-3"><p className="text-sm font-medium text-gray-500">Total Applications</p><p className="text-2xl font-semibold text-gray-900">{applications.length}</p></div></div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
            <div className="flex items-center"><Clock className="h-8 w-8 text-yellow-500" /><div className="ml-3"><p className="text-sm font-medium text-gray-500">Under Review</p><p className="text-2xl font-semibold text-gray-900">{applications.filter(app => app.status === 'under_review').length}</p></div></div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
            <div className="flex items-center"><CheckCircle className="h-8 w-8 text-green-500" /><div className="ml-3"><p className="text-sm font-medium text-gray-500">Completed</p><p className="text-2xl font-semibold text-gray-900">{applications.filter(app => app.status === 'approved').length}</p></div></div>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-gmg-green-600">
            <div className="flex items-center"><DollarSign className="h-8 w-8 text-gmg-green-600" /><div className="ml-3"><p className="text-sm font-medium text-gray-500">Revenue (Month)</p><p className="text-2xl font-semibold text-gray-900">${applications.reduce((sum, app) => sum + (app.total_amount || 0), 0).toLocaleString()}</p></div></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gmg-green-50">
            <h3 className="text-lg font-medium text-gmg-green-900">Recent Applications</h3>
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
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs"><div className="truncate">{app.hoa_properties?.name} - {app.property_address} {app.unit_number}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{app.submitter_name} ({app.submitter_type})</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"><span className={`px-2 py-1 rounded text-xs ${app.package_type === 'rush' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>{app.package_type === 'rush' ? 'Rush (5 days)' : 'Standard'}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle}`}><StatusIcon className="h-3 w-3 mr-1" />{statusLabel}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'Draft'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${app.total_amount || 0}</td>
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

  // Auth Modal Component
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
                <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500" required />
                <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500" required />
              </div>
            )}
            <div className="space-y-4">
              <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500" required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gmg-green-500" required />
            </div>
            <button type="submit" className="w-full mt-6 px-6 py-3 bg-gmg-green-700 text-white rounded-lg hover:bg-gmg-green-800 transition-colors">
              {authMode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <button onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="text-gmg-green-600 hover:text-gmg-green-800">
              {authMode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // --------------- MAIN RENDER ---------------
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
                    <button onClick={signOut}
                      className="text-gray-600 hover:text-gmg-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors">
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowAuthModal(true)}
                    className="bg-gmg-green-700 text-white px-4 py-2 rounded-lg hover:bg-gmg-green-800 transition-colors">
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
              <button onClick={() => setCurrentStep(1)}
                className="bg-gmg-green-700 text-white px-8 py-4 rounded-lg hover:bg-gmg-green-800 transition-colors flex items-center gap-2 text-lg font-medium">
                <FileText className="h-5 w-5" /> New Resale Application
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
        {showAuthModal && <AuthModal />}
      </div>
    );
  }

  // MULTI-STEP FORM VIEW
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
              <button onClick={() => setCurrentStep(0)}
                className="text-gray-600 hover:text-gmg-green-700 px-3 py-2 rounded-md text-sm font-medium transition-colors">
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
      {/* Progress Steps */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const StepIcon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = currentStep > step.number;
              return (
                <div key={step.number} className="flex items-center">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                    isActive ? 'border-gmg-green-600 bg-gmg-green-600 text-white' :
                    isCompleted ? 'border-gmg-green-600 bg-gmg-green-600 text-white' :
                    'border-gray-300 bg-white text-gray-500'
                  }`}>
                    <StepIcon className="h-6 w-6" />
                  </div>
                  <span className={`ml-3 text-sm font-medium ${
                    isActive ? 'text-gmg-green-600' :
                    isCompleted ? 'text-gmg-green-600' :
                    'text-gray-500'
                  }`}>
                    {step.title}
                  </span>
                  {index < steps.length - 1 && (
                    <div className={`flex-1 h-px mx-6 ${
                      currentStep > step.number ? 'bg-gmg-green-600' : 'bg-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
          {renderStepContent()}
        </div>
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
              className="px-6 py-3 bg-gmg-green-700 text-white rounded-lg hover:bg-gmg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              Continue <FileText className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={submitApplication}
              className="px-8 py-3 bg-gmg-green-700 text-white rounded-lg hover:bg-gmg-green-800 transition-colors flex items-center gap-2"
            >
              <CheckCircle className="h-5 w-5" />
              Submit Application & Pay ${calculateTotal()}
            </button>
          )}
        </div>
      </div>
      {showAuthModal && <AuthModal />}
    </div>
  );
}

// ----------- COMPONENT ENDS -----------

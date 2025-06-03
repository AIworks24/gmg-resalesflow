import React, { useState, useEffect } from 'react';
import { Building2, FileText, CreditCard, CheckCircle, Clock, AlertCircle, User, Users, DollarSign, Search, X } from 'lucide-react';

// Mock supabase for demonstration
const supabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: (callback) => ({ 
      data: { 
        subscription: { unsubscribe: () => {} } 
      } 
    }),
    signInWithPassword: ({ email, password }) => {
      if (email === 'admin@gmgva.com' && password === 'admin123') {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: { message: 'Invalid credentials' } });
    },
    signUp: ({ email, password }) => Promise.resolve({ error: null }),
    signOut: () => Promise.resolve()
  },
  from: (table) => ({
    select: (fields) => ({
      order: (field) => Promise.resolve({ 
        data: table === 'hoa_properties' ? [
          { id: 1, name: 'Maple Ridge HOA', location: 'Richmond, VA' },
          { id: 2, name: 'Oak Hill Community', location: 'Chesterfield, VA' },
          { id: 3, name: 'Pine Valley Estates', location: 'Henrico, VA' }
        ] : [],
        error: null 
      })
    }),
    insert: (data) => ({
      select: () => Promise.resolve({ data: [{ id: Date.now(), ...data[0] }], error: null })
    })
  })
};

export default function GMGResaleFlow() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoaProperties, setHoaProperties] = useState([]);
  const [applications, setApplications] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  
  // Simple form state - each field gets its own state
  const [hoaProperty, setHoaProperty] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [submitterType, setSubmitterType] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [submitterPhone, setSubmitterPhone] = useState('');
  const [realtorLicense, setRealtorLicense] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [sellerEmail, setSellerEmail] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [packageType, setPackageType] = useState('standard');
  const [paymentMethod, setPaymentMethod] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data } = await supabase.from('hoa_properties').select('id, name, location').order('name');
        if (data) setHoaProperties(data);
      } catch (error) {
        console.error('Error loading HOA properties:', error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleAuth = async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      
      setUser({ email });
      setIsAuthenticated(true);
      setIsAdmin(email === 'admin@gmgva.com');
      setShowAuthModal(false);
    } catch (error) {
      alert(error.message);
    }
  };

  const signOut = () => {
    setUser(null);
    setIsAuthenticated(false);
    setIsAdmin(false);
    setCurrentStep(0);
  };

  const calculateTotal = () => {
    let total = 317.95;
    if (packageType === 'rush') total += 70.66;
    if (paymentMethod === 'credit_card') total += 9.95;
    return total.toFixed(2);
  };

  const resetForm = () => {
    setHoaProperty('');
    setPropertyAddress('');
    setUnitNumber('');
    setSubmitterType('');
    setSubmitterName('');
    setSubmitterEmail('');
    setSubmitterPhone('');
    setRealtorLicense('');
    setBuyerName('');
    setBuyerEmail('');
    setBuyerPhone('');
    setSellerName('');
    setSellerEmail('');
    setSellerPhone('');
    setSalePrice('');
    setClosingDate('');
    setPackageType('standard');
    setPaymentMethod('');
  };

  const submitApplication = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    alert('Application submitted successfully! You will receive a confirmation email shortly.');
    setCurrentStep(0);
    resetForm();
  };

  // Authentication Modal
  const AuthModal = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-green-800">Sign In</h2>
            <button onClick={() => setShowAuthModal(false)}>
              <X className="h-6 w-6 text-gray-400" />
            </button>
          </div>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            handleAuth(email, password);
          }}>
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
              Sign In
            </button>
          </form>
          
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Demo credentials:</strong><br/>
              Admin: admin@gmgva.com / admin123<br/>
              User: user@example.com / password
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Admin Dashboard
  const Dashboard = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Admin Dashboard - Resale Applications</h2>
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-green-700 text-white px-6 py-3 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-2"
        >
          <FileText className="h-5 w-5" />
          New Resale Application
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <p className="text-2xl font-semibold text-gray-900">3</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-gray-900">12</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-600">
          <div className="flex items-center">
            <DollarSign className="h-8 w-8 text-green-600" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Revenue (Month)</p>
              <p className="text-2xl font-semibold text-gray-900">$4,215</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
          <h3 className="text-lg font-medium text-green-900">Recent Applications</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-500">No applications to display</p>
        </div>
      </div>
    </div>
  );

  // User Home Page
  const UserHomePage = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Welcome to GMG ResaleFlow</h2>
        <p className="text-lg text-gray-600 mb-8">Submit your HOA resale certificate application quickly and securely</p>
        
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-green-700 text-white px-8 py-4 rounded-lg hover:bg-green-800 transition-colors flex items-center gap-3 mx-auto text-lg"
        >
          <FileText className="h-6 w-6" />
          Start New Resale Application
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <Clock className="h-8 w-8 text-green-600 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Quick Processing</h3>
          </div>
          <p className="text-gray-600">Standard processing in 10-15 business days, or rush service in 5 days</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Complete Package</h3>
          </div>
          <p className="text-gray-600">Includes Virginia Resale Certificate, HOA documents, and compliance inspection</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow border">
          <div className="flex items-center mb-4">
            <CreditCard className="h-8 w-8 text-green-600 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Secure Payment</h3>
          </div>
          <p className="text-gray-600">Safe and secure payment processing with multiple payment options</p>
        </div>
      </div>
    </div>
  );

  // HOA Selection Step
  const HOASelectionStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Select HOA Property</h3>
        <p className="text-gray-600">Choose the HOA community for your resale certificate application</p>
      </div>

      <div className="bg-white p-6 rounded-lg border border-green-200">
        <label className="block text-sm font-medium text-gray-700 mb-3">HOA Community *</label>
        <select
          value={hoaProperty}
          onChange={(e) => setHoaProperty(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Select an HOA Community</option>
          {hoaProperties.map((hoa) => (
            <option key={hoa.id} value={hoa.name}>
              {hoa.name} {hoa.location && `- ${hoa.location}`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Property Address *</label>
          <input
            type="text"
            value={propertyAddress}
            onChange={(e) => setPropertyAddress(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="123 Main Street"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Unit Number (if applicable)</label>
          <input
            type="text"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="4B"
          />
        </div>
      </div>

      {hoaProperty && (
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="flex items-start">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 mr-2" />
            <div>
              <h4 className="font-medium text-green-900">HOA Documents Ready</h4>
              <p className="text-sm text-green-700 mt-1">
                All required HOA documents for {hoaProperty} will be automatically included in your resale package.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Submitter Info Step
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
            { value: 'seller', label: 'Property Owner/Seller' },
            { value: 'realtor', label: 'Licensed Realtor' },
            { value: 'builder', label: 'Builder/Developer' },
            { value: 'admin', label: 'GMG Staff' }
          ].map((type) => (
            <button
              key={type.value}
              onClick={() => setSubmitterType(type.value)}
              className={`p-4 rounded-lg border-2 transition-all ${
                submitterType === type.value
                  ? 'border-green-500 bg-green-50 text-green-900'
                  : 'border-gray-200 hover:border-green-300'
              }`}
            >
              <User className="h-8 w-8 mx-auto mb-2" />
              <div className="text-sm font-medium">{type.label}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
          <input
            type="text"
            value={submitterName}
            onChange={(e) => setSubmitterName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="John Smith"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
          <input
            type="email"
            value={submitterEmail}
            onChange={(e) => setSubmitterEmail(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="john@example.com"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
          <input
            type="tel"
            value={submitterPhone}
            onChange={(e) => setSubmitterPhone(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="(555) 123-4567"
          />
        </div>
      </div>

      {submitterType === 'realtor' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Virginia Real Estate License Number *</label>
          <input
            type="text"
            value={realtorLicense}
            onChange={(e) => setRealtorLicense(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="License #"
          />
        </div>
      )}
    </div>
  );

  // Transaction Details Step
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
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="email"
            placeholder="Buyer Email *"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="tel"
            placeholder="Buyer Phone *"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(e.target.value)}
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
            value={sellerName}
            onChange={(e) => setSellerName(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="email"
            placeholder="Seller Email *"
            value={sellerEmail}
            onChange={(e) => setSellerEmail(e.target.value)}
            className="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="tel"
            placeholder="Seller Phone *"
            value={sellerPhone}
            onChange={(e) => setSellerPhone(e.target.value)}
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
            <input
              type="number"
              placeholder="450000"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Expected Closing Date *</label>
            <input
              type="date"
              value={closingDate}
              onChange={(e) => setClosingDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      </div>
    </div>
  );

  // Package Payment Step
  const PackagePaymentStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Package Selection & Payment</h3>
        <p className="text-gray-600">Choose your processing speed and payment method</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          onClick={() => setPackageType('standard')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            packageType === 'standard' 
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
          onClick={() => setPackageType('rush')}
          className={`p-6 rounded-lg border-2 cursor-pointer transition-all ${
            packageType === 'rush' 
              ? 'border-orange-500 bg-orange-50' 
              : 'border-gray-200 hover:border-orange-300'
          }`}
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">Rush Processing</h4>
              <p className="text-sm text-gray-600">5 business days</p>
            </div>
            <div className="text-right">
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
              checked={paymentMethod === 'credit_card'}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-4 w-4 text-green-600"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Credit/Debit Card</span>
                <span className="text-sm text-gray-500">+ $9.95 convenience fee</span>
              </div>
            </div>
          </label>
          
          <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input
              type="radio"
              name="paymentMethod"
              value="ach"
              checked={paymentMethod === 'ach'}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="h-4 w-4 text-green-600"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Bank Transfer (ACH)</span>
                <span className="text-sm text-green-600">No convenience fee</span>
              </div>
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
            {packageType === 'rush' && (
              <div className="flex justify-between">
                <span>Rush Processing:</span>
                <span>+$70.66</span>
              </div>
            )}
            {paymentMethod === 'credit_card' && (
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

  // Review Submit Step
  const ReviewSubmitStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-green-900 mb-2">Review & Submit</h3>
        <p className="text-gray-600">Please review your information before submitting</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4">Property Information</h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">HOA:</span> {hoaProperty}</div>
            <div><span className="font-medium">Address:</span> {propertyAddress} {unitNumber}</div>
            <div><span className="font-medium">Sale Price:</span> ${salePrice ? Number(salePrice).toLocaleString() : 'N/A'}</div>
            <div><span className="font-medium">Closing Date:</span> {closingDate}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4">Submitter Information</h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Role:</span> {submitterType}</div>
            <div><span className="font-medium">Name:</span> {submitterName}</div>
            <div><span className="font-medium">Email:</span> {submitterEmail}</div>
            <div><span className="font-medium">Phone:</span> {submitterPhone}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4">Transaction Parties</h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Buyer:</span> {buyerName}</div>
            <div><span className="font-medium">Buyer Email:</span> {buyerEmail}</div>
            <div><span className="font-medium">Seller:</span> {sellerName}</div>
            <div><span className="font-medium">Seller Email:</span> {sellerEmail}</div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-4">Package & Payment</h4>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Package:</span> {packageType === 'rush' ? 'Rush (5 days)' : 'Standard (10-15 days)'}</div>
            <div><span className="font-medium">Payment Method:</span> {paymentMethod === 'credit_card' ? 'Credit Card' : 'Bank Transfer'}</div>
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
              <p>• Your resale certificate package will include all required documents</p>
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
            className="h-4 w-4 text-green-600 border-gray-300 rounded mt-1"
            required
          />
          <span className="ml-3 text-sm text-gray-700">
            I confirm that all information provided is accurate and complete. I understand that 
            Goodman Management Group will process this resale certificate application according to 
            Virginia state requirements.
          </span>
        </label>
      </div>
    </div>
  );

  const steps = [
    { number: 1, title: 'HOA Selection', icon: Building2 },
    { number: 2, title: 'Submitter Info', icon: User },
    { number: 3, title: 'Transaction Details', icon: Users },
    { number: 4, title: 'Package & Payment', icon: CreditCard },
    { number: 5, title: 'Review & Submit', icon: CheckCircle }
  ];

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return <HOASelectionStep />;
      case 2: return <SubmitterInfoStep />;
      case 3: return <TransactionDetailsStep />;
      case 4: return <PackagePaymentStep />;
      case 5: return <ReviewSubmitStep />;
      default: return isAdmin ? <Dashboard /> : <UserHomePage />;
    }
  };

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

  // Main application render
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
                    <span className="text-sm text-gray-600">Welcome, {user?.email}</span>
                    {isAdmin && (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Admin</span>
                    )}
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
          {renderStepContent()}
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
                {isAdmin ? 'Dashboard' : 'Home'}
              </button>
              {isAuthenticated && (
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-400 rounded-full"></div>
                  <span className="text-sm text-gray-600">{user?.email}</span>
                  {isAdmin && (
                    <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">Admin</span>
                  )}
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
            onClick={() => setCurrentStep(currentStep - 1)}
            disabled={currentStep === 1}
            className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          
          {currentStep < 5 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={
                (currentStep === 1 && (!hoaProperty || !propertyAddress)) ||
                (currentStep === 2 && (!submitterType || !submitterName || !submitterEmail)) ||
                (currentStep === 3 && (!buyerName || !sellerName || !salePrice)) ||
                (currentStep === 4 && !paymentMethod)
              }
              className="px-6 py-3 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Continue
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

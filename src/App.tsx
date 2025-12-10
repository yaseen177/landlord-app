// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  updateDoc,
  doc,
  deleteDoc,
  setDoc,
  getDoc,
  where,
  getDocs,
} from 'firebase/firestore';
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import {
  Home,
  Users,
  FileText,
  Settings,
  LogOut,
  Plus,
  PoundSterling,
  CheckCircle,
  AlertCircle,
  Mail,
  MapPin,
  ChevronRight,
  Shield,
  Database,
  Lock,
  ExternalLink,
  Trash2,
  Link as LinkIcon,
  Save,
  Cloud,
  XCircle,
  WifiOff,
  FolderOpen,
  Pencil,
  CheckSquare,
  Square,
  Calendar,
  Bell,
  Clock,
  Send,
  CreditCard,
  Phone,
  Filter,
  MoreHorizontal,
  Edit,
  Loader2,
  AlertTriangle,
  File,
  MessageSquare,
  Smartphone,
  User,
  FileCheck,
  Menu, // Added for mobile navigation
  Eye,
  EyeOff,
} from 'lucide-react';

/**
 * UTILITIES & CONFIG
 */

// YOUR FIREBASE CONFIGURATION (Embedded)
const firebaseConfig = {
  apiKey: 'AIzaSyB4EmBN9iokHgjaUtaBqu6wVcqK8s8PiG8',
  authDomain: 'landlord-56048.firebaseapp.com',
  projectId: 'landlord-56048',
  storageBucket: 'landlord-56048.firebasestorage.app',
  messagingSenderId: '130875363408',
  appId: '1:130875363408:web:4f943cf8d15a1e0e13c155',
  measurementId: 'G-HG27MSJH29',
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// Google Maps Key
const GOOGLE_MAPS_API_KEY = 'AIzaSyCv16EPYgt0DWWNv_EBdt6DYFgQCtovK-E';

// Default compliance documents (Fallback)
const DEFAULT_COMPLIANCE_TYPES = [
  { id: 'gas', name: 'Gas Safety Certificate', mandatory: true },
  { id: 'epc', name: 'Energy Performance Certificate (EPC)', mandatory: true },
  {
    id: 'eicr',
    name: 'Electrical Installation Condition Report',
    mandatory: true,
  },
  { id: 'insurance', name: 'Building Insurance', mandatory: false },
  { id: 'pat', name: 'PAT Testing', mandatory: false },
];

// Load Google Maps Script
const loadGoogleMaps = (callback) => {
  if (window.google && window.google.maps) {
    callback();
    return;
  }
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
  script.async = true;
  script.defer = true;
  script.onload = callback;
  document.head.appendChild(script);
};

// Load EmailJS Script (CDN Method) - Robust check
const loadEmailJS = (callback) => {
  if (window.emailjs) {
    callback();
    return;
  }
  if (document.querySelector('script[src*="emailjs"]')) {
    setTimeout(() => {
      if (window.emailjs) callback();
    }, 1000);
    return;
  }
  const script = document.createElement('script');
  script.src =
    'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
  script.async = true;
  script.onload = callback;
  document.head.appendChild(script);
};

// Helper to ensure links work (adds https:// if missing)
const ensureProtocol = (url) => {
  if (!url) return '';
  return url.trim().startsWith('http') ? url.trim() : `https://${url.trim()}`;
};

// --- NEW UTILITY: TENANT LOGGING ---
const logTenantActivity = async (db, tenant, action, details = '') => {
  try {
    // Attempt to fetch IP (fails gracefully if adblock/network blocks it)
    let ipAddress = 'Unknown';
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json');
      const ipData = await ipRes.json();
      ipAddress = ipData.ip;
    } catch (e) {
      console.warn('Could not fetch IP for log');
    }

    const logEntry = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      action: action, // e.g., 'Login', 'Logout', 'Viewed Payments'
      details: details,
      ipAddress: ipAddress,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
    };

    // Fire and forget - don't await this to keep UI snappy
    addDoc(collection(db, 'activity_logs'), logEntry).catch(e => console.error("Logging failed", e));
  } catch (err) {
    console.error('Error in logTenantActivity:', err);
  }
};

// Helper to calculate rent based on date
const getRentForDate = (tenant, date) => {
  if (!tenant.rentSchedule || tenant.rentSchedule.length === 0) {
    return tenant.rentAmount || 0;
  }

  // Sort schedule by start date (descending) to find the latest matching period
  const sortedSchedule = [...tenant.rentSchedule].sort(
    (a, b) => new Date(b.startDate) - new Date(a.startDate)
  );

  const target = new Date(date);

  for (let period of sortedSchedule) {
    const start = new Date(period.startDate);
    const end = period.endDate
      ? new Date(period.endDate)
      : new Date(9999, 11, 31); // Far future if no end date

    if (target >= start && target <= end) {
      return parseFloat(period.amount);
    }
  }

  // Fallback if date is before all schedules (return base amount)
  return tenant.rentAmount || 0;
};

// Helper to format phone for WhatsApp (Strip leading 0, add 44)
const formatPhoneForWhatsapp = (phone) => {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, ''); // remove non-digits
  if (cleaned.startsWith('0')) cleaned = '44' + cleaned.substring(1);
  if (cleaned.startsWith('44')) return cleaned;
  return '44' + cleaned; // Default to UK if ambiguous
};

// Helper: Get Last X Months for Dashboard
const getLastMonths = (count) => {
  const months = [];
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth(), 1);

  for (let i = 0; i < count; i++) {
    const d = new Date(current);
    d.setMonth(current.getMonth() - i);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return [...new Set(months)];
};

// --- COMPONENTS ---

const Alert = ({ children, type = 'info' }) => {
  const colors = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
  };
  return (
    <div
      className={`p-4 rounded-md border ${colors[type]} mb-4 flex items-start gap-2`}
    >
      {children}
    </div>
  );
};

const Button = ({
  children,
  onClick,
  variant = 'primary',
  className = '',
  type = 'button',
  disabled = false,
}) => {
  const baseStyle =
    'px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2';
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
    ghost: 'bg-transparent text-gray-600 hover:bg-gray-100',
    whatsapp: 'bg-[#25D366] text-white hover:bg-[#128C7E] shadow-sm',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant] || variants.primary} ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ children, title, action, className = '' }) => (
  <div
    className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}
  >
    {(title || action) && (
      <div className="px-6 py-4 border-b border-gray-50 flex flex-row justify-between items-center bg-gray-50/50 flex-wrap gap-2">
        {title && <h3 className="font-semibold text-gray-800">{title}</h3>}
        {action && <div>{action}</div>}
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

// --- MAIN APPLICATION ---

export default function App() {
  const [view, setView] = useState('auth');
  const [user, setUser] = useState(null); // Landlord User (Firebase Auth)
  const [tenantUser, setTenantUser] = useState(null); // Tenant User (Firestore Record)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false); // Mobile Menu State

  // Data State
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [payments, setPayments] = useState([]);
  const [complianceTypes, setComplianceTypes] = useState(
    DEFAULT_COMPLIANCE_TYPES
  );
  const [notifications, setNotifications] = useState([]);

  const [emailConfig, setEmailConfig] = useState({
    serviceId: 'service_6j035ej',
    paymentTemplateId: 'template_k3ievnc',
    reportTemplateId: 'template_78cg5ws',
    publicKey: 'msJZ6lDUCKAgkUf_h',
  });

  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [isOffline, setIsOffline] = useState(false);
  const [dbError, setDbError] = useState(null);

  // Auth State
  const [loginType, setLoginType] = useState('landlord'); // 'landlord' or 'tenant'
  const [loginError, setLoginError] = useState(''); // New state for login messages
  const [tempCreds, setTempCreds] = useState({ email: '', password: '' });

  // Calculate Notifications (Expired Docs) - Only relevant for Landlord
  useEffect(() => {
    if (!user) return; // Don't run for tenants
    const alerts = [];
    const today = new Date();

    properties.forEach((prop) => {
      if (!prop.compliance) return;
      prop.compliance.forEach((doc) => {
        if (doc.uploaded && doc.expiryDate) {
          const expiry = new Date(doc.expiryDate);
          const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

          if (daysUntil < 0) {
            alerts.push({
              type: 'expired',
              msg: `${doc.name} expired on ${expiry.toLocaleDateString()}`,
              propAddress: prop.address,
            });
          } else if (daysUntil <= 30) {
            alerts.push({
              type: 'warning',
              msg: `${doc.name} expires in ${daysUntil} days`,
              propAddress: prop.address,
            });
          }
        }
      });
    });
    setNotifications(alerts);
  }, [properties, user]);

  // --- NEW EFFECT: TRACK TENANT NAVIGATION ---
  useEffect(() => {
    if (tenantUser && view.startsWith('tenant_')) {
      const pageNames = {
        'tenant_dashboard': 'Dashboard',
        'tenant_payments': 'Payment History',
        'tenant_docs': 'Contracts & Documents'
      };
      const pageName = pageNames[view] || view;
      logTenantActivity(db, tenantUser, 'Navigation', `Accessed ${pageName} page`);
    }
  }, [view, tenantUser]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      // FIX: Only treat as landlord if NOT anonymous
      if (currentUser && !currentUser.isAnonymous) {
        setUser(currentUser);
        setView('dashboard');
      } else if (!currentUser && !tenantUser) {
        // If not anonymous (tenant) and not landlord -> Reset
        setUser(null);
        setView('auth');
      }
      // If currentUser.isAnonymous is true, we do nothing here,
      // letting handleLogin manage the tenantUser state and view transition.
    });
    return () => unsubscribe();
  }, [tenantUser]);


  useEffect(() => {
    // Only try to fetch from Firebase if we are Online
    if ((!user && !tenantUser) || isOffline) return;

    const handleError = (err) => {
      console.error('Firestore Error:', err);
      if (
        err.code === 'permission-denied' ||
        err.message.includes('permission-denied')
      ) {
        setIsOffline(true);
        setDbError('Database Locked (Permissions)');
      }
    };

    const unsubProps = onSnapshot(
      collection(db, 'properties'),
      (snap) =>
        setProperties(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      handleError
    );
    const unsubTenants = onSnapshot(
      collection(db, 'tenants'),
      (snap) => setTenants(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      handleError
    );
    const unsubPayments = onSnapshot(
      collection(db, 'payments'),
      (snap) => setPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      handleError
    );

    let unsubSettings = () => {};
    if (user) {
      unsubSettings = onSnapshot(
        doc(db, 'settings', 'globalConfig'),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.complianceTypes) setComplianceTypes(data.complianceTypes);
            if (data.emailConfig) setEmailConfig(data.emailConfig);
          }
        },
        (err) => {
          console.log('Settings fetch error:', err);
          if (err.code === 'permission-denied') handleError(err);
        }
      );
    }

    return () => {
      unsubProps();
      unsubTenants();
      unsubPayments();
      unsubSettings();
    };
  }, [user, tenantUser, isOffline]);

  // Wrapper function to switch to offline mode on write errors
  const handleWriteError = (err) => {
    console.error('Write Error:', err);
    if (
      err.code === 'permission-denied' ||
      err.message.includes('permission-denied')
    ) {
      setIsOffline(true);
      setDbError('Write Permission Denied - Offline Mode Active');
      alert(
        'Database permissions are restricted. Switched to Offline Mode to save your data locally.'
      );
    } else {
      alert('Operation failed: ' + err.message);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    if (loginType === 'landlord') {
      try {
        await signInWithEmailAndPassword(
          auth,
          tempCreds.email,
          tempCreds.password
        );
        // Login handled by auth listener
      } catch (error) {
        console.error(error);
        let msg = 'Login failed. Please check your credentials.';
        if (
          error.code === 'auth/invalid-credential' ||
          error.code === 'auth/user-not-found' ||
          error.code === 'auth/wrong-password'
        ) {
          msg = 'Invalid email or password. Please try again.';
        }
        setLoginError(msg);
      }
    } else {
      try {
        // STEP 1: Anonymous Login (The fix for permission-denied)
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }

        const tenantsRef = collection(db, 'tenants');
        const q = query(tenantsRef, where('email', '==', tempCreds.email));

        let querySnapshot;
        try {
          querySnapshot = await getDocs(q);
        } catch (err) {
          handleWriteError(err);
          return;
        }

        if (querySnapshot.empty) {
          setLoginError('No tenant found with this email address.');
          return;
        }

        let foundTenant = null;
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          if (data.password === tempCreds.password) {
            foundTenant = { id: doc.id, ...data };
          }
        });

        if (foundTenant) {
          logTenantActivity(db, foundTenant,'Login','Successful login to Tenant Portal');
          setTenantUser(foundTenant);
          setUser(null);
          setView('tenant_dashboard');
        } else {
          setLoginError('Incorrect password. Please try again.');
        }
      } catch (error) {
        console.error(error);
        setLoginError('System error during login. Please try again.');
      }
    }
  };

  const handleLogout = async () => {
    if(tenantUser){
      logTenantActivity(db, tenantUser,'Logout','User clicked Sign Out');
    }
    if (user || auth.currentUser) await signOut(auth);
    setUser(null);
    setTenantUser(null);
    setView('auth');
    setTempCreds({ email: '', password: '' });
    setLoginError('');
    setDbError(null);
    setIsOffline(false);
  };

  const updateComplianceSettings = async (newTypes) => {
    setComplianceTypes(newTypes);
    if (!isOffline) {
      try {
        await setDoc(
          doc(db, 'settings', 'globalConfig'),
          { complianceTypes: newTypes },
          { merge: true }
        );
      } catch (e) {
        handleWriteError(e);
      }
    }
  };

  const updateEmailSettings = async (newConfig) => {
    setEmailConfig(newConfig);
    if (!isOffline) {
      try {
        await setDoc(
          doc(db, 'settings', 'globalConfig'),
          { emailConfig: newConfig },
          { merge: true }
        );
      } catch (e) {
        handleWriteError(e);
      }
    }
  };

  if (view === 'auth') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-indigo-700 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg ring-4 ring-indigo-100">
              {loginType === 'landlord' ? (
                <Shield className="text-white w-8 h-8" />
              ) : (
                <User className="text-white w-8 h-8" />
              )}
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {loginType === 'landlord' ? 'Landlord Portal' : 'Tenant Portal'}
            </h1>
            <p className="text-gray-500 mt-1">
              {loginType === 'landlord'
                ? 'Secure Property Management'
                : 'View your tenancy details'}
            </p>
          </div>

          <Card className="shadow-xl border-t-4 border-indigo-600">
            {/* LOGIN TYPE TOGGLE */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
              <button
                onClick={() => {
                  setLoginType('landlord');
                  setLoginError('');
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  loginType === 'landlord'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Landlord Login
              </button>
              <button
                onClick={() => {
                  setLoginType('tenant');
                  setLoginError('');
                }}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                  loginType === 'tenant'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Tenant Login
              </button>
            </div>

            {loginError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0" />
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  className="w-full p-3 border rounded-lg"
                  value={tempCreds.email}
                  onChange={(e) =>
                    setTempCreds({ ...tempCreds, email: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  className="w-full p-3 border rounded-lg"
                  value={tempCreds.password}
                  onChange={(e) =>
                    setTempCreds({ ...tempCreds, password: e.target.value })
                  }
                  required
                />
              </div>
              <Button type="submit" className="w-full py-3">
                Login
              </Button>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // --- TENANT PORTAL VIEW ---
  if (tenantUser) {
    // Find fresh tenant data to ensure updates are reflected
    const liveTenantData =
      tenants.find((t) => t.id === tenantUser.id) || tenantUser;
    const tenantPayments = payments
      .filter((p) => p.tenantId === tenantUser.id)
      .sort((a, b) => new Date(b.dateReceived) - new Date(a.dateReceived));
    const myProperty = properties.find(
      (p) => p.id === liveTenantData.propertyId
    );

    // Rent Due Calculation
    const today = new Date();
    let nextDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const diffTime = nextDueDate - today;
    const daysDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return (
      <div className="min-h-screen bg-gray-50 flex font-sans relative">
         {/* Mobile Menu Overlay */}
         {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Responsive Sidebar */}
        <div 
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="p-6 border-b border-gray-100 flex justify-between items-center">
            <h2 className="text-xl font-bold text-indigo-800 flex items-center gap-2">
              <Home className="w-6 h-6" /> Tenant Portal
            </h2>
            <button 
              className="md:hidden text-gray-500"
              onClick={() => setMobileMenuOpen(false)}
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            <NavItem
              icon={<Home />}
              label="My Dashboard"
              active={view === 'tenant_dashboard'}
              onClick={() => { setView('tenant_dashboard'); setMobileMenuOpen(false); }}
            />
            <NavItem
              icon={<PoundSterling />}
              label="Payment History"
              active={view === 'tenant_payments'}
              onClick={() => { setView('tenant_payments'); setMobileMenuOpen(false); }}
            />
            <NavItem
              icon={<FileText />}
              label="My Contracts"
              active={view === 'tenant_docs'}
              onClick={() => { setView('tenant_docs'); setMobileMenuOpen(false); }}
            />
          </nav>
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3 mb-4 px-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                {liveTenantData.name.charAt(0)}
              </div>
              <div className="text-sm overflow-hidden">
                <div className="font-medium text-gray-900 truncate">
                  {liveTenantData.name}
                </div>
                <div className="text-gray-500 text-xs truncate">
                  {liveTenantData.email}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-red-600"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </Button>
          </div>
          <div className="mt-8 pt-8 border-t border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Property Documents</h2>
              <div className="grid gap-4">
                {myProperty?.compliance?.filter((d) => d.visibleToTenant && d.uploaded).map((doc, idx) => (
                    <Card key={idx}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center gap-3">
                          <div className="bg-green-100 p-2 rounded-lg text-green-600">
                            <Shield className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">{doc.name}</h3>
                            <p className="text-xs text-gray-500">
                              Expires: {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : 'N/A'}
                            </p>
                          </div>
                        </div>
                        <a
                          href={doc.link}
                          target="_blank"
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2 w-full sm:w-auto justify-center"
                        >
                          <ExternalLink className="w-4 h-4" /> View
                        </a>
                      </div>
                    </Card>
                  ))}
                
                {(!myProperty?.compliance?.some((d) => d.visibleToTenant && d.uploaded)) && (
                  <p className="text-gray-400 italic text-sm">No additional property documents available.</p>
                )}
              </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col h-screen overflow-hidden">
          {/* Mobile Header */}
          <header className="md:hidden bg-white p-4 border-b flex justify-between items-center shadow-sm z-20">
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)}>
                <Menu className="w-6 h-6 text-gray-700" />
              </button>
              <span className="font-bold text-indigo-800">Tenant Portal</span>
            </div>
            <button onClick={handleLogout}>
              <LogOut className="w-5 h-5 text-gray-600" />
            </button>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-8">
            {view === 'tenant_dashboard' && (
              <div className="max-w-4xl mx-auto space-y-6">
                {/* WELCOME CARD */}
                <div className="bg-indigo-600 rounded-xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden">
                  <div className="relative z-10">
                    <h1 className="text-2xl font-bold mb-2">
                      Welcome back, {liveTenantData.name}
                    </h1>
                    <p className="opacity-90">
                      Current Property:{' '}
                      {myProperty ? myProperty.address : 'Loading...'}
                    </p>
                    <div className="mt-6 flex flex-col sm:flex-row gap-4">
                      <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm flex-1">
                        <p className="text-xs uppercase font-bold opacity-75">
                          Monthly Rent
                        </p>
                        <p className="text-2xl font-bold">
                          £{getRentForDate(liveTenantData, new Date())}
                        </p>
                      </div>
                      <div className="bg-white/20 p-4 rounded-lg backdrop-blur-sm flex-1">
                        <p className="text-xs uppercase font-bold opacity-75">
                          Next Payment In
                        </p>
                        <p className="text-2xl font-bold">{daysDue} Days</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* RENT STATUS DASHBOARD (VISUAL) */}
                <Card title="Payment Status">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {getLastMonths(3).map((monthStr) => {
                      const [year, month] = monthStr.split('-').map(Number);
                      const start = new Date(year, month - 1, 1);
                      const label = start.toLocaleString('default', {
                        month: 'long',
                        year: 'numeric',
                      });

                      // Calculate status for this month
                      const monthPayments = tenantPayments.filter(
                        (p) => p.targetMonth === monthStr
                      );
                      const paid = monthPayments.reduce(
                        (sum, p) => sum + p.amount,
                        0
                      );
                      // Check rent for the 15th of that month to handle scheduled changes
                      const checkDate = new Date(year, month - 1, 15);
                      const due = getRentForDate(liveTenantData, checkDate);
                      const remaining = Math.max(0, due - paid);

                      let status = 'unpaid';
                      if (paid >= due) status = 'paid';
                      else if (paid > 0) status = 'partial';

                      const statusColors = {
                        paid: 'bg-green-50 border-green-200 text-green-700',
                        partial: 'bg-amber-50 border-amber-200 text-amber-700',
                        unpaid: 'bg-white border-gray-200 text-gray-500',
                      };

                      return (
                        <div
                          key={monthStr}
                          className={`p-3 rounded-lg border ${statusColors[status]} relative overflow-hidden`}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-xs font-bold uppercase">
                              {label}
                            </span>
                            {status === 'paid' && (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex justify-between text-sm font-medium mb-1">
                              <span>£{paid}</span>
                              <span className="text-gray-400">/ £{due}</span>
                            </div>
                            <div className="w-full bg-gray-200/50 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${
                                  status === 'paid'
                                    ? 'bg-green-500'
                                    : 'bg-amber-500'
                                }`}
                                style={{
                                  width: `${Math.min(
                                    100,
                                    (paid / due) * 100
                                  )}%`,
                                }}
                              ></div>
                            </div>
                            {remaining > 0 && (
                              <p className="text-xs mt-2 text-right font-medium">
                                Due: £{remaining}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                <h2 className="text-lg font-bold text-gray-800">
                  Recent Activity
                </h2>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {tenantPayments.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="p-4 border-b border-gray-50 flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full text-green-600">
                          <CheckCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            Payment Received
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(p.dateReceived).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className="font-bold">£{p.amount}</span>
                    </div>
                  ))}
                  {tenantPayments.length === 0 && (
                    <p className="p-6 text-center text-gray-400">
                      No recent activity.
                    </p>
                  )}
                </div>
              </div>
            )}

            {view === 'tenant_payments' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  Payment History
                </h1>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[500px]">
                      <thead className="bg-gray-50 text-gray-500 font-medium">
                        <tr>
                          <th className="p-3">Date</th>
                          <th className="p-3">Period</th>
                          <th className="p-3">Method</th>
                          <th className="p-3 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {tenantPayments.map((p) => (
                          <tr key={p.id} className="hover:bg-gray-50 text-gray-700">
                            <td className="p-3">
                              {new Date(p.dateReceived).toLocaleDateString()}
                            </td>
                            <td className="p-3">{p.targetMonth}</td>
                            <td className="p-3">{p.type}</td>
                            <td className="p-3 text-right font-bold text-gray-900">
                              £{p.amount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tenantPayments.length === 0 && (
                    <p className="p-6 text-center text-gray-400">
                      No payments found.
                    </p>
                  )}
                </Card>
              </div>
            )}

            {view === 'tenant_docs' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-2xl font-bold text-gray-900">
                  My Contracts
                </h1>
                <Alert type="info">
                  Only contracts and tenancy agreements are shown here.
                </Alert>
                <div className="grid gap-4">
                  {liveTenantData.documents
                    ?.filter((d) => d.type === 'Contract')
                    .map((doc, idx) => (
                      <Card key={idx}>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                              <FileCheck className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-gray-900">
                                Tenancy Agreement / Contract
                              </h3>
                              <p className="text-xs text-gray-500">
                                Added:{' '}
                                {new Date(doc.dateAdded).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <a
                            href={doc.link}
                            target="_blank"
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2 w-full sm:w-auto justify-center"
                          >
                            <ExternalLink className="w-4 h-4" /> View
                          </a>
                        </div>
                      </Card>
                    ))}
                  {!liveTenantData.documents?.some(
                    (d) => d.type === 'Contract'
                  ) && (
                    <div className="text-center py-12 bg-white rounded-xl border border-dashed">
                      <File className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">
                        No contracts uploaded yet.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    );
  }

  // --- LANDLORD PORTAL (Normal View) ---
  return (
    <div className="min-h-screen bg-gray-50 flex font-sans relative">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Responsive Sidebar */}
      <div 
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm transition-transform duration-300 ease-in-out md:translate-x-0 md:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-indigo-800 flex items-center gap-2">
            <Home className="w-6 h-6" /> PropManager
          </h2>
          <button 
            className="md:hidden text-gray-500"
            onClick={() => setMobileMenuOpen(false)}
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavItem
            icon={<Home />}
            label="Properties"
            active={view === 'dashboard'}
            onClick={() => {
              setView('dashboard');
              setSelectedPropertyId(null);
              setMobileMenuOpen(false);
            }}
          />
          <NavItem
            icon={<Users />}
            label="Tenants"
            active={view === 'tenants_global'}
            onClick={() => { setView('tenants_global'); setMobileMenuOpen(false); }}
          />
          <NavItem
            icon={<PoundSterling />}
            label="Payments"
            active={view === 'payments_global'}
            onClick={() => { setView('payments_global'); setMobileMenuOpen(false); }}
          />
          <NavItem
            icon={<Bell />}
            label="Notifications"
            active={view === 'notifications'}
            onClick={() => { setView('notifications'); setMobileMenuOpen(false); }}
            badge={notifications.length}
          />
          <NavItem
            icon={<Settings />}
            label="Settings"
            active={view === 'settings'}
            onClick={() => { setView('settings'); setMobileMenuOpen(false); }}
          />
          <NavItem
            icon={<FileText/>}
            label="Tenant Logs"
            active={view === 'activity_logs'}
            onClick={() => { setView('activity_logs'); setMobileMenuOpen(false);}}
          />
        </nav>
        <div className="p-4 border-t border-gray-100">
          <Button
            variant="ghost"
            className="w-full justify-start text-red-600"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white p-4 border-b flex justify-between items-center shadow-sm z-20">
          <div className="flex items-center gap-3">
             <button onClick={() => setMobileMenuOpen(true)}>
                <Menu className="w-6 h-6 text-gray-700" />
             </button>
             <span className="font-bold text-indigo-800">PropManager</span>
          </div>
          <button onClick={handleLogout}>
            <LogOut className="w-5 h-5 text-gray-600" />
          </button>
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-8 relative">
          {isOffline && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6 shadow-sm">
              <div className="flex">
                <div className="flex-shrink-0">
                  <WifiOff className="h-5 w-5 text-amber-500" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-amber-700 font-bold">
                    Offline Mode Active
                  </p>
                  <p className="text-xs text-amber-600 mt-1 mb-2">
                    Your database connection is limited. Data is saved to your
                    device temporarily.
                  </p>
                </div>
              </div>
            </div>
          )}

          {view === 'dashboard' && !selectedPropertyId && (
            <Dashboard
              properties={properties}
              onSelectProperty={(id) => {
                setSelectedPropertyId(id);
                setView('property');
              }}
              db={db}
              isOffline={isOffline}
              setProperties={setProperties}
              complianceTypes={complianceTypes}
            />
          )}
          {view === 'property' && selectedPropertyId && (
            <PropertyDetail
              property={properties.find((p) => p.id === selectedPropertyId)}
              tenants={tenants.filter(
                (t) => t.propertyId === selectedPropertyId
              )}
              payments={payments}
              onBack={() => {
                setView('dashboard');
                setSelectedPropertyId(null);
              }}
              db={db}
              isOffline={isOffline}
              setProperties={setProperties}
              setTenants={setTenants}
              setPayments={setPayments}
              emailConfig={emailConfig}
            />
          )}
          {view === 'settings' && (
            <SettingsPage
              complianceTypes={complianceTypes}
              onUpdateCompliance={updateComplianceSettings}
              emailConfig={emailConfig}
              onUpdateEmail={updateEmailSettings}
            />
          )}
          {view === 'notifications' && (
            <NotificationsPage
              notifications={notifications}
              userEmail={user?.email}
              emailConfig={emailConfig}
            />
          )}
          {view === 'payments_global' && (
            <GlobalPaymentsPage
              payments={payments}
              tenants={tenants}
              properties={properties}
              db={db}
              isOffline={isOffline}
              setPayments={setPayments}
            />
          )}
          {view === 'tenants_global' && (
            <TenantsPage
              tenants={tenants}
              properties={properties}
              db={db}
              isOffline={isOffline}
              setTenants={setTenants}
            />
          )}
          {view === 'activity_logs' && (
            <ActivityLogsPage db={db} tenants={tenants} />
          )}
        </main>
      </div>
    </div>
  );
}

// ... existing NavItem ...
const NavItem = ({ icon, label, active, onClick, badge }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium ${
      active ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
    }`}
  >
    <div className="flex items-center gap-3">
      {React.cloneElement(icon, { className: 'w-5 h-5' })}
      {label}
    </div>
    {badge > 0 && (
      <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
        {badge}
      </span>
    )}
  </button>
);

// ... existing TenantsPage ...
const TenantsPage = ({ tenants, properties, db, isOffline, setTenants }) => {
  const [editingTenant, setEditingTenant] = useState(null);

  const handleUpdate = async (updatedTenant) => {
    try {
      if (isOffline) {
        setTenants((prev) =>
          prev.map((t) => (t.id === updatedTenant.id ? updatedTenant : t))
        );
      } else {
        await updateDoc(doc(db, 'tenants', updatedTenant.id), updatedTenant);
      }
      setEditingTenant(null);
    } catch (err) {
      if (err.code === 'permission-denied') {
        alert('Permission denied. Switching to offline mode.');
        setTenants((prev) =>
          prev.map((t) => (t.id === updatedTenant.id ? updatedTenant : t))
        );
        setEditingTenant(null);
      }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Tenant Management</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tenants.map((tenant) => {
          const property = properties.find((p) => p.id === tenant.propertyId);
          return (
            <Card key={tenant.id} className="relative">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
                    {tenant.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {tenant.name}
                    </h3>
                    <p className="text-xs text-gray-500 truncate max-w-[150px]">
                      {property ? property.address : 'No Property Assigned'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingTenant(tenant)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" /> {tenant.email}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />{' '}
                  {tenant.phone || 'No phone'}
                </div>
                <div className="flex items-center gap-2">
                  <PoundSterling className="w-4 h-4 text-gray-400" /> £
                  {tenant.rentAmount} / month
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {editingTenant && (
        <TenantEditModal
          tenant={editingTenant}
          onClose={() => setEditingTenant(null)}
          onSave={handleUpdate}
        />
      )}
    </div>
  );
};

// ... existing TenantEditModal ...
const TenantEditModal = ({ tenant, onClose, onSave }) => {
  const [formData, setFormData] = useState(tenant);
  const [activeTab, setActiveTab] = useState('details'); // details, schedule, docs
  const [scheduleItem, setScheduleItem] = useState({
    startDate: '',
    endDate: '',
    amount: '',
  });
  const [docLink, setDocLink] = useState('');

  const handleSave = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const addScheduleItem = () => {
    if (!scheduleItem.startDate || !scheduleItem.amount) return;
    const newSchedule = [...(formData.rentSchedule || []), scheduleItem];
    setFormData({ ...formData, rentSchedule: newSchedule });
    setScheduleItem({ startDate: '', endDate: '', amount: '' });
  };

  const removeScheduleItem = (index) => {
    const newSchedule = [...(formData.rentSchedule || [])];
    newSchedule.splice(index, 1);
    setFormData({ ...formData, rentSchedule: newSchedule });
  };

  const addDocument = (type) => {
    if (!docLink) return;
    const newDoc = {
      type,
      link: ensureProtocol(docLink),
      dateAdded: new Date().toISOString(),
    };
    const newDocs = [...(formData.documents || []), newDoc];
    setFormData({ ...formData, documents: newDocs });
    setDocLink('');
  };

  const removeDocument = (index) => {
    const newDocs = [...(formData.documents || [])];
    newDocs.splice(index, 1);
    setFormData({ ...formData, documents: newDocs });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col mx-4">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-bold text-lg">Edit Tenant: {tenant.name}</h2>
          <button onClick={onClose}>
            <XCircle className="w-5 h-5 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <div className="flex border-b overflow-x-auto">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 p-3 text-sm font-medium whitespace-nowrap ${
              activeTab === 'details'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex-1 p-3 text-sm font-medium whitespace-nowrap ${
              activeTab === 'schedule'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Rent Schedule
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`flex-1 p-3 text-sm font-medium whitespace-nowrap ${
              activeTab === 'docs'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500'
            }`}
          >
            Documents
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Full Name
                  </label>
                  <input
                    className="w-full p-2 border rounded"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Email
                  </label>
                  <input
                    className="w-full p-2 border rounded"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Phone
                  </label>
                  <input
                    className="w-full p-2 border rounded"
                    value={formData.phone || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">
                    Portal Password
                  </label>
                  <input
                    className="w-full p-2 border rounded"
                    type="password"
                    placeholder="Set Password"
                    value={formData.password || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">
                  Default Rent (£)
                </label>
                <input
                  className="w-full p-2 border rounded"
                  type="number"
                  value={formData.rentAmount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rentAmount: parseFloat(e.target.value),
                    })
                  }
                />
                <p className="text-xs text-gray-400 mt-1">
                  Used if no specific schedule matches current date.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <Alert type="info">
                <p className="text-xs">
                  Define rent amounts for specific date ranges (e.g. contracts).
                  If a date matches, this amount overrides the default.
                </p>
              </Alert>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end bg-gray-50 p-3 rounded-lg border border-gray-100">
                <div className="flex-1">
                  <label className="text-xs">Start Date</label>
                  <input
                    type="date"
                    className="w-full p-1 border rounded"
                    value={scheduleItem.startDate}
                    onChange={(e) =>
                      setScheduleItem({
                        ...scheduleItem,
                        startDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs">End Date (Optional)</label>
                  <input
                    type="date"
                    className="w-full p-1 border rounded"
                    value={scheduleItem.endDate}
                    onChange={(e) =>
                      setScheduleItem({
                        ...scheduleItem,
                        endDate: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="w-full sm:w-24">
                  <label className="text-xs">Amount (£)</label>
                  <input
                    type="number"
                    className="w-full p-1 border rounded"
                    value={scheduleItem.amount}
                    onChange={(e) =>
                      setScheduleItem({
                        ...scheduleItem,
                        amount: e.target.value,
                      })
                    }
                  />
                </div>
                <Button size="sm" onClick={addScheduleItem} className="w-full sm:w-auto mt-2 sm:mt-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-2">
                {formData.rentSchedule?.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-2 border rounded bg-white text-sm"
                  >
                    <div>
                      <span className="font-bold">£{item.amount}</span>
                      <span className="text-gray-500 mx-2">|</span>
                      {new Date(item.startDate).toLocaleDateString()} —{' '}
                      {item.endDate
                        ? new Date(item.endDate).toLocaleDateString()
                        : 'Ongoing'}
                    </div>
                    <button
                      onClick={() => removeScheduleItem(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'docs' && (
            <div className="space-y-6">
              {['ID', 'Contract'].map((type) => (
                <div key={type}>
                  <h4 className="text-sm font-bold text-gray-700 mb-2">
                    {type === 'ID'
                      ? 'Identification Documents'
                      : 'Contracts & Agreements'}
                  </h4>
                  <div className="space-y-2 mb-3">
                    {formData.documents
                      ?.filter((d) => d.type === type)
                      .map((doc, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center p-2 border rounded bg-gray-50 text-sm"
                        >
                          <a
                            href={doc.link}
                            target="_blank"
                            className="text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3" /> View Document
                          </a>
                          <button
                            onClick={() => {
                              const allDocs = [...(formData.documents || [])];
                              const realIndex = allDocs.findIndex(
                                (d) => d === doc
                              );
                              removeDocument(realIndex);
                            }}
                            className="text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    {!formData.documents?.some((d) => d.type === type) && (
                      <p className="text-xs text-gray-400 italic">
                        No documents uploaded.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 p-2 border rounded text-sm w-full"
                      placeholder={`Paste ${type} Link (OneDrive/Google Drive)...`}
                      value={docLink}
                      onChange={(e) => setDocLink(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() => addDocument(type)}
                      disabled={!docLink}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
};

// ... existing GlobalPaymentsPage ...
const GlobalPaymentsPage = ({
  payments,
  tenants,
  properties,
  db,
  isOffline,
  setPayments,
}) => {
  const [filterProp, setFilterProp] = useState('all');
  const [filterRange, setFilterRange] = useState('6months');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Deletion State
  const [deletingId, setDeletingId] = useState(null);

  const filteredPayments = useMemo(() => {
    let filtered = [...payments];
    const now = new Date();

    if (filterProp !== 'all') {
      const tenantIds = tenants
        .filter((t) => t.propertyId === filterProp)
        .map((t) => t.id);
      filtered = filtered.filter((p) => tenantIds.includes(p.tenantId));
    }

    if (filterRange !== 'all') {
      let limitDate = new Date();
      if (filterRange === '3months') limitDate.setMonth(now.getMonth() - 3);
      if (filterRange === '6months') limitDate.setMonth(now.getMonth() - 6);
      if (filterRange === '1year') limitDate.setFullYear(now.getFullYear() - 1);

      if (filterRange === 'custom') {
        if (customStart && customEnd) {
          filtered = filtered.filter((p) => {
            const d = new Date(p.dateReceived);
            return d >= new Date(customStart) && d <= new Date(customEnd);
          });
        }
      } else {
        filtered = filtered.filter(
          (p) => new Date(p.dateReceived) >= limitDate
        );
      }
    }

    return filtered.sort(
      (a, b) => new Date(b.dateReceived) - new Date(a.dateReceived)
    );
  }, [payments, tenants, filterProp, filterRange, customStart, customEnd]);

  const handleDelete = async (paymentId) => {
    setDeletingId(paymentId);
    try {
      if (isOffline) {
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      } else {
        await deleteDoc(doc(db, 'payments', paymentId));
      }
    } catch (err) {
      if (err.code === 'permission-denied') {
        alert('Permission Denied: Switching to Offline Mode.');
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      } else {
        alert('Error deleting payment: ' + err.message);
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900">All Payments</h1>

      {/* Filters */}
      <Card className="bg-white">
        <div className="flex flex-col md:flex-row flex-wrap gap-4 items-start md:items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Filter by Property
            </label>
            <select
              className="p-2 border rounded-lg text-sm w-full md:w-48"
              value={filterProp}
              onChange={(e) => setFilterProp(e.target.value)}
            >
              <option value="all">All Properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Date Range
            </label>
            <select
              className="p-2 border rounded-lg text-sm w-full md:w-48"
              value={filterRange}
              onChange={(e) => setFilterRange(e.target.value)}
            >
              <option value="3months">Last 3 Months</option>
              <option value="6months">Last 6 Months</option>
              <option value="1year">Last Year</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {filterRange === 'custom' && (
            <div className="flex gap-2 w-full md:w-auto">
              <div className="flex-1 md:flex-none">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  className="p-2 border rounded-lg text-sm w-full"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="flex-1 md:flex-none">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  className="p-2 border rounded-lg text-sm w-full"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
              <tr>
                <th className="p-4">Date Received</th>
                <th className="p-4">Tenant</th>
                <th className="p-4">Period</th>
                <th className="p-4">Method</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredPayments.map((p) => {
                const tenant = tenants.find((t) => t.id === p.tenantId);
                const tenantName = tenant ? tenant.name : 'Unknown';
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      {new Date(p.dateReceived).toLocaleDateString()}
                    </td>
                    <td className="p-4 font-medium text-gray-900">
                      {tenantName}
                    </td>
                    <td className="p-4 text-gray-500">{p.targetMonth}</td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          p.type === 'Cash'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-gray-900">
                      £{p.amount}
                    </td>
                    <td className="p-4 text-right">
                      {deletingId === p.id ? (
                        <span className="text-red-500 text-xs font-bold animate-pulse">
                          Deleting...
                        </span>
                      ) : (
                        <DeleteButton onDelete={() => handleDelete(p.id)} />
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="p-8 text-center text-gray-400 italic"
                  >
                    No payments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ... (NotificationsPage and SettingsPage components remain the same) ...
const NotificationsPage = ({ notifications, userEmail, emailConfig }) => {
  const [sending, setSending] = useState(false);

  const handleEmailReport = async () => {
    const subject = 'Compliance Document Expiry Report';
    const body = `Here is your compliance document status report:\n\n${notifications
      .map((n) => `- [${n.type.toUpperCase()}] ${n.propAddress}: ${n.msg}`)
      .join('\n')}`;

    // CHECK: Do we have EmailJS keys?
    if (
      emailConfig.serviceId &&
      emailConfig.reportTemplateId &&
      emailConfig.publicKey
    ) {
      setSending(true);

      loadEmailJS(async () => {
        try {
          await window.emailjs.send(
            emailConfig.serviceId,
            emailConfig.reportTemplateId,
            {
              to_email: userEmail,
              subject: subject,
              message: body,
            },
            emailConfig.publicKey
          );
          alert('Report sent successfully via Outlook!');
        } catch (error) {
          console.error(error);
          alert(
            'Failed to send via EmailJS. Please check your API keys in Settings.'
          );
        } finally {
          setSending(false);
        }
      });
    } else {
      // Fallback to Mailto
      window.location.href = `mailto:${userEmail}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <Button
          onClick={handleEmailReport}
          disabled={notifications.length === 0 || sending}
        >
          <Mail className="w-4 h-4" />
          {sending
            ? 'Sending...'
            : emailConfig.serviceId
            ? 'Send via Outlook'
            : 'Draft in Mail App'}
        </Button>
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-200">
          <CheckCircle className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-gray-500">All documents are up to date!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border flex items-start gap-3 ${
                n.type === 'expired'
                  ? 'bg-red-50 border-red-100'
                  : 'bg-amber-50 border-amber-100'
              }`}
            >
              {n.type === 'expired' ? (
                <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              ) : (
                <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div>
                <h4
                  className={`font-semibold ${
                    n.type === 'expired' ? 'text-red-800' : 'text-amber-800'
                  }`}
                >
                  {n.msg}
                </h4>
                <p className="text-sm text-gray-600 mt-1">{n.propAddress}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ... (Dashboard component remains the same) ...
const Dashboard = ({
  properties,
  onSelectProperty,
  db,
  isOffline,
  setProperties,
  complianceTypes,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newPropAddress, setNewPropAddress] = useState('');
  const addressInputRef = useRef(null);

  useEffect(() => {
    if (isAdding)
      loadGoogleMaps(() => {
        if (!addressInputRef.current) return;
        const autocomplete = new google.maps.places.Autocomplete(
          addressInputRef.current,
          { types: ['address'], componentRestrictions: { country: 'uk' } }
        );
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (place.formatted_address)
            setNewPropAddress(place.formatted_address);
        });
      });
  }, [isAdding]);

  const addProperty = async (e) => {
    e.preventDefault();
    if (!newPropAddress) return;

    const newProp = {
      address: newPropAddress,
      createdAt: new Date().toISOString(),
      folderLink: '',
      compliance: complianceTypes.map((c) => ({
        ...c,
        uploaded: false,
        link: '',
        expiryDate: '',
      })),
    };

    if (isOffline) {
      setProperties((prev) => [
        ...prev,
        { id: 'local-' + Date.now(), ...newProp },
      ]);
    } else {
      await addDoc(collection(db, 'properties'), newProp);
    }

    setNewPropAddress('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Your Properties</h1>
        <Button onClick={() => setIsAdding(true)}>
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Add Property</span><span className="sm:hidden">Add</span>
        </Button>
      </div>
      {isAdding && (
        <Card>
          <form onSubmit={addProperty} className="flex flex-col sm:flex-row gap-4 sm:items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">
                Search Property Address
              </label>
              <input
                ref={addressInputRef}
                type="text"
                className="w-full p-2 border rounded-md"
                placeholder="Start typing address..."
                value={newPropAddress}
                onChange={(e) => setNewPropAddress(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
               <Button type="submit" className="flex-1 sm:flex-none">Save</Button>
               <Button variant="ghost" onClick={() => setIsAdding(false)} className="flex-1 sm:flex-none">
                Cancel
               </Button>
            </div>
          </form>
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {properties.map((prop) => (
          <div
            key={prop.id}
            onClick={() => onSelectProperty(prop.id)}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md cursor-pointer"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="bg-indigo-50 p-3 rounded-lg text-indigo-600">
                <Home className="w-6 h-6" />
              </div>
              <ChevronRight className="text-gray-300" />
            </div>
            <h3 className="font-semibold text-gray-900 truncate">
              {prop.address}
            </h3>
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-4 h-4" /> <span>View Details</span>
            </div>
          </div>
        ))}
        {properties.length === 0 && !isAdding && (
          <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
            No properties yet. Click "Add Property" to start.
          </div>
        )}
      </div>
    </div>
  );
};

const PropertyDetail = ({
  property,
  tenants,
  payments,
  onBack,
  db,
  isOffline,
  setTenants,
  setPayments,
  setProperties,
  emailConfig,
}) => {
  const [activeTab, setActiveTab] = useState('tenants');
  const [showAddTenant, setShowAddTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);

  const [newTenant, setNewTenant] = useState({
    name: '',
    email: '',
    phone: '',
    rentAmount: '',
  });

  // Link Management State
  const [editingDocId, setEditingDocId] = useState(null);
  const [tempLink, setTempLink] = useState('');
  const [tempExpiry, setTempExpiry] = useState('');

  // Property Folder Link State
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [tempFolderLink, setTempFolderLink] = useState(
    property.folderLink || ''
  );

  const handleDeleteProperty = async () => {
    if (!confirm("Are you sure you want to delete this property? This action cannot be undone.")) return;

    try {
      if (isOffline) {
         setProperties(prev => prev.filter(p => p.id !== property.id));
      } else {
         await deleteDoc(doc(db, 'properties', property.id));
      }
      onBack();
    } catch (error) {
       console.error(error);
       alert("Error deleting property: " + error.message);
    }
  };

  const handleAddTenant = async (e) => {
    e.preventDefault();
    const data = {
      ...newTenant,
      propertyId: property.id,
      rentAmount: parseFloat(newTenant.rentAmount),
    };

    if (isOffline) {
      setTenants((prev) => [...prev, { id: 'local-t-' + Date.now(), ...data }]);
    } else {
      await addDoc(collection(db, 'tenants'), data);
    }

    setShowAddTenant(false);
    setNewTenant({ name: '', email: '', phone: '', rentAmount: '' });
  };

  const handleUpdateTenant = async (updatedTenant) => {
    if (isOffline) {
      setTenants((prev) =>
        prev.map((t) => (t.id === updatedTenant.id ? updatedTenant : t))
      );
    } else {
      await updateDoc(doc(db, 'tenants', updatedTenant.id), updatedTenant);
    }
    setEditingTenant(null);
  };
  
  const handleDeleteTenant = async (tenantId) => {
     if(!confirm("Are you sure you want to delete this tenant? This action cannot be undone.")) return;

     try {
        if(isOffline) {
            setTenants(prev => prev.filter(t => t.id !== tenantId));
        } else {
            await deleteDoc(doc(db, 'tenants', tenantId));
        }
     } catch (err) {
        console.error(err);
        alert("Error deleting tenant: " + err.message);
     }
  };

  const saveFolderLink = async () => {
    const finalLink = ensureProtocol(tempFolderLink);
    const updatedProp = { ...property, folderLink: finalLink };
    if (isOffline) {
      setProperties((prev) =>
        prev.map((p) => (p.id === property.id ? updatedProp : p))
      );
    } else {
      await updateDoc(doc(db, 'properties', property.id), {
        folderLink: finalLink,
      });
    }
    setIsEditingFolder(false);
  };

  const removeFolderLink = async () => {
    if (!confirm('Remove the property folder link?')) return;
    const updatedProp = { ...property, folderLink: '' };
    if (isOffline) {
      setProperties((prev) =>
        prev.map((p) => (p.id === property.id ? updatedProp : p))
      );
    } else {
      await updateDoc(doc(db, 'properties', property.id), { folderLink: '' });
    }
    setTempFolderLink('');
  };

  const startEditingLink = (docId, currentLink, currentExpiry) => {
    setEditingDocId(docId);
    setTempLink(currentLink || '');
    setTempExpiry(currentExpiry || '');
  };

  const saveLink = async (docId) => {
    if (!tempLink) return;
    const finalLink = ensureProtocol(tempLink);
    const updatedCompliance = property.compliance.map((c) =>
      c.id === docId
        ? {
            ...c,
            uploaded: true,
            link: finalLink,
            expiryDate: tempExpiry,
            dateUploaded: new Date().toISOString(),
          }
        : c
    );

    if (isOffline) {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === property.id ? { ...p, compliance: updatedCompliance } : p
        )
      );
    } else {
      await updateDoc(doc(db, 'properties', property.id), {
        compliance: updatedCompliance,
      });
    }

    setEditingDocId(null);
    setTempLink('');
    setTempExpiry('');
  };

  const removeLink = async (docId) => {
    if (!confirm('Remove this document link?')) return;
    const updatedCompliance = property.compliance.map((c) =>
      c.id === docId
        ? {
            ...c,
            uploaded: false,
            link: '',
            expiryDate: '',
            dateUploaded: null,
          }
        : c
    );

    if (isOffline) {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === property.id ? { ...p, compliance: updatedCompliance } : p
        )
      );
    } else {
      await updateDoc(doc(db, 'properties', property.id), {
        compliance: updatedCompliance,
      });
    }
  };

  const getDocStatus = (doc) => {
    if (!doc.uploaded) return 'missing';
    if (!doc.expiryDate) return 'valid';
    const expiry = new Date(doc.expiryDate);
    const today = new Date();
    const diffDays = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'warning';
    return 'valid';
  };

  // --- NEW COMPLIANCE FUNCTIONS ---
  const toggleDocVisibility = async (docId) => {
    const updatedCompliance = property.compliance.map((c) =>
      c.id === docId ? { ...c, visibleToTenant: !c.visibleToTenant } : c
    );
    if (isOffline) {
      setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, compliance: updatedCompliance } : p)));
    } else {
      await updateDoc(doc(db, 'properties', property.id), { compliance: updatedCompliance });
    }
  };

  const deleteComplianceDoc = async (docId) => {
    if (!confirm('Permanently delete this document slot?')) return;
    const updatedCompliance = property.compliance.filter((c) => c.id !== docId);
    if (isOffline) {
      setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, compliance: updatedCompliance } : p)));
    } else {
      await updateDoc(doc(db, 'properties', property.id), { compliance: updatedCompliance });
    }
  };

  const addNewComplianceDoc = async () => {
    const name = prompt("Enter Document Name (e.g., 'Inventory Report'):");
    if (!name) return;
    
    const newDoc = {
      id: 'custom-' + Date.now(),
      name: name,
      mandatory: false,
      uploaded: false,
      visibleToTenant: false,
      link: '',
      expiryDate: ''
    };
    
    const updatedCompliance = [...(property.compliance || []), newDoc];
    
    if (isOffline) {
      setProperties((prev) => prev.map((p) => (p.id === property.id ? { ...p, compliance: updatedCompliance } : p)));
    } else {
      await updateDoc(doc(db, 'properties', property.id), { compliance: updatedCompliance });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
        <button
          onClick={onBack}
          className="p-2 hover:bg-white rounded-full text-gray-600 w-fit"
        >
          <ChevronRight className="w-5 h-5 rotate-180" />
        </button>
        <div className="flex-1 flex justify-between items-start md:items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 break-words">
                {property.address}
              </h1>
               <div className="mt-1 flex flex-wrap items-center gap-2">
            {isEditingFolder ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full animate-in fade-in zoom-in duration-200">
                <input
                  autoFocus
                  className="text-xs border rounded p-1 w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Paste OneDrive/Google Drive Folder Link..."
                  value={tempFolderLink}
                  onChange={(e) => setTempFolderLink(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveFolderLink}
                    className="text-xs bg-indigo-600 text-white px-2 py-1 rounded shadow-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingFolder(false)}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : property.folderLink ? (
              <div className="flex items-center gap-2 group">
                <a
                  href={property.folderLink}
                  target="_blank"
                  className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 inline-flex items-center gap-1 font-medium transition-colors"
                >
                  <FolderOpen className="w-3 h-3" /> Open Property Folder
                </a>
                <div className="flex gap-1 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setIsEditingFolder(true);
                      setTempFolderLink(property.folderLink);
                    }}
                    className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={removeFolderLink}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingFolder(true)}
                className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
              >
                <Cloud className="w-3 h-3" /> Link Cloud Folder (OneDrive/Google
                Drive)
              </button>
            )}
          </div>
            </div>
            <button 
                onClick={handleDeleteProperty}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
                title="Delete Property"
            >
                <Trash2 className="w-5 h-5" />
            </button>
        </div>
      </div>

      <div className="flex gap-6 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('tenants')}
          className={`pb-3 px-1 font-medium text-sm whitespace-nowrap ${
            activeTab === 'tenants'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500'
          }`}
        >
          Tenants & Payments
        </button>
        <button
          onClick={() => setActiveTab('compliance')}
          className={`pb-3 px-1 font-medium text-sm whitespace-nowrap ${
            activeTab === 'compliance'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-500'
          }`}
        >
          Compliance Documents
        </button>
      </div>

      {activeTab === 'tenants' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Current Tenants</h2>
            <Button
              onClick={() => setShowAddTenant(true)}
              variant="secondary"
              size="sm"
            >
              <Plus className="w-4 h-4" /> Add Tenant
            </Button>
          </div>

          {/* Add Tenant Form */}
          {showAddTenant && (
            <Card className="mb-6 bg-indigo-50 border-indigo-100">
              <form
                onSubmit={handleAddTenant}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
              >
                <input
                  required
                  className="p-2 rounded border w-full"
                  placeholder="Full Name"
                  value={newTenant.name}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, name: e.target.value })
                  }
                />
                <input
                  required
                  type="email"
                  className="p-2 rounded border w-full"
                  placeholder="Email"
                  value={newTenant.email}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, email: e.target.value })
                  }
                />
                <input
                  type="tel"
                  className="p-2 rounded border w-full"
                  placeholder="Mobile (Optional)"
                  value={newTenant.phone}
                  onChange={(e) =>
                    setNewTenant({ ...newTenant, phone: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    className="p-2 rounded border w-24 flex-1"
                    placeholder="Rent £"
                    value={newTenant.rentAmount}
                    onChange={(e) =>
                      setNewTenant({ ...newTenant, rentAmount: e.target.value })
                    }
                  />
                  <Button type="submit">Save</Button>
                </div>
              </form>
            </Card>
          )}

          {/* Edit Tenant Modal */}
          {editingTenant && (
            <TenantEditModal
              tenant={editingTenant}
              onClose={() => setEditingTenant(null)}
              onSave={handleUpdateTenant}
            />
          )}

          {tenants.map((tenant) => (
            <TenantRow
              key={tenant.id}
              tenant={tenant}
              payments={payments.filter((p) => p.tenantId === tenant.id)}
              db={db}
              isOffline={isOffline}
              setPayments={setPayments}
              emailConfig={emailConfig}
              onEditTenant={() => setEditingTenant(tenant)} 
              onDeleteTenant={() => handleDeleteTenant(tenant.id)}
            />
          ))}
          {tenants.length === 0 && (
            <p className="text-center text-gray-400 py-8 italic">
              No tenants added yet.
            </p>
          )}
        </div>
      )}

      {/* COMPLIANCE TAB */}
      {activeTab === 'compliance' && (
        <div className="space-y-4">
          {!property.folderLink && (
            <Alert type="info">
               <div className="flex items-center gap-2 mb-1 font-semibold"><Cloud className="w-4 h-4"/> Cloud Storage</div>
               <p className="text-sm">Upload documents to OneDrive/Google Drive, then link them below.</p>
            </Alert>
          )}

          <div className="flex justify-end">
             <Button onClick={addNewComplianceDoc} size="sm" variant="secondary">
                <Plus className="w-4 h-4" /> Add Document
             </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {property.compliance?.map((doc, idx) => {
              const status = getDocStatus(doc);
              const bgColors = {
                missing: 'border-gray-100',
                valid: 'border-green-100 bg-green-50/20',
                warning: 'border-amber-200 bg-amber-50',
                expired: 'border-red-200 bg-red-50',
              };

              return (
                <Card key={idx} className={`${bgColors[status]} relative`}>
                  <div className="absolute top-3 right-3 flex gap-2">
                     {doc.uploaded && (
                        <button 
                          onClick={() => toggleDocVisibility(doc.id)}
                          className={`flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-1 rounded-full border transition-colors ${
                             doc.visibleToTenant 
                             ? 'bg-indigo-100 text-indigo-700 border-indigo-200' 
                             : 'bg-gray-100 text-gray-400 border-gray-200'
                          }`}
                        >
                           {doc.visibleToTenant ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                           {doc.visibleToTenant ? 'Visible to Tenant' : 'Hidden'}
                        </button>
                     )}
                  </div>

                  <div className="flex justify-between items-start mb-3 pt-6 sm:pt-0">
                    <div className="flex gap-3">
                      <div className={`p-2 rounded-lg ${doc.uploaded ? 'bg-white text-indigo-700 shadow-sm' : 'bg-gray-100 text-gray-500'}`}>
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{doc.name}</h4>
                        <div className="flex flex-wrap gap-2 mt-1">
                           {status === 'expired' && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">EXPIRED</span>}
                           {status === 'warning' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">EXPIRING</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100/50 pt-3">
                    {editingDocId === doc.id ? (
                      <div className="space-y-3 animate-in fade-in zoom-in duration-200">
                        <input autoFocus type="text" className="w-full p-2 text-sm border rounded" placeholder="Paste link..." value={tempLink} onChange={(e) => setTempLink(e.target.value)} />
                        <input type="date" className="w-full p-2 text-sm border rounded" value={tempExpiry} onChange={(e) => setTempExpiry(e.target.value)} />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => saveLink(doc.id)} className="flex-1">Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingDocId(null); setTempLink(''); setTempExpiry(''); }}>Cancel</Button>
                        </div>
                      </div>
                    ) : doc.uploaded ? (
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                           <a href={doc.link} target="_blank" className="text-sm font-medium text-indigo-600 hover:underline">Open Document</a>
                           <span className="text-xs text-gray-400">{doc.expiryDate ? `Expires: ${new Date(doc.expiryDate).toLocaleDateString()}` : 'No expiry'}</span>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEditingLink(doc.id, doc.link, doc.expiryDate)} className="p-2 text-indigo-500 hover:bg-white rounded shadow-sm"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => removeLink(doc.id)} className="p-2 text-amber-500 hover:bg-white rounded shadow-sm" title="Unlink (Keep Slot)"><LinkIcon className="w-4 h-4" /></button>
                          <button onClick={() => deleteComplianceDoc(doc.id)} className="p-2 text-red-500 hover:bg-white rounded shadow-sm" title="Delete Slot"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500 italic">Not Linked</span>
                        <div className="flex gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setEditingDocId(doc.id)}><LinkIcon className="w-4 h-4" /> Link</Button>
                            {!doc.mandatory && (
                                <button onClick={() => deleteComplianceDoc(doc.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                            )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Safe Delete Button Component
const DeleteButton = ({ onDelete }) => {
  const [status, setStatus] = useState('idle'); // idle, confirm, processing

  const handleClick = (e) => {
    e.stopPropagation();
    if (status === 'idle') {
      setStatus('confirm');
      // Auto-reset if not clicked
      setTimeout(
        () => setStatus((prev) => (prev === 'confirm' ? 'idle' : prev)),
        3000
      );
    } else if (status === 'confirm') {
      setStatus('processing');
      onDelete();
    }
  };

  if (status === 'processing')
    return <Loader2 className="w-4 h-4 text-red-500 animate-spin" />;

  return (
    <button
      onClick={handleClick}
      className={`p-2 rounded transition-all duration-200 flex items-center gap-1 ${
        status === 'confirm'
          ? 'bg-red-600 text-white w-20 justify-center'
          : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
      }`}
      title="Delete Payment"
    >
      {status === 'confirm' ? (
        <span className="text-xs font-bold">Confirm?</span>
      ) : (
        <Trash2 className="w-4 h-4" />
      )}
    </button>
  );
};

const TenantRow = ({
  tenant,
  payments,
  db,
  isOffline,
  setPayments,
  emailConfig,
  onEditTenant,
  onDeleteTenant,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptConfirm, setShowReceiptConfirm] = useState(null); // stores payment object to confirm receipt
  const [editingPayment, setEditingPayment] = useState(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [smsModalOpen, setSmsModalOpen] = useState(false);

  const [payForm, setPayForm] = useState({
    amount: '',
    type: 'Bank Transfer',
    targetMonth: new Date().toISOString().slice(0, 7),
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (showPaymentModal && !editingPayment) {
      setPayForm({
        amount: '',
        type: 'Bank Transfer',
        targetMonth: new Date().toISOString().slice(0, 7),
      });
    } else if (showPaymentModal && editingPayment) {
      setPayForm({
        amount: editingPayment.amount,
        type: editingPayment.type,
        targetMonth:
          editingPayment.targetMonth || new Date().toISOString().slice(0, 7),
      });
    }
  }, [showPaymentModal, editingPayment]);

  const getMonthDateRange = (isoMonth) => {
    const [year, month] = isoMonth.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      formattedStart: start.toLocaleDateString('en-GB'),
      formattedEnd: end.toLocaleDateString('en-GB'),
      label: start.toLocaleString('default', {
        month: 'long',
        year: 'numeric',
      }),
    };
  };

  const getMonthlyStatus = (targetMonth) => {
    const monthPayments = payments.filter((p) => p.targetMonth === targetMonth);
    const paid = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    // Use helper to get correct rent for that specific month
    // Construct a date in the middle of the month to check schedule
    const [y, m] = targetMonth.split('-');
    const checkDate = new Date(y, m - 1, 15);
    const expectedRent = getRentForDate(tenant, checkDate);

    const remaining = Math.max(0, expectedRent - paid);
    let status = 'unpaid';
    if (paid >= expectedRent) status = 'paid';
    else if (paid > 0) status = 'partial';
    return { paid, remaining, status, expectedRent };
  };

  const getLastMonths = (count) => {
    const months = [];
    const today = new Date();
    // Set to 1st of month to avoid edge cases like 31st rolling over shorter months
    const current = new Date(today.getFullYear(), today.getMonth(), 1);

    for (let i = 0; i < count; i++) {
      const d = new Date(current);
      d.setMonth(current.getMonth() - i);

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${y}-${m}`);
    }
    return [...new Set(months)]; // Ensure uniqueness
  };

  // If showing all history, we find the earliest payment or just go back 12 months
  const monthsToShow = showAllHistory ? getLastMonths(12) : getLastMonths(3);

  // --- REUSABLE EMAIL SENDING FUNCTION ---
  const sendReceiptEmail = (paymentToReceipt) => {
    const dateInfo = getMonthDateRange(paymentToReceipt.targetMonth);
    const currentStats = getMonthlyStatus(paymentToReceipt.targetMonth);
    // Recalculate remaining as if this payment is included (it should be saved already)
    const newTotalPaid = currentStats.paid;
    const remaining = currentStats.remaining;

    const emailSubject = `Rent Payment Receipt - ${tenant.name} (${dateInfo.label})`;
    const emailBody = `Rent Payment received for ${dateInfo.formattedStart} to ${dateInfo.formattedEnd} of £${paymentToReceipt.amount}. \n\nTotal Paid for ${dateInfo.label}: £${newTotalPaid}\nPayment remaining for this month: £${remaining}.\n\nKind regards, \nYaseen Hussain`;

    if (emailConfig && emailConfig.serviceId && emailConfig.paymentTemplateId) {
      setSending(true);
      loadEmailJS(async () => {
        try {
          await window.emailjs.send(
            emailConfig.serviceId,
            emailConfig.paymentTemplateId,
            {
              tenant: tenant.email,
              to_name: tenant.name,
              subject: emailSubject,
              message: emailBody,
            },
            emailConfig.publicKey
          );
          alert('Receipt sent via Outlook!');
        } catch (e) {
          console.error(e);
          alert('Failed to send email. Please check Settings.');
        } finally {
          setSending(false);
          setShowReceiptConfirm(null); // Close confirm box
        }
      });
    } else {
      // Fallback
      window.location.href = `mailto:${
        tenant.email
      }?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(
        emailBody
      )}`;
      setShowReceiptConfirm(null);
    }
  };

  const handleSavePayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(payForm.amount);
    const dateInfo = getMonthDateRange(payForm.targetMonth);

    // Base data object
    const data = {
      tenantId: tenant.id,
      amount: amount,
      type: payForm.type,
      targetMonth: payForm.targetMonth,
      startDate: dateInfo.start,
      endDate: dateInfo.end,
      dateReceived: editingPayment
        ? editingPayment.dateReceived
        : new Date().toISOString(),
    };

    let savedPayment = data; // To hold the full object with ID

    if (editingPayment) {
      // --- EDIT MODE ---
      if (isOffline) {
        setPayments((prev) =>
          prev.map((p) => (p.id === editingPayment.id ? { ...p, ...data } : p))
        );
        savedPayment = { ...data, id: editingPayment.id };
      } else {
        await updateDoc(doc(db, 'payments', editingPayment.id), data);
        savedPayment = { ...data, id: editingPayment.id };
      }
    } else {
      // --- ADD MODE ---
      if (isOffline) {
        const newId = 'local-p-' + Date.now();
        savedPayment = { ...data, id: newId };
        setPayments((prev) => [...prev, savedPayment]);
      } else {
        const docRef = await addDoc(collection(db, 'payments'), data);
        savedPayment = { ...data, id: docRef.id };
      }

      // TRIGGER CONFIRMATION BOX FOR NEW PAYMENTS
      setShowReceiptConfirm(savedPayment);
    }

    setShowPaymentModal(false);
    setEditingPayment(null);
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      if (isOffline) {
        setPayments((prev) => prev.filter((p) => p.id !== paymentId));
      } else {
        await deleteDoc(doc(db, 'payments', paymentId));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete payment: ' + err.message);
    }
  };

  return (
    <div
      className={`bg-white rounded-xl border transition-all ${
        expanded ? 'ring-2 ring-indigo-50 border-indigo-100' : 'border-gray-200'
      }`}
    >
      <div
        className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between cursor-pointer gap-4"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
            {tenant.name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{tenant.name}</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTenant();
                }}
                className="text-gray-400 hover:text-indigo-600 p-1"
                title="Edit Tenant"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTenant();
                }}
                className="text-gray-400 hover:text-red-600 p-1"
                title="Delete Tenant"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <p className="text-sm text-gray-500">
              Rent: £{getRentForDate(tenant, new Date())}/mo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setSmsModalOpen(true);
            }}
            className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-4"
          >
            <MessageSquare className="w-4 h-4" /> <span className="hidden xs:inline">Remind</span><span className="xs:hidden">SMS</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              setEditingPayment(null);
              setShowPaymentModal(true);
            }}
            className="flex-1 sm:flex-none text-xs sm:text-sm px-2 sm:px-4"
          >
            <PoundSterling className="w-4 h-4" /> Log Pay
          </Button>
          <ChevronRight
            className={`w-5 h-5 text-gray-400 transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          />
        </div>
      </div>

      {expanded && (
        <div className="bg-gray-50 p-4 sm:p-6 border-t border-gray-100 space-y-6">
          {/* MONTHLY RENT DASHBOARD */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Financial Overview
              </h4>
              <button
                onClick={() => setShowAllHistory(!showAllHistory)}
                className="text-xs text-indigo-600 hover:underline"
              >
                {showAllHistory ? 'Show Less' : 'View All History'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {monthsToShow.map((monthStr) => {
                const { label } = getMonthDateRange(monthStr);
                const { paid, remaining, status, expectedRent } =
                  getMonthlyStatus(monthStr);

                const statusColors = {
                  paid: 'bg-green-50 border-green-200 text-green-700',
                  partial: 'bg-amber-50 border-amber-200 text-amber-700',
                  unpaid: 'bg-white border-gray-200 text-gray-500',
                };

                return (
                  <div
                    key={monthStr}
                    className={`p-3 rounded-lg border ${statusColors[status]} relative overflow-hidden`}
                  >
                    <div className="flex justify-between items-start mb-2 relative z-10">
                      <span className="text-xs font-bold uppercase">
                        {label}
                      </span>
                      {status === 'paid' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <div className="relative z-10">
                      <div className="flex justify-between text-sm font-medium mb-1">
                        <span>£{paid}</span>
                        <span className="text-gray-400">/ £{expectedRent}</span>
                      </div>
                      <div className="w-full bg-gray-200/50 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${
                            status === 'paid' ? 'bg-green-500' : 'bg-amber-500'
                          }`}
                          style={{
                            width: `${Math.min(
                              100,
                              (paid / expectedRent) * 100
                            )}%`,
                          }}
                        ></div>
                      </div>
                      {remaining > 0 && (
                        <p className="text-xs mt-2 text-right font-medium">
                          Due: £{remaining}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wider">
              Detailed Payment History
            </h4>
            <div className="space-y-2">
              {payments.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No payments logged yet.
                </p>
              ) : (
                payments
                  .sort(
                    (a, b) =>
                      new Date(b.dateReceived) - new Date(a.dateReceived)
                  )
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-3 rounded-lg border border-gray-200 text-sm shadow-sm group gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            p.type === 'Cash'
                              ? 'bg-green-100 text-green-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {p.type === 'Cash' ? (
                            <PoundSterling className="w-4 h-4" />
                          ) : (
                            <CreditCard className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <span className="font-bold text-gray-900 block">
                            £{p.amount}
                          </span>
                          <span className="text-xs text-gray-500">
                            {p.type} •{' '}
                            {
                              getMonthDateRange(p.targetMonth || '2025-01')
                                .label
                            }
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="text-gray-900 font-medium">
                            {new Date(p.dateReceived).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-400">Received</div>
                        </div>
                        {/* Actions */}
                        <div className="flex gap-1 items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowReceiptConfirm(p);
                            }}
                            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                            title="Send Receipt"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPayment(p);
                              setShowPaymentModal(true);
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-gray-100 rounded"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <DeleteButton
                            onDelete={() => handleDeletePayment(p.id)}
                          />
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card
            className="w-full max-w-md mx-4"
            title={editingPayment ? 'Edit Payment' : 'Record Payment'}
          >
            <form onSubmit={handleSavePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Rent Period
                </label>
                <input
                  type="month"
                  className="w-full p-2 border rounded"
                  value={payForm.targetMonth}
                  onChange={(e) =>
                    setPayForm({ ...payForm, targetMonth: e.target.value })
                  }
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Payment for:{' '}
                  {getMonthDateRange(payForm.targetMonth).formattedStart} to{' '}
                  {getMonthDateRange(payForm.targetMonth).formattedEnd}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Amount Received
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">£</span>
                  <input
                    type="number"
                    className="w-full pl-6 p-2 border rounded"
                    placeholder="0.00"
                    value={payForm.amount}
                    onChange={(e) =>
                      setPayForm({ ...payForm, amount: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Payment Method
                </label>
                <select
                  className="w-full p-2 border rounded"
                  value={payForm.type}
                  onChange={(e) =>
                    setPayForm({ ...payForm, type: e.target.value })
                  }
                >
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                </select>
              </div>

              {editingPayment && (
                <Alert type="warning">
                  <div className="text-xs">
                    Editing a past payment will <strong>not</strong> send a new
                    email receipt.
                  </div>
                </Alert>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">
                  {editingPayment ? 'Update Payment' : 'Save Payment'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CONFIRMATION MODAL FOR EMAIL */}
      {showReceiptConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden mx-4">
            <div className="bg-indigo-600 p-4 text-white text-center">
              <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-90" />
              <h3 className="text-lg font-bold">Payment Saved!</h3>
            </div>
            <div className="p-6 text-center space-y-4">
              <p className="text-gray-600">
                Would you like to send a receipt to:
              </p>
              <div className="bg-gray-50 p-2 rounded border font-medium text-gray-800 break-all">
                {tenant.email}
              </div>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={() => sendReceiptEmail(showReceiptConfirm)}
                  disabled={sending}
                  className="w-full justify-center"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {sending ? 'Sending...' : 'Yes, Send Receipt'}
                </Button>
                <button
                  onClick={() => setShowReceiptConfirm(null)}
                  className="text-gray-400 hover:text-gray-600 text-sm py-2"
                >
                  No, skip for now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMS MODAL */}
      {smsModalOpen && (
        <SendSMSModal
          tenant={tenant}
          onClose={() => setSmsModalOpen(false)}
          rentAmount={getRentForDate(tenant, new Date())} // use current date
        />
      )}
    </div>
  );
};

const SendSMSModal = ({ tenant, onClose, rentAmount }) => {
  const [amountDue, setAmountDue] = useState(rentAmount);
  const [remainderOption, setRemainderOption] = useState('cash'); // 'cash' or 'transfer'
  const [sending, setSending] = useState(false);

  // Calculate diff
  const diff = Math.max(0, rentAmount - amountDue);

  const constructMessage = () => {
    let msg = `Your rent is due. Please send a payment via bank transfer of £${amountDue} to the following account:\nYusuf Hussain\nSort Code: 20-25-24\nAccount: 70370274`;

    if (diff > 0) {
      if (remainderOption === 'cash') {
        msg += `\n\nPlease pay the remaining £${diff} in cash.`;
      } else {
        msg += `\n\nPlease pay the remaining £${diff} via bank transfer at a different date.`;
      }
    }
    return msg;
  };

  const handleWhatsApp = () => {
    const phone = formatPhoneForWhatsapp(tenant.phone);
    if (!phone) return alert('Tenant has no valid phone number.');
    const text = encodeURIComponent(constructMessage());
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    onClose();
  };

  const handleSMS = () => {
    const phone = tenant.phone;
    if (!phone) return alert('Tenant has no phone number.');
    const body = encodeURIComponent(constructMessage());
    // Attempt to open default SMS app
    window.location.href = `sms:${phone}?&body=${body}`;
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md mx-4" title="Send Rent Reminder">
        <div className="space-y-4">
          <Alert type="info">
            Send a reminder to{' '}
            <strong>{tenant.phone || 'No phone number'}</strong>.
          </Alert>

          <div>
            <label className="block text-sm font-medium mb-1">
              Amount Requested via Bank Transfer
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500">£</span>
              <input
                type="number"
                className="w-full pl-6 p-2 border rounded"
                value={amountDue}
                onChange={(e) => setAmountDue(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {diff > 0 && (
            <div className="bg-amber-50 p-3 rounded border border-amber-100">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Remaining Balance: £{diff}
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="remainder"
                    checked={remainderOption === 'cash'}
                    onChange={() => setRemainderOption('cash')}
                  />
                  Collect remaining in Cash
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="radio"
                    name="remainder"
                    checked={remainderOption === 'transfer'}
                    onChange={() => setRemainderOption('transfer')}
                  />
                  Pay remaining via Transfer later
                </label>
              </div>
            </div>
          )}

          <div className="bg-gray-100 p-3 rounded text-xs font-mono text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {constructMessage()}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={handleWhatsApp}
              variant="whatsapp"
              disabled={!tenant.phone}
            >
              <MessageSquare className="w-4 h-4" /> Send via WhatsApp
            </Button>
            <Button onClick={handleSMS} disabled={!tenant.phone}>
              <Smartphone className="w-4 h-4" /> Send via SMS App
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

// --- NEW COMPONENT: ACTIVITY LOGS PAGE ---
const ActivityLogsPage = ({ db, tenants }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterTenant, setFilterTenant] = useState('all');
  const [filterAction, setFilterAction] = useState('all');
  const [searchDetails, setSearchDetails] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        let q = query(collection(db, 'activity_logs')); 
        
        const snapshot = await getDocs(q);
        let fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Client-side Sort (Newest First)
        fetchedLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        setLogs(fetchedLogs);
      } catch (err) {
        console.error("Error fetching logs:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [db]);

  // Extract unique actions for the dropdown
  const uniqueActions = ['all', ...new Set(logs.map(log => log.action))];

  const filteredLogs = logs.filter(log => {
    // 1. Filter by Tenant
    if (filterTenant !== 'all' && log.tenantId !== filterTenant) return false;
    
    // 2. Filter by Action
    if (filterAction !== 'all' && log.action !== filterAction) return false;

    // 3. Filter by Details (Search)
    if (searchDetails) {
        const searchLower = searchDetails.toLowerCase();
        const detailsMatch = log.details?.toLowerCase().includes(searchLower);
        const ipMatch = log.ipAddress?.toLowerCase().includes(searchLower);
        if (!detailsMatch && !ipMatch) return false;
    }

    return true;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Tenant Activity Logs</h1>
        
        {/* Filter Controls */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Tenant Filter */}
          <select 
            className="p-2 border rounded-lg text-sm bg-white min-w-[150px]"
            value={filterTenant}
            onChange={(e) => setFilterTenant(e.target.value)}
          >
            <option value="all">All Tenants</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          {/* Action Filter */}
          <select 
            className="p-2 border rounded-lg text-sm bg-white min-w-[150px]"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="all">All Actions</option>
            {uniqueActions.filter(a => a !== 'all').map(action => (
              <option key={action} value={action}>{action}</option>
            ))}
          </select>

          {/* Search Input */}
          <div className="relative flex-1 md:flex-none">
             <input 
                type="text" 
                placeholder="Search details or IP..." 
                className="p-2 pl-2 border rounded-lg text-sm w-full md:w-64"
                value={searchDetails}
                onChange={(e) => setSearchDetails(e.target.value)}
             />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 font-medium border-b">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">Tenant</th>
                <th className="p-3">Action</th>
                <th className="p-3">Details</th>
                <th className="p-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan="5" className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600"/></td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-400">No activity found matching your filters.</td></tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="p-3 whitespace-nowrap text-gray-600">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-indigo-700">
                      {log.tenantName}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.action === 'Login' ? 'bg-green-100 text-green-700' :
                        log.action === 'Logout' ? 'bg-gray-100 text-gray-700' :
                        'bg-blue-50 text-blue-700'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-gray-600 max-w-xs truncate" title={log.details}>
                        {log.details}
                    </td>
                    <td className="p-3 font-mono text-xs text-gray-500">{log.ipAddress}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && (
            <div className="p-2 text-center text-xs text-gray-400 border-t">
                Showing all {filteredLogs.length} records
            </div>
        )}
      </Card>
    </div>
  );
};

const SettingsPage = ({
  complianceTypes,
  onUpdateCompliance,
  emailConfig,
  onUpdateEmail,
}) => {
  const [newDocName, setNewDocName] = useState('');
  const [newDocMandatory, setNewDocMandatory] = useState(true);
  const [localEmailConfig, setLocalEmailConfig] = useState(emailConfig);

  const toggleMandatory = (id) => {
    const updated = complianceTypes.map((t) =>
      t.id === id ? { ...t, mandatory: !t.mandatory } : t
    );
    onUpdateCompliance(updated);
  };

  const deleteType = (id) => {
    if (
      !confirm(
        'Are you sure? This will remove this document type from NEW properties only.'
      )
    )
      return;
    const updated = complianceTypes.filter((t) => t.id !== id);
    onUpdateCompliance(updated);
  };

  const addNewType = (e) => {
    e.preventDefault();
    if (!newDocName.trim()) return;
    const newType = {
      id: 'custom-' + Date.now(),
      name: newDocName,
      mandatory: newDocMandatory,
    };
    onUpdateCompliance([...complianceTypes, newType]);
    setNewDocName('');
    setNewDocMandatory(true);
  };

  const saveEmailSettings = (e) => {
    e.preventDefault();
    onUpdateEmail(localEmailConfig);
    alert('Email settings saved!');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* EMAIL INTEGRATION SETTINGS */}
      <Card title="Email Integration (Outlook via EmailJS)">
        <p className="text-gray-500 mb-4 text-sm">
          Configure your EmailJS keys to send emails directly via Outlook.
        </p>
        <form onSubmit={saveEmailSettings} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Service ID
              </label>
              <input
                className="w-full p-2 text-sm border rounded-lg"
                value={localEmailConfig.serviceId}
                onChange={(e) =>
                  setLocalEmailConfig({
                    ...localEmailConfig,
                    serviceId: e.target.value,
                  })
                }
                placeholder="service_..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Public Key
              </label>
              <input
                className="w-full p-2 text-sm border rounded-lg"
                value={localEmailConfig.publicKey}
                onChange={(e) =>
                  setLocalEmailConfig({
                    ...localEmailConfig,
                    publicKey: e.target.value,
                  })
                }
                placeholder="user_..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Payment Receipt Template ID
              </label>
              <input
                className="w-full p-2 text-sm border rounded-lg"
                value={localEmailConfig.paymentTemplateId}
                onChange={(e) =>
                  setLocalEmailConfig({
                    ...localEmailConfig,
                    paymentTemplateId: e.target.value,
                  })
                }
                placeholder="template_..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Compliance Report Template ID
              </label>
              <input
                className="w-full p-2 text-sm border rounded-lg"
                value={localEmailConfig.reportTemplateId}
                onChange={(e) =>
                  setLocalEmailConfig({
                    ...localEmailConfig,
                    reportTemplateId: e.target.value,
                  })
                }
                placeholder="template_..."
              />
            </div>
          </div>
          <Button type="submit" className="w-full">
            Save Email Settings
          </Button>
        </form>
      </Card>

      <Card title="Compliance Documents Configuration">
        <p className="text-gray-500 mb-4 text-sm">
          Customize which documents appear when you add a new property.
        </p>
        <div className="space-y-2 mb-6">
          {complianceTypes.map((t) => (
            <div
              key={t.id}
              className="flex justify-between items-center p-3 border rounded-lg bg-gray-50 group hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleMandatory(t.id)}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    t.mandatory
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {t.mandatory ? (
                    <CheckSquare className="w-3 h-3" />
                  ) : (
                    <Square className="w-3 h-3" />
                  )}
                  {t.mandatory ? 'Mandatory' : 'Optional'}
                </button>
                <span className="font-medium text-gray-700">{t.name}</span>
              </div>
              <button
                onClick={() => deleteType(t.id)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove Document Type"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Add New Document Type
          </h4>
          <form onSubmit={addNewType} className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Document Name
              </label>
              <input
                className="w-full p-2 text-sm border rounded-lg"
                placeholder="e.g. Fire Risk Assessment"
                value={newDocName}
                onChange={(e) => setNewDocName(e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Requirement
              </label>
              <select
                className="w-full p-2 text-sm border rounded-lg bg-white"
                value={newDocMandatory}
                onChange={(e) => setNewDocMandatory(e.target.value === 'true')}
              >
                <option value="true">Mandatory</option>
                <option value="false">Optional</option>
              </select>
            </div>
            <Button type="submit" disabled={!newDocName.trim()}>
              <Plus className="w-4 h-4" /> Add
            </Button>
          </form>
        </div>
      </Card>

      <Card title="Data Status">
        <div className="flex gap-2 text-green-600">
          <CheckCircle className="w-5 h-5" /> Firebase Connected
        </div>
      </Card>
    </div>
  );
};
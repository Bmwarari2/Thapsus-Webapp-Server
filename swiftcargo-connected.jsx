import React, { useState, useEffect, createContext, useContext } from 'react';
import {
  Package, Truck, Calculator, Layers, LogOut, DollarSign,
  CheckCircle, Clock, AlertTriangle,
  Menu, X, Box, BarChart3, Users, Globe, ShieldCheck,
  ArrowRight, MapPin, RefreshCcw,
  CreditCard, ShoppingBag, Zap, Anchor, Shield
} from 'lucide-react';

// ==========================================
// CONFIGURATION
// ==========================================
const API_BASE = "https://swiftcargo-production.up.railway.app";

const WAREHOUSE_ADDRESSES = {
  UK: {
    address: "31 Collingwood Close, Hazel Grove",
    city: "Stockport",
    postcode: "SK7 4LB",
    country: "United Kingdom",
  },
  USA: {
    address: "123 Logistics Way, Suite 100",
    city: "Newark",
    state: "NJ",
    postcode: "07102",
    country: "USA"
  },
  CHINA: {
    address: "888 Export Road, Floor 2",
    city: "Guangzhou",
    province: "Guangdong",
    postcode: "510000",
    country: "China"
  }
};

const EXCHANGE_RATES = {
  USD_TO_KES: 132.50,
  GBP_TO_KES: 168.20,
};

// ==========================================
// REAL API LAYER
// All requests go to Railway. Token is stored
// in localStorage after login.
// ==========================================

/**
 * getToken / saveToken / clearToken
 * Tiny helpers so the token is always in one place.
 */
const getToken = () => localStorage.getItem('sc_token');
const saveToken = (t) => localStorage.setItem('sc_token', t);
const clearToken = () => localStorage.removeItem('sc_token');

/**
 * api(endpoint, options)
 * Wraps fetch so every call:
 *  - hits the correct Railway base URL
 *  - sends JSON headers
 *  - attaches the Bearer token when one exists
 *  - throws a friendly error if the server replies with !ok
 */
const api = async (endpoint, options = {}) => {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Try to parse the body regardless of status so we can show server messages
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    // Throw whatever message the backend sent, or a generic one
    throw new Error(data.message || data.detail || `Request failed (${res.status})`);
  }

  return data;
};

// Convenience wrappers
const apiGet  = (endpoint)       => api(endpoint, { method: 'GET' });
const apiPost = (endpoint, body) => api(endpoint, { method: 'POST', body: JSON.stringify(body) });

// ==========================================
// CONTEXTS
// ==========================================
const AuthContext       = createContext(null);
const NavigationContext = createContext(null);

// ==========================================
// COMMON UI COMPONENTS
// ==========================================
const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>
    <div className="p-6">{children}</div>
  </div>
);

const Button = ({ children, variant = 'primary', className = '', loading = false, ...props }) => {
  const base = "inline-flex items-center justify-center px-6 py-3 font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary:   "bg-blue-700 hover:bg-blue-800 text-white shadow-md shadow-blue-200",
    secondary: "bg-slate-900 hover:bg-black text-white shadow-md shadow-slate-300",
    outline:   "border-2 border-slate-900 text-slate-900 hover:bg-slate-50",
    ghost:     "text-slate-600 hover:bg-slate-100"
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} disabled={loading} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> : null}
      {children}
    </button>
  );
};

const ErrorBanner = ({ message, onClose }) => (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
    <div className="flex-1">
      <p className="text-red-700 font-bold text-sm">{message}</p>
    </div>
    {onClose && (
      <button onClick={onClose} className="text-red-400 hover:text-red-600">
        <X size={16} />
      </button>
    )}
  </div>
);

// ==========================================
// PUBLIC HEADER & FOOTER
// ==========================================
const PublicHeader = () => {
  const { navigate } = useContext(NavigationContext);
  const [mobileMenu, setMobileMenu] = useState(false);

  return (
    <nav className="sticky top-0 bg-white/90 backdrop-blur-md z-50 border-b border-slate-100">
      <div className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div onClick={() => navigate('/')} className="flex items-center gap-2 text-2xl font-black text-blue-800 italic cursor-pointer">
          <Truck size={32} /> SWIFTCARGO
        </div>
        <div className="hidden md:flex gap-8 font-bold text-slate-600">
          <button onClick={() => navigate('/services')}    className="hover:text-blue-700 transition-colors">Services</button>
          <button onClick={() => navigate('/rates')}       className="hover:text-blue-700 transition-colors">Rates</button>
          <button onClick={() => navigate('/how-it-works')} className="hover:text-blue-700 transition-colors">How it Works</button>
        </div>
        <div className="flex gap-4">
          <Button variant="ghost" className="hidden sm:flex" onClick={() => navigate('/login')}>Login</Button>
          <Button onClick={() => navigate('/login')}>Get Started</Button>
          <button className="md:hidden" onClick={() => setMobileMenu(!mobileMenu)}><Menu /></button>
        </div>
      </div>
      {mobileMenu && (
        <div className="md:hidden bg-white border-t border-slate-100 p-6 flex flex-col gap-4 font-bold">
          <button onClick={() => { navigate('/services');    setMobileMenu(false); }}>Services</button>
          <button onClick={() => { navigate('/rates');       setMobileMenu(false); }}>Rates</button>
          <button onClick={() => { navigate('/how-it-works'); setMobileMenu(false); }}>How it Works</button>
        </div>
      )}
    </nav>
  );
};

const PublicFooter = () => {
  const { navigate } = useContext(NavigationContext);
  return (
    <footer className="bg-slate-900 text-white py-16 px-6">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-12">
        <div>
          <div className="flex items-center gap-2 text-2xl font-black italic text-blue-400 mb-4">
            <Truck size={28} /> SWIFTCARGO
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your direct link to global markets. Shop from the UK, US, and China with delivery straight to Kenya.
          </p>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-4">Quick Links</h4>
          <div className="space-y-3">
            <button onClick={() => navigate('/services')}    className="block text-slate-300 hover:text-white transition-colors font-medium">Services</button>
            <button onClick={() => navigate('/rates')}       className="block text-slate-300 hover:text-white transition-colors font-medium">Rates</button>
            <button onClick={() => navigate('/how-it-works')} className="block text-slate-300 hover:text-white transition-colors font-medium">How it Works</button>
          </div>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-4">Markets</h4>
          <div className="space-y-3 text-slate-300 font-medium">
            <p>United Kingdom</p>
            <p>United States</p>
            <p>China</p>
          </div>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-4">Contact</h4>
          <div className="space-y-3 text-slate-300 text-sm">
            <p>support@swiftcargo.co.ke</p>
            <p>+254 700 000 000</p>
            <p>Nairobi, Kenya</p>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-xs font-bold">
        &copy; {new Date().getFullYear()} SwiftCargo. All rights reserved.
      </div>
    </footer>
  );
};

// ==========================================
// PUBLIC PAGES (Services / Rates / How It Works)
// ==========================================
const ServicesPage = () => (
  <div className="bg-white min-h-screen">
    <PublicHeader />
    <div className="py-20 px-6 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <h1 className="text-5xl font-black text-slate-900 mb-6">Our Services</h1>
        <p className="text-xl text-slate-600">Complete logistics solutions for the modern Kenyan shopper.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {[
          { title: "Package Forwarding", desc: "Get unique addresses in UK, US, and China. We handle the rest.", icon: ShoppingBag, color: "text-blue-600 bg-blue-50" },
          { title: "Consolidation",      desc: "Combine multiple orders into one box to save up to 70% on shipping fees.", icon: Layers, color: "text-purple-600 bg-purple-50" },
          { title: "Assisted Purchase",  desc: "Link us the item, we buy it for you and you pay us via M-Pesa.", icon: CreditCard, color: "text-green-600 bg-green-50" },
          { title: "Air Express",        desc: "5-10 day delivery from our global hubs directly to your door.", icon: Zap, color: "text-amber-600 bg-amber-50" },
          { title: "Sea Freight",        desc: "Cost-effective bulk shipping for large items and commercial goods.", icon: Anchor, color: "text-cyan-600 bg-cyan-50" },
          { title: "Customs Clearing",   desc: "We handle KRA paperwork and duties so you don't have to.", icon: Shield, color: "text-red-600 bg-red-50" },
        ].map((s, i) => (
          <Card key={i} className="group hover:border-blue-400 transition-all cursor-default">
            <div className={`w-16 h-16 rounded-2xl ${s.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
              <s.icon size={32} />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-3">{s.title}</h3>
            <p className="text-slate-600 leading-relaxed">{s.desc}</p>
          </Card>
        ))}
      </div>
    </div>
    <PublicFooter />
  </div>
);

const RatesPage = () => (
  <div className="bg-white min-h-screen">
    <PublicHeader />
    <div className="py-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-20">
        <h1 className="text-5xl font-black text-slate-900 mb-6">Simple, Fair Pricing</h1>
        <p className="text-xl text-slate-600">Calculated by weight. No hidden clearance fees.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-8">
        {[
          { market: "United Kingdom", rate: "£12.50 / kg", speed: "5-7 Working Days",   items: ["Amazon", "Next", "Asos"] },
          { market: "USA",            rate: "$15.00 / kg", speed: "7-10 Working Days",  items: ["Walmart", "eBay", "Apple"] },
          { market: "China",          rate: "$9.00 / kg",  speed: "10-14 Working Days", items: ["Shein", "Alibaba", "Taobao"] },
        ].map((r, i) => (
          <Card key={i} className="text-center flex flex-col items-center">
            <Globe className="text-blue-600 mb-4" size={48} />
            <h2 className="text-3xl font-black text-slate-900 mb-2">{r.market}</h2>
            <div className="text-4xl font-black text-blue-700 my-6">{r.rate}</div>
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs mb-8 flex items-center gap-2">
              <Clock size={16}/> {r.speed}
            </p>
            <div className="w-full pt-6 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-400 mb-4 uppercase">Popular Retailers</p>
              <div className="flex flex-wrap justify-center gap-2">
                {r.items.map(item => (
                  <span key={item} className="px-3 py-1 bg-slate-100 rounded-full text-xs font-bold text-slate-600">{item}</span>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
    <PublicFooter />
  </div>
);

const HowItWorksPage = () => (
  <div className="bg-white min-h-screen">
    <PublicHeader />
    <div className="py-20 px-6 max-w-7xl mx-auto">
      <div className="text-center mb-20">
        <h1 className="text-5xl font-black text-slate-900 mb-6">How It Works</h1>
        <p className="text-xl text-slate-600">Four steps to global shopping freedom.</p>
      </div>
      <div className="max-w-4xl mx-auto space-y-16">
        {[
          { step: "1", title: "Get Your Address", desc: "Sign up and get instant access to your unique SC-ID and warehouse addresses in UK, US, and China.", icon: MapPin },
          { step: "2", title: "Shop Online",      desc: "Shop on any global site. Use our warehouse address as your 'Shipping Address' at checkout.", icon: ShoppingBag },
          { step: "3", title: "We Receive & Alert", desc: "Once your package arrives at our hub, we'll notify you. You can choose to ship now or wait to consolidate.", icon: CheckCircle },
          { step: "4", title: "Final Delivery",   desc: "Pay your shipping fees via M-Pesa. We handle the customs and deliver to your doorstep in Kenya.", icon: Truck },
        ].map((s, i) => (
          <div key={i} className="flex flex-col md:flex-row gap-8 items-center md:items-start text-center md:text-left">
            <div className="w-20 h-20 bg-blue-700 text-white rounded-2xl flex items-center justify-center text-4xl font-black shrink-0 shadow-lg shadow-blue-200">
              {s.step}
            </div>
            <div className="pt-2">
              <h3 className="text-3xl font-black text-slate-900 mb-3 flex items-center justify-center md:justify-start gap-3">
                <s.icon className="text-blue-600" size={28} /> {s.title}
              </h3>
              <p className="text-xl text-slate-600 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
    <PublicFooter />
  </div>
);

// ==========================================
// APP ROOT
// ==========================================
export default function App() {
  const [user, setUser]               = useState(null);
  const [currentPath, setCurrentPath] = useState('/');

  // On first load, check if a token exists and try to restore the session
  useEffect(() => {
    const token = getToken();
    if (!token) return;

    // Ask the backend "who am I?" using the stored token
    apiGet('/auth/me')
      .then(data => {
        setUser(data.user || data); // handle { user: {...} } or flat object
      })
      .catch(() => {
        // Token is stale — clear it and stay on the landing page
        clearToken();
      });
  }, []);

  const navigate = (path) => {
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  /**
   * login(email, password)
   * Calls POST /auth/login on Railway.
   * Saves the returned JWT and stores the user profile.
   */
  const login = async (email, password) => {
    const data = await apiPost('/auth/login', { email, password });
    // Most backends return { token, user } or { access_token, user }
    const token = data.token || data.access_token;
    if (token) saveToken(token);

    const profile = data.user || data;
    setUser(profile);
    navigate(profile.role === 'admin' ? '/admin' : '/dashboard');
  };

  /**
   * register(name, email, password, phone)
   * Calls POST /auth/register on Railway.
   * Then logs the user in automatically.
   */
  const register = async (name, email, password, phone) => {
    const data = await apiPost('/auth/register', { name, email, password, phone });
    const token = data.token || data.access_token;
    if (token) saveToken(token);

    const profile = data.user || data;
    setUser(profile);
    navigate('/dashboard');
  };

  /**
   * logout()
   * Clears the local token and returns to the landing page.
   * Optionally calls POST /auth/logout if your backend needs it.
   */
  const logout = async () => {
    try { await apiPost('/auth/logout', {}); } catch { /* ignore */ }
    clearToken();
    setUser(null);
    navigate('/');
  };

  const renderContent = () => {
    switch (currentPath) {
      case '/': return (
        <div className="bg-white">
          <PublicHeader />

          {/* Hero */}
          <section className="py-24 px-6 max-w-7xl mx-auto grid md:grid-cols-2 items-center gap-16">
            <div>
              <span className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-bold tracking-wide uppercase">Shipping to Kenya</span>
              <h1 className="text-6xl md:text-8xl font-black text-slate-900 mt-8 leading-none">
                Shop Any <span className="text-blue-700">Market.</span>
              </h1>
              <p className="text-xl text-slate-600 mt-8 max-w-lg leading-relaxed">
                Your direct link to UK, US, and China retailers. We provide the address, you provide the shopping list.
              </p>
              <div className="flex gap-4 mt-12">
                <Button className="h-14 px-10 text-lg" onClick={() => navigate('/login')}>Start Now</Button>
                <Button variant="outline" className="h-14 px-10 text-lg" onClick={() => navigate('/rates')}>Rates</Button>
              </div>
            </div>
            <div className="relative">
              <div className="bg-slate-900 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
                <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                  <span className="font-black italic tracking-tighter">SWIFT LIVE TRACK</span>
                  <div className="flex gap-1">{[1,2,3].map(i => <div key={i} className="w-2 h-2 rounded-full bg-blue-500" />)}</div>
                </div>
                <div className="space-y-6">
                  {['Amazon Package', 'Shein Consolidation', 'UK Warehouse'].map((item, i) => (
                    <div key={i} className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="flex gap-3 items-center">
                        <Package size={20} className="text-blue-400" />
                        <span className="font-bold">{item}</span>
                      </div>
                      <span className="text-[10px] font-black uppercase bg-blue-600 px-2 py-1 rounded">In Transit</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Trust Badges */}
          <section className="py-16 px-6 bg-slate-50">
            <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              {[
                { val: "10,000+", label: "Packages Delivered", icon: Package },
                { val: "3",       label: "Global Warehouses",  icon: Globe },
                { val: "5-14",    label: "Day Delivery",       icon: Clock },
                { val: "4.9/5",   label: "Customer Rating",    icon: CheckCircle },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <s.icon className="text-blue-600" size={28} />
                  <div className="text-3xl font-black text-slate-900">{s.val}</div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <section className="py-24 px-6 bg-blue-700 text-white text-center relative overflow-hidden">
            <Truck size={300} className="absolute -bottom-20 -left-20 text-white/5 rotate-12" />
            <div className="relative z-10 max-w-2xl mx-auto">
              <h2 className="text-4xl md:text-5xl font-black mb-6">Ready to Start Shopping?</h2>
              <p className="text-blue-100 text-xl mb-10 leading-relaxed">
                Create your free account and get instant access to warehouse addresses in the UK, US, and China.
              </p>
              <Button variant="outline" className="border-white text-white hover:bg-white hover:text-blue-700 h-14 px-10 text-lg" onClick={() => navigate('/login')}>
                Create Free Account <ArrowRight className="ml-2" size={20} />
              </Button>
            </div>
          </section>

          <PublicFooter />
        </div>
      );
      case '/services':    return <ServicesPage />;
      case '/rates':       return <RatesPage />;
      case '/how-it-works': return <HowItWorksPage />;
      case '/login':       return <LoginPage login={login} register={register} />;
      default:
        return user
          ? <DashboardShell user={user} navigate={navigate} path={currentPath} logout={logout} />
          : <LoginPage login={login} register={register} />;
    }
  };

  return (
    <NavigationContext.Provider value={{ navigate, currentPath }}>
      <AuthContext.Provider value={{ user, setUser }}>
        <div className="min-h-screen bg-white">
          {renderContent()}
        </div>
      </AuthContext.Provider>
    </NavigationContext.Provider>
  );
}

// ==========================================
// LOGIN / REGISTER PAGE
// ==========================================
const LoginPage = ({ login, register }) => {
  const { navigate } = useContext(NavigationContext);
  const [isSignUp, setIsSignUp]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  // Form fields
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      if (isSignUp) {
        await register(name, email, password, phone);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <nav className="bg-white border-b border-slate-100 px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <div onClick={() => navigate('/')} className="flex items-center gap-2 text-2xl font-black text-blue-800 italic cursor-pointer w-fit">
            <Truck size={32} /> SWIFTCARGO
          </div>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Truck className="text-blue-700" size={32} />
            </div>
            <h2 className="text-3xl font-black mb-2">{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
            <p className="text-slate-500 text-sm">
              {isSignUp ? 'Start shipping from the world to Kenya' : 'Login to manage your international shipments'}
            </p>
          </div>

          <div className="space-y-4">
            {error && <ErrorBanner message={error} onClose={() => setError('')} />}

            {isSignUp && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="Jane Nyambura"
                  className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {isSignUp && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Phone (M-Pesa)</label>
                <input
                  type="tel"
                  placeholder="+254 7XX XXX XXX"
                  className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
            )}

            <Button className="w-full h-14 text-lg" loading={loading} onClick={handleSubmit}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>

            <div className="text-center pt-2">
              <button
                className="text-blue-600 font-bold hover:underline text-sm"
                onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
              >
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

// ==========================================
// AUTHENTICATED DASHBOARD SHELL
// ==========================================
const DashboardShell = ({ user, navigate, path, logout }) => {
  const [orders,      setOrders]      = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError,   setOrdersError]   = useState('');

  const [activeMarket, setActiveMarket] = useState('UK');
  const [calcMarket,   setCalcMarket]   = useState('UK');
  const [calcWeight,   setCalcWeight]   = useState(1);
  const [calcResult,   setCalcResult]   = useState(null);
  const [calcLoading,  setCalcLoading]  = useState(false);

  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [copySuccess,  setCopySuccess]  = useState(false);

  // -------------------------------------------
  // Fetch orders from Railway on mount
  // -------------------------------------------
  useEffect(() => {
    if (path !== '/dashboard') return;
    setOrdersLoading(true);
    setOrdersError('');

    apiGet('/orders')
      .then(data => {
        // Handle { orders: [...] } or a plain array
        setOrders(Array.isArray(data) ? data : data.orders || []);
      })
      .catch(err => setOrdersError(err.message))
      .finally(() => setOrdersLoading(false));
  }, [path]);

  // -------------------------------------------
  // Shipping calculator
  // If your backend has a /calculate endpoint use apiPost,
  // otherwise the local formula below is used as fallback.
  // -------------------------------------------
  const shippingRates = {
    UK:    { rate: 12.50, currency: 'GBP', toKES: EXCHANGE_RATES.GBP_TO_KES },
    USA:   { rate: 15.00, currency: 'USD', toKES: EXCHANGE_RATES.USD_TO_KES },
    CHINA: { rate:  9.00, currency: 'USD', toKES: EXCHANGE_RATES.USD_TO_KES },
  };

  const calculateShipping = async () => {
    setCalcLoading(true);
    try {
      // Try the backend first
      const data = await apiPost('/calculate', { market: calcMarket, weight: calcWeight });
      setCalcResult({ foreign: data.foreign_cost, kes: data.kes_cost });
    } catch {
      // Fall back to local formula if endpoint doesn't exist yet
      const r = shippingRates[calcMarket];
      const foreign = r.rate * calcWeight;
      const kes     = foreign * r.toKES;
      setCalcResult({
        foreign: `${r.currency === 'GBP' ? '£' : '$'}${foreign.toFixed(2)}`,
        kes:     `KES ${kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      });
    } finally {
      setCalcLoading(false);
    }
  };

  const copyAddress = () => {
    const addr = WAREHOUSE_ADDRESSES[activeMarket];
    const text  = `${user.name} (${user.warehouse_id})\n${addr.address}\n${addr.city}, ${addr.postcode}\n${addr.country}`;
    navigator.clipboard?.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const menuItems = user.role === 'admin'
    ? [{ label: 'Operations', path: '/admin', icon: BarChart3 }]
    : [
        { label: 'Shipments',  path: '/dashboard',  icon: Package },
        { label: 'Calculator', path: '/calculator',  icon: Calculator },
        { label: 'Addresses',  path: '/addresses',   icon: MapPin },
      ];

  const statusColors = {
    received_at_warehouse: { bg: 'bg-green-100',  text: 'text-green-700'  },
    in_transit:            { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    processing:            { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    delivered:             { bg: 'bg-slate-100',  text: 'text-slate-700'  },
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`w-72 bg-slate-900 text-white flex flex-col p-8 fixed h-full z-50 transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center justify-between mb-12">
          <div className="text-2xl font-black italic text-blue-400 flex items-center gap-2"><Truck /> SWIFTCARGO</div>
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(false)}><X size={24} /></button>
        </div>

        <nav className="space-y-2 flex-1">
          {menuItems.map(item => (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl font-bold transition-all ${path === item.path ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
            >
              <item.icon size={20} /> {item.label}
            </button>
          ))}
        </nav>

        <div className="border-t border-slate-800 pt-6 mt-6 space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-sm">
              {(user.name || 'U').charAt(0)}
            </div>
            <div>
              <div className="text-sm font-bold">{user.name}</div>
              <div className="text-[10px] text-blue-400 font-mono">{user.warehouse_id}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full text-slate-500 font-bold flex items-center gap-2 hover:text-red-400 px-2 transition-colors">
            <LogOut size={18}/> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 md:ml-72 flex flex-col">
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} className="text-slate-600" />
            </button>
            <div className="font-bold text-slate-400 uppercase text-xs tracking-widest">
              {menuItems.find(m => m.path === path)?.label || 'Dashboard'}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-black text-slate-900">{user.name}</div>
              <div className="text-[10px] font-bold text-blue-600">{user.warehouse_id}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black">
              {(user.name || 'U').charAt(0)}
            </div>
          </div>
        </header>

        <main className="p-6 md:p-8 max-w-6xl mx-auto w-full">

          {/* ── SHIPMENTS ── */}
          {path === '/dashboard' && (
            <div className="space-y-8">
              <Card className="bg-blue-700 text-white border-none relative overflow-hidden">
                <div className="relative z-10">
                  <h2 className="text-3xl font-black mb-2">Welcome, {(user.name || '').split(' ')[0]}</h2>
                  <p className="text-blue-100 opacity-80">
                    Use your unique ID <span className="font-mono bg-white/20 px-2 py-0.5 rounded">{user.warehouse_id}</span> for all shopping.
                  </p>
                  <div className="flex gap-3 mt-6">
                    <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 text-sm px-4 py-2" onClick={() => navigate('/addresses')}>
                      <MapPin size={16} className="mr-2" /> View Addresses
                    </Button>
                    <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 text-sm px-4 py-2" onClick={() => navigate('/calculator')}>
                      <Calculator size={16} className="mr-2" /> Calculator
                    </Button>
                  </div>
                </div>
                <Truck size={180} className="absolute -bottom-12 -right-12 text-white/10 rotate-12" />
              </Card>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Shipments', val: orders.length, icon: Package, color: 'text-blue-600' },
                  { label: 'In Transit',      val: orders.filter(o => o.status === 'in_transit').length, icon: Truck, color: 'text-amber-600' },
                  { label: 'At Warehouse',    val: orders.filter(o => o.status === 'received_at_warehouse').length, icon: Box, color: 'text-green-600' },
                ].map((s, i) => (
                  <Card key={i}>
                    <div className="flex items-center gap-3">
                      <div className={s.color}><s.icon size={20} /></div>
                      <div>
                        <div className="text-2xl font-black">{s.val}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              <h3 className="text-2xl font-black text-slate-900">Your Shipments</h3>

              {ordersError && <ErrorBanner message={ordersError} onClose={() => setOrdersError('')} />}

              {ordersLoading ? (
                <Card className="text-center py-16">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-slate-400 font-bold">Loading your shipments…</p>
                </Card>
              ) : orders.length === 0 ? (
                <Card className="text-center py-16">
                  <Package className="mx-auto text-slate-300 mb-4" size={48} />
                  <h4 className="text-xl font-black text-slate-400 mb-2">No shipments yet</h4>
                  <p className="text-slate-400 mb-6">Start shopping and use your warehouse address at checkout</p>
                  <Button onClick={() => navigate('/addresses')}>Get Your Address</Button>
                </Card>
              ) : (
                <Card className="p-0 overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="p-4 font-black text-xs text-slate-500 uppercase">Order ID</th>
                        <th className="p-4 font-black text-xs text-slate-500 uppercase">Package</th>
                        <th className="p-4 font-black text-xs text-slate-500 uppercase">Market</th>
                        <th className="p-4 font-black text-xs text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => {
                        const style = statusColors[order.status] || statusColors.processing;
                        return (
                          <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-mono text-xs text-slate-500">{order.id}</td>
                            <td className="p-4">
                              <div className="font-bold">{order.retailer}</div>
                              <div className="text-[10px] font-mono text-blue-600">{order.tracking_number}</div>
                            </td>
                            <td className="p-4">
                              <span className="text-sm font-bold flex items-center gap-1">
                                <Globe size={14} className="text-slate-400" /> {order.market}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${style.bg} ${style.text}`}>
                                {order.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          )}

          {/* ── CALCULATOR ── */}
          {path === '/calculator' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Shipping Calculator</h2>
                <p className="text-slate-500">Get an instant estimate for your package.</p>
              </div>
              <div className="grid md:grid-cols-2 gap-8">
                <Card>
                  <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                    <Calculator className="text-blue-600" size={24} /> Rate Calculator
                  </h3>
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Shipping Market</label>
                      <select
                        className="w-full p-4 bg-slate-50 rounded-xl font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-600"
                        value={calcMarket}
                        onChange={e => setCalcMarket(e.target.value)}
                      >
                        <option value="UK">United Kingdom (£12.50/kg)</option>
                        <option value="USA">USA ($15.00/kg)</option>
                        <option value="CHINA">China ($9.00/kg)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Package Weight (kg)</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="w-full p-4 bg-slate-50 rounded-xl font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-600"
                        value={calcWeight}
                        onChange={e => setCalcWeight(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <Button className="w-full py-4 mt-2" loading={calcLoading} onClick={calculateShipping}>
                      <Calculator size={18} className="mr-2" /> Calculate Cost
                    </Button>
                  </div>
                </Card>

                <Card className={`flex flex-col justify-center text-center ${calcResult ? 'bg-slate-900 text-white' : 'bg-slate-50'}`}>
                  {calcResult ? (
                    <>
                      <p className="text-slate-400 font-bold uppercase text-xs mb-2">Estimated Shipping Cost</p>
                      <h4 className="text-5xl font-black text-blue-400 mb-2">{calcResult.kes}</h4>
                      <p className="text-slate-400 font-bold text-sm mb-6">({calcResult.foreign})</p>
                      <div className="text-[10px] text-slate-500 italic space-y-1">
                        <p>* Estimates include clearance and delivery within Nairobi.</p>
                        <p>* Upcountry delivery may incur additional charges.</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Calculator className="mx-auto text-slate-300 mb-4" size={48} />
                      <p className="text-slate-400 font-bold">Enter details and click calculate</p>
                    </>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ── ADDRESSES ── */}
          {path === '/addresses' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Your Warehouse Addresses</h2>
                <p className="text-slate-500">Use these addresses when shopping online. Always include your SC-ID.</p>
              </div>
              <div className="flex gap-2 p-1.5 bg-slate-200 rounded-2xl w-fit">
                {['UK', 'USA', 'CHINA'].map(m => (
                  <button
                    key={m}
                    onClick={() => setActiveMarket(m)}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMarket === m ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {m === 'UK' ? '🇬🇧 UK' : m === 'USA' ? '🇺🇸 USA' : '🇨🇳 China'}
                  </button>
                ))}
              </div>
              <Card>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Full Name / Attn</p>
                      <p className="font-black text-lg text-blue-700">{user.name} ({user.warehouse_id})</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Address Line 1</p>
                      <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].address}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">City / Postcode</p>
                      <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].city}, {WAREHOUSE_ADDRESSES[activeMarket].postcode}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Country</p>
                      <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].country}</p>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="font-bold text-amber-800 text-sm">Important</p>
                          <p className="text-amber-700 text-xs mt-1">
                            Always include your SC-ID <span className="font-mono font-bold">{user.warehouse_id}</span> in the Name field when shopping.
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button variant="secondary" className="w-full" onClick={copyAddress}>
                      {copySuccess ? <><CheckCircle size={18} className="mr-2" /> Copied!</> : 'Copy Full Address'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── ADMIN ── */}
          {path === '/admin' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-3xl font-black text-slate-900 mb-2">Operations Dashboard</h2>
                <p className="text-slate-500">Real-time overview of SwiftCargo logistics.</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Active Users',   val: '1,420',   icon: Users,       color: 'text-blue-600',  bg: 'bg-blue-50'  },
                  { label: 'Pending Pkgs',   val: '312',     icon: Box,         color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Daily Revenue',  val: 'KES 42K', icon: DollarSign,  color: 'text-green-600', bg: 'bg-green-50' },
                  { label: 'System Health',  val: 'Stable',  icon: ShieldCheck, color: 'text-cyan-600',  bg: 'bg-cyan-50'  },
                ].map((s, i) => (
                  <Card key={i}>
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center ${s.color}`}>
                        <s.icon size={24}/>
                      </div>
                      <div>
                        <div className="text-2xl font-black">{s.val}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <Card>
                <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                  <RefreshCcw className="text-blue-600" size={20} /> Bulk Arrival Update
                </h3>
                <div className="flex gap-4">
                  <input
                    className="flex-1 p-4 bg-slate-50 rounded-xl font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Scan or Enter Tracking Numbers (comma separated)"
                  />
                  <Button>
                    <CheckCircle size={18} className="mr-2" /> Mark Arrived
                  </Button>
                </div>
              </Card>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

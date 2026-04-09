import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import {
  Package, Truck, Calculator, Layers, LogOut, DollarSign,
  CheckCircle, Clock, AlertTriangle,
  Menu, X, Box, BarChart3, Users, Globe, ShieldCheck,
  ArrowRight, MapPin, RefreshCcw, TrendingUp, FileText,
  CreditCard, ShoppingBag, Zap, Anchor, Shield, Search,
  ChevronLeft, ChevronRight, Eye, Edit, Download, Bell,
  Activity, Database, Filter, UserCheck, UserX, Send
} from 'lucide-react';

// ==========================================
// CONFIGURATION
// ==========================================
const API_BASE = "https://thapsus-production.up.railway.app";

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
// ==========================================
const getToken  = () => localStorage.getItem('sc_token');
const saveToken = (t) => localStorage.setItem('sc_token', t);
const clearToken = () => localStorage.removeItem('sc_token');

const api = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };
  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.message || data.detail || `Request failed (${res.status})`);
  return data;
};

const apiGet    = (endpoint)       => api(endpoint, { method: 'GET' });
const apiPost   = (endpoint, body) => api(endpoint, { method: 'POST', body: JSON.stringify(body) });
const apiPut    = (endpoint, body) => api(endpoint, { method: 'PUT',  body: JSON.stringify(body) });

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

const Button = ({ children, variant = 'primary', className = '', loading = false, size = 'md', ...props }) => {
  const base = "inline-flex items-center justify-center font-bold rounded-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-6 py-3', lg: 'px-8 py-4 text-lg' };
  const variants = {
    primary:   "bg-blue-700 hover:bg-blue-800 text-white shadow-md shadow-blue-200",
    secondary: "bg-slate-900 hover:bg-black text-white shadow-md shadow-slate-300",
    outline:   "border-2 border-slate-900 text-slate-900 hover:bg-slate-50",
    ghost:     "text-slate-600 hover:bg-slate-100",
    danger:    "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-200",
    success:   "bg-green-600 hover:bg-green-700 text-white shadow-md shadow-green-200",
  };
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={loading} {...props}>
      {loading ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" /> : null}
      {children}
    </button>
  );
};

const ErrorBanner = ({ message, onClose }) => (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={18} />
    <div className="flex-1"><p className="text-red-700 font-bold text-sm">{message}</p></div>
    {onClose && <button onClick={onClose} className="text-red-400 hover:text-red-600"><X size={16} /></button>}
  </div>
);

const SuccessBanner = ({ message, onClose }) => (
  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
    <CheckCircle className="text-green-500 shrink-0 mt-0.5" size={18} />
    <div className="flex-1"><p className="text-green-700 font-bold text-sm">{message}</p></div>
    {onClose && <button onClick={onClose} className="text-green-400 hover:text-green-600"><X size={16} /></button>}
  </div>
);

const Spinner = () => (
  <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
);

const Badge = ({ children, color = 'slate' }) => {
  const colors = {
    slate:  'bg-slate-100 text-slate-700',
    blue:   'bg-blue-100 text-blue-700',
    green:  'bg-green-100 text-green-700',
    amber:  'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    purple: 'bg-purple-100 text-purple-700',
    cyan:   'bg-cyan-100 text-cyan-700',
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide ${colors[color] || colors.slate}`}>
      {children}
    </span>
  );
};

const statusBadgeColor = (status) => {
  const map = {
    pending:                'amber',
    received_at_warehouse:  'green',
    in_transit:             'blue',
    out_for_delivery:       'purple',
    delivered:              'slate',
    processing:             'cyan',
    open:                   'amber',
    resolved:               'green',
    closed:                 'slate',
    active:                 'green',
    inactive:               'red',
    completed:              'green',
    deposit:                'green',
    payment:                'blue',
    refund:                 'purple',
  };
  return map[status] || 'slate';
};

const Pagination = ({ page, totalPages, onPage }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
      <p className="text-xs font-bold text-slate-400">Page {page} of {totalPages}</p>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeft size={16} />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onPage(page + 1)} disabled={page >= totalPages}>
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
};

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
          <button onClick={() => navigate('/services')}     className="hover:text-blue-700 transition-colors">Services</button>
          <button onClick={() => navigate('/rates')}        className="hover:text-blue-700 transition-colors">Rates</button>
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
            <button onClick={() => navigate('/services')}     className="block text-slate-300 hover:text-white transition-colors font-medium">Services</button>
            <button onClick={() => navigate('/rates')}        className="block text-slate-300 hover:text-white transition-colors font-medium">Rates</button>
            <button onClick={() => navigate('/how-it-works')} className="block text-slate-300 hover:text-white transition-colors font-medium">How it Works</button>
          </div>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-4">Markets</h4>
          <div className="space-y-3 text-slate-300 font-medium">
            <p>United Kingdom</p><p>United States</p><p>China</p>
          </div>
        </div>
        <div>
          <h4 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-4">Contact</h4>
          <div className="space-y-3 text-slate-300 text-sm">
            <p>support@thapsus.uk</p><p>+254 700 000 000</p><p>Nairobi, Kenya</p>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-center text-slate-500 text-xs font-bold">
        &copy; {new Date().getFullYear()} Thapsus Cargo. All rights reserved.
      </div>
    </footer>
  );
};

// ==========================================
// PUBLIC PAGES
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
          { title: "Package Forwarding", desc: "Get unique addresses in UK, US, and China. We handle the rest.",             icon: ShoppingBag, color: "text-blue-600 bg-blue-50" },
          { title: "Consolidation",      desc: "Combine multiple orders into one box to save up to 70% on shipping fees.",  icon: Layers,      color: "text-purple-600 bg-purple-50" },
          { title: "Assisted Purchase",  desc: "Link us the item, we buy it for you and you pay us via M-Pesa.",            icon: CreditCard,  color: "text-green-600 bg-green-50" },
          { title: "Air Express",        desc: "5-10 day delivery from our global hubs directly to your door.",             icon: Zap,         color: "text-amber-600 bg-amber-50" },
          { title: "Sea Freight",        desc: "Cost-effective bulk shipping for large items and commercial goods.",         icon: Anchor,      color: "text-cyan-600 bg-cyan-50" },
          { title: "Customs Clearing",   desc: "We handle KRA paperwork and duties so you don't have to.",                  icon: Shield,      color: "text-red-600 bg-red-50" },
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
          { step: "1", title: "Get Your Address",   desc: "Sign up and get instant access to your unique TC-ID and warehouse addresses in UK, US, and China.",         icon: MapPin      },
          { step: "2", title: "Shop Online",        desc: "Shop on any global site. Use our warehouse address as your 'Shipping Address' at checkout.",              icon: ShoppingBag },
          { step: "3", title: "We Receive & Alert", desc: "Once your package arrives at our hub, we'll notify you. You can choose to ship now or wait to consolidate.", icon: CheckCircle },
          { step: "4", title: "Final Delivery",     desc: "Pay your shipping fees via M-Pesa. We handle the customs and deliver to your doorstep in Kenya.",           icon: Truck       },
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

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiGet('/auth/me')
      .then(data => setUser(data.user || data))
      .catch(() => clearToken());
  }, []);

  const navigate = (path) => { setCurrentPath(path); window.scrollTo(0, 0); };

  const login = async (email, password) => {
    const data  = await apiPost('/auth/login', { email, password });
    const token = data.token || data.access_token;
    if (token) saveToken(token);
    const profile = data.user || data;
    setUser(profile);
    navigate(profile.role === 'admin' ? '/admin' : '/dashboard');
  };

  const register = async (name, email, password, phone) => {
    const data  = await apiPost('/auth/register', { name, email, password, phone });
    const token = data.token || data.access_token;
    if (token) saveToken(token);
    const profile = data.user || data;
    setUser(profile);
    navigate('/dashboard');
  };

  const logout = async () => {
    try { await apiPost('/auth/logout', {}); } catch { /* ignore */ }
    clearToken();
    setUser(null);
    navigate('/');
  };

  const renderContent = () => {
    switch (currentPath) {
      case '/':
        return (
          <div className="bg-white">
            <PublicHeader />
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
                    {['Amazon Package','Shein Consolidation','UK Warehouse'].map((item, i) => (
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
      case '/services':     return <ServicesPage />;
      case '/rates':        return <RatesPage />;
      case '/how-it-works': return <HowItWorksPage />;
      case '/login':        return <LoginPage login={login} register={register} />;
      default:
        return user
          ? <DashboardShell user={user} navigate={navigate} path={currentPath} logout={logout} setUser={setUser} />
          : <LoginPage login={login} register={register} />;
    }
  };

  return (
    <NavigationContext.Provider value={{ navigate, currentPath }}>
      <AuthContext.Provider value={{ user, setUser }}>
        <div className="min-h-screen bg-white">{renderContent()}</div>
      </AuthContext.Provider>
    </NavigationContext.Provider>
  );
}

// ==========================================
// LOGIN / REGISTER PAGE
// ==========================================
const LoginPage = ({ login, register }) => {
  const { navigate } = useContext(NavigationContext);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [phone,    setPhone]    = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setLoading(true);
    try {
      if (isSignUp) await register(name, email, password, phone);
      else await login(email, password);
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
                <input type="text" placeholder="Jane Nyambura" className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Email Address</label>
              <input type="email" placeholder="you@example.com" className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Password</label>
              <input type="password" placeholder="••••••••" className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            {isSignUp && (
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Phone (M-Pesa)</label>
                <input type="tel" placeholder="+254 7XX XXX XXX" className="w-full p-4 bg-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 font-bold"
                  value={phone} onChange={e => setPhone(e.target.value)} />
              </div>
            )}
            <Button className="w-full h-14 text-lg" loading={loading} onClick={handleSubmit}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
            <div className="text-center pt-2">
              <button className="text-blue-600 font-bold hover:underline text-sm" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
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
const DashboardShell = ({ user, navigate, path, logout, setUser }) => {
  const [orders,        setOrders]        = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError,   setOrdersError]   = useState('');

  const [activeMarket, setActiveMarket] = useState('UK');
  const [calcMarket,   setCalcMarket]   = useState('UK');
  const [calcWeight,   setCalcWeight]   = useState(1);
  const [calcResult,   setCalcResult]   = useState(null);
  const [calcLoading,  setCalcLoading]  = useState(false);

  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [copySuccess, setCopySuccess]   = useState(false);

  useEffect(() => {
    if (path !== '/dashboard') return;
    setOrdersLoading(true);
    setOrdersError('');
    apiGet('/orders')
      .then(data => setOrders(Array.isArray(data) ? data : data.orders || []))
      .catch(err => setOrdersError(err.message))
      .finally(() => setOrdersLoading(false));
  }, [path]);

  const shippingRates = {
    UK:    { rate: 12.50, currency: 'GBP', toKES: EXCHANGE_RATES.GBP_TO_KES },
    USA:   { rate: 15.00, currency: 'USD', toKES: EXCHANGE_RATES.USD_TO_KES },
    CHINA: { rate:  9.00, currency: 'USD', toKES: EXCHANGE_RATES.USD_TO_KES },
  };

  const calculateShipping = async () => {
    setCalcLoading(true);
    try {
      const data = await apiPost('/pricing/calculate', { market: calcMarket, weight_kg: calcWeight });
      const pricing = data.pricing || data;
      setCalcResult({
        foreign: `${calcMarket === 'UK' ? '£' : '$'}${(pricing.summary?.total / (calcMarket === 'UK' ? EXCHANGE_RATES.GBP_TO_KES : EXCHANGE_RATES.USD_TO_KES)).toFixed(2)}`,
        kes: `KES ${(pricing.summary?.total || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      });
    } catch {
      const r = shippingRates[calcMarket];
      const foreign = r.rate * calcWeight;
      const kes = foreign * r.toKES;
      setCalcResult({
        foreign: `${r.currency === 'GBP' ? '£' : '$'}${foreign.toFixed(2)}`,
        kes: `KES ${kes.toLocaleString('en-KE', { minimumFractionDigits: 2 })}`,
      });
    } finally {
      setCalcLoading(false);
    }
  };

  const copyAddress = () => {
    const addr = WAREHOUSE_ADDRESSES[activeMarket];
    const text = `${user.name} (${user.warehouse_id})\n${addr.address}\n${addr.city}, ${addr.postcode}\n${addr.country}`;
    navigator.clipboard?.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const isAdmin = user.role === 'admin';

  const menuItems = isAdmin
    ? [
        { label: 'Overview',    path: '/admin',          icon: BarChart3   },
        { label: 'Users',       path: '/admin/users',     icon: Users       },
        { label: 'Orders',      path: '/admin/orders',    icon: Package     },
        { label: 'Tickets',     path: '/admin/tickets',   icon: Bell        },
        { label: 'Revenue',     path: '/admin/revenue',   icon: TrendingUp  },
        { label: 'System Logs', path: '/admin/logs',      icon: FileText    },
      ]
    : [
        { label: 'Shipments',   path: '/dashboard',  icon: Package    },
        { label: 'Calculator',  path: '/calculator', icon: Calculator },
        { label: 'Addresses',   path: '/addresses',  icon: MapPin     },
      ];

  return (
    <div className="flex min-h-screen bg-slate-50">
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`w-72 bg-slate-900 text-white flex flex-col p-8 fixed h-full z-50 transition-transform ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="flex items-center justify-between mb-12">
          <div className="text-2xl font-black italic text-blue-400 flex items-center gap-2"><Truck /> SWIFTCARGO</div>
          <button className="md:hidden text-slate-400" onClick={() => setSidebarOpen(false)}><X size={24} /></button>
        </div>
        <nav className="space-y-1 flex-1">
          {isAdmin && (
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3">Admin Panel</p>
          )}
          {menuItems.map(item => (
            <button key={item.path} onClick={() => { navigate(item.path); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 p-4 rounded-xl font-bold transition-all ${
                path === item.path ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
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
              <div className="text-[10px] text-blue-400 font-mono">{user.warehouse_id || user.role}</div>
            </div>
          </div>
          <button onClick={logout} className="w-full text-slate-500 font-bold flex items-center gap-2 hover:text-red-400 px-2 transition-colors">
            <LogOut size={18}/> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
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
            {isAdmin && (
              <div className="hidden sm:flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-full">
                <ShieldCheck size={14} />
                <span className="text-[10px] font-black uppercase">Admin</span>
              </div>
            )}
            <div className="text-right hidden sm:block">
              <div className="text-sm font-black text-slate-900">{user.name}</div>
              <div className="text-[10px] font-bold text-blue-600">{user.warehouse_id || user.email}</div>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black">
              {(user.name || 'U').charAt(0)}
            </div>
          </div>
        </header>

        <main className="p-6 md:p-8 max-w-7xl mx-auto w-full">

          {/* ── CUSTOMER SHIPMENTS ── */}
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
                <Card className="text-center py-16"><Spinner /><p className="text-slate-400 font-bold mt-4">Loading your shipments…</p></Card>
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
                        {['Order ID','Package','Market','Status'].map(h => (
                          <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => (
                        <tr key={order.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-mono text-xs text-slate-500">{order.id}</td>
                          <td className="p-4">
                            <div className="font-bold">{order.retailer}</div>
                            <div className="text-[10px] font-mono text-blue-600">{order.tracking_number}</div>
                          </td>
                          <td className="p-4"><span className="text-sm font-bold flex items-center gap-1"><Globe size={14} className="text-slate-400" /> {order.market}</span></td>
                          <td className="p-4"><Badge color={statusBadgeColor(order.status)}>{(order.status || '').replace(/_/g, ' ')}</Badge></td>
                        </tr>
                      ))}
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
                  <h3 className="text-xl font-black mb-6 flex items-center gap-2"><Calculator className="text-blue-600" size={24} /> Rate Calculator</h3>
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Shipping Market</label>
                      <select className="w-full p-4 bg-slate-50 rounded-xl font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-600"
                        value={calcMarket} onChange={e => setCalcMarket(e.target.value)}>
                        <option value="UK">United Kingdom (£12.50/kg)</option>
                        <option value="USA">USA ($15.00/kg)</option>
                        <option value="CHINA">China ($9.00/kg)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-400 uppercase block mb-2">Package Weight (kg)</label>
                      <input type="number" min="0.1" step="0.1" className="w-full p-4 bg-slate-50 rounded-xl font-bold border border-slate-200 outline-none focus:ring-2 focus:ring-blue-600"
                        value={calcWeight} onChange={e => setCalcWeight(parseFloat(e.target.value) || 0)} />
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
                    <><Calculator className="mx-auto text-slate-300 mb-4" size={48} />
                    <p className="text-slate-400 font-bold">Enter details and click calculate</p></>
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
                <p className="text-slate-500">Use these addresses when shopping online. Always include your TC-ID.</p>
              </div>
              <div className="flex gap-2 p-1.5 bg-slate-200 rounded-2xl w-fit">
                {['UK','USA','CHINA'].map(m => (
                  <button key={m} onClick={() => setActiveMarket(m)}
                    className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      activeMarket === m ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {m === 'UK' ? '🇬🇧 UK' : m === 'USA' ? '🇺🇸 USA' : '🇨🇳 China'}
                  </button>
                ))}
              </div>
              <Card>
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {[['Full Name / Attn', <p className="font-black text-lg text-blue-700">{user.name} ({user.warehouse_id})</p>],
                      ['Address Line 1', <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].address}</p>],
                      ['City / Postcode', <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].city}, {WAREHOUSE_ADDRESSES[activeMarket].postcode}</p>],
                      ['Country', <p className="font-black text-lg">{WAREHOUSE_ADDRESSES[activeMarket].country}</p>]
                    ].map(([label, content], i) => (
                      <div key={i}><p className="text-[10px] font-black text-slate-400 uppercase mb-1">{label}</p>{content}</div>
                    ))}
                  </div>
                  <div className="flex flex-col justify-between">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="font-bold text-amber-800 text-sm">Important</p>
                          <p className="text-amber-700 text-xs mt-1">
                            Always include your TC-ID <span className="font-mono font-bold">{user.warehouse_id}</span> in the Name field when shopping.
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

          {/* ══════════════════════════════════════
              ADMIN SECTION — fully live API
          ══════════════════════════════════════ */}
          {path.startsWith('/admin') && isAdmin && (
            <AdminSection path={path} navigate={navigate} />
          )}

        </main>
      </div>
    </div>
  );
};

// ==========================================
// ADMIN SECTION — parent wrapper
// ==========================================
const AdminSection = ({ path, navigate }) => {
  switch (path) {
    case '/admin':         return <AdminOverview  navigate={navigate} />;
    case '/admin/users':   return <AdminUsers     navigate={navigate} />;
    case '/admin/orders':  return <AdminOrders    navigate={navigate} />;
    case '/admin/tickets': return <AdminTickets   navigate={navigate} />;
    case '/admin/revenue': return <AdminRevenue   navigate={navigate} />;
    case '/admin/logs':    return <AdminLogs      navigate={navigate} />;
    default:               return <AdminOverview  navigate={navigate} />;
  }
};

// ==========================================
// ADMIN OVERVIEW — GET /admin/stats
// ==========================================
const AdminOverview = ({ navigate }) => {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [dbOk,    setDbOk]    = useState(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/admin/stats');
      setStats(data.stats || data);
      setDbOk(true);
    } catch (err) {
      setError(err.message);
      setDbOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  if (loading) return <div className="flex flex-col items-center justify-center py-32 gap-4"><Spinner /><p className="text-slate-400 font-bold">Loading dashboard data…</p></div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900">Operations Overview</h2>
          <p className="text-slate-500 mt-1">Real-time data from the Thapsus Cargo database.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black ${
            dbOk === true  ? 'bg-green-50 text-green-700' :
            dbOk === false ? 'bg-red-50 text-red-700' :
            'bg-slate-100 text-slate-500'}`}>
            <Database size={12} />
            {dbOk === true ? 'DB Connected' : dbOk === false ? 'DB Error' : 'Checking…'}
          </div>
          <Button variant="ghost" size="sm" onClick={loadStats}><RefreshCcw size={16} className="mr-1" /> Refresh</Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError('')} />}

      {/* KPI Cards */}
      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { label: 'Total Users',      val: stats.users?.total              ?? '–', icon: Users,       color: 'text-blue-600',  bg: 'bg-blue-50'  },
              { label: 'Active Users',     val: stats.users?.active_users       ?? '–', icon: UserCheck,   color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Total Orders',     val: stats.orders?.total_orders      ?? '–', icon: Package,     color: 'text-purple-600',bg: 'bg-purple-50'},
              { label: 'In Transit',       val: stats.orders?.in_transit        ?? '–', icon: Truck,       color: 'text-amber-600', bg: 'bg-amber-50' },
              { label: 'Pending Orders',   val: stats.orders?.pending           ?? '–', icon: Clock,       color: 'text-orange-600',bg: 'bg-orange-50'},
              { label: 'Delivered',        val: stats.orders?.delivered         ?? '–', icon: CheckCircle, color: 'text-teal-600',  bg: 'bg-teal-50'  },
              { label: 'Total Revenue',    val: stats.revenue?.total_revenue    ? `KES ${(stats.revenue.total_revenue/1000).toFixed(0)}K` : '–', icon: DollarSign,  color: 'text-green-700', bg: 'bg-green-50' },
              { label: 'Avg Order Value',  val: stats.orders?.avg_estimated_cost ? `KES ${Math.round(stats.orders.avg_estimated_cost).toLocaleString()}` : '–', icon: TrendingUp,  color: 'text-cyan-600',  bg: 'bg-cyan-50'  },
            ].map((s, i) => (
              <Card key={i}>
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 ${s.bg} rounded-xl flex items-center justify-center ${s.color}`}>
                    <s.icon size={22} />
                  </div>
                  <div>
                    <div className="text-2xl font-black">{s.val}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Markets breakdown */}
          {stats.markets && stats.markets.length > 0 && (
            <Card>
              <h3 className="text-lg font-black mb-5 flex items-center gap-2"><Globe className="text-blue-600" size={20} /> Orders by Market</h3>
              <div className="grid sm:grid-cols-3 gap-4">
                {stats.markets.map((m, i) => (
                  <div key={i} className="bg-slate-50 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="font-black text-slate-900">{m.market || m.name || m._id}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">orders</p>
                    </div>
                    <span className="text-2xl font-black text-blue-700">{m.count || m.total || 0}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Order statuses */}
          {stats.order_statuses && stats.order_statuses.length > 0 && (
            <Card>
              <h3 className="text-lg font-black mb-5 flex items-center gap-2"><Activity className="text-blue-600" size={20} /> Order Status Breakdown</h3>
              <div className="space-y-3">
                {stats.order_statuses.map((s, i) => {
                  const total = stats.orders?.total_orders || 1;
                  const pct   = Math.round(((s.count || s.total || 0) / total) * 100);
                  return (
                    <div key={i} className="flex items-center gap-4">
                      <div className="w-32 shrink-0">
                        <Badge color={statusBadgeColor(s.status || s._id)}>{(s.status || s._id || '').replace(/_/g, ' ')}</Badge>
                      </div>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className="bg-blue-600 rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-black text-slate-700 w-10 text-right">{s.count || s.total || 0}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Quick actions */}
          <Card>
            <h3 className="text-lg font-black mb-5 flex items-center gap-2"><Zap className="text-blue-600" size={20} /> Quick Actions</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <Button variant="outline" onClick={() => navigate('/admin/users')}   className="justify-start gap-3"><Users size={18} /> Manage Users</Button>
              <Button variant="outline" onClick={() => navigate('/admin/orders')}  className="justify-start gap-3"><Package size={18} /> View All Orders</Button>
              <Button variant="outline" onClick={() => navigate('/admin/tickets')} className="justify-start gap-3"><Bell size={18} /> Open Tickets</Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

// ==========================================
// ADMIN USERS — GET /admin/users, PUT /admin/users/{id}
// ==========================================
const AdminUsers = () => {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [page,    setPage]    = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search,  setSearch]  = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editUser,   setEditUser]   = useState(null);
  const [saving,     setSaving]     = useState(false);

  const loadUsers = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      let url = `/admin/users?page=${p}&limit=15`;
      if (search)     url += `&search=${encodeURIComponent(search)}`;
      if (roleFilter) url += `&role=${roleFilter}`;
      const data = await apiGet(url);
      setUsers(data.users || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => { loadUsers(1); }, [loadUsers]);

  const saveUser = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await apiPut(`/admin/users/${editUser.id}`, {
        role:      editUser.role,
        is_active: editUser.is_active,
      });
      setSuccess('User updated successfully.');
      setEditUser(null);
      loadUsers(page);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-black text-slate-900">User Management</h2>
          <p className="text-slate-500 mt-1">View and manage all registered users.</p></div>
        <Button variant="ghost" size="sm" onClick={() => loadUsers(page)}><RefreshCcw size={16} className="mr-1" /> Refresh</Button>
      </div>

      {error   && <ErrorBanner   message={error}   onClose={() => setError('')}   />}
      {success && <SuccessBanner message={success} onClose={() => setSuccess('')} />}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
          value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="customer">Customer</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {/* Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black">Edit User</h3>
              <button onClick={() => setEditUser(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Name</p>
                <p className="font-black text-slate-900">{editUser.name}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-1">Email</p>
                <p className="font-bold text-slate-600">{editUser.email}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Role</label>
                <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-600"
                  value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}>
                  <option value="customer">Customer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="active" className="w-4 h-4 accent-blue-600"
                  checked={editUser.is_active !== false} onChange={e => setEditUser({ ...editUser, is_active: e.target.checked })} />
                <label htmlFor="active" className="font-bold text-slate-700 text-sm">Account Active</label>
              </div>
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" loading={saving} onClick={saveUser}>Save Changes</Button>
                <Button variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card className="text-center py-16"><Spinner /></Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Name','Email','Warehouse ID','Role','Status','Joined','Actions'].map(h => (
                  <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-16 text-slate-400 font-bold">No users found.</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="p-4 font-bold">{u.name}</td>
                  <td className="p-4 text-sm text-slate-600">{u.email}</td>
                  <td className="p-4 font-mono text-xs text-blue-600">{u.warehouse_id || '–'}</td>
                  <td className="p-4"><Badge color={u.role === 'admin' ? 'red' : 'blue'}>{u.role}</Badge></td>
                  <td className="p-4"><Badge color={u.is_active !== false ? 'green' : 'red'}>{u.is_active !== false ? 'Active' : 'Inactive'}</Badge></td>
                  <td className="p-4 text-xs text-slate-500 whitespace-nowrap">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '–'}</td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm" onClick={() => setEditUser({ ...u })}>
                      <Edit size={14} className="mr-1" /> Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 pb-4">
            <Pagination page={page} totalPages={totalPages} onPage={p => loadUsers(p)} />
          </div>
        </Card>
      )}
    </div>
  );
};

// ==========================================
// ADMIN ORDERS — GET /admin/orders, PUT /admin/orders/bulk-update
// ==========================================
const AdminOrders = () => {
  const [orders,   setOrders]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [page,     setPage]     = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [marketFilter, setMarketFilter] = useState('');
  const [selected,     setSelected]     = useState([]);
  const [bulkStatus,   setBulkStatus]   = useState('in_transit');
  const [bulkLoading,  setBulkLoading]  = useState(false);

  // Payment request / reminder modal
  const [paymentModal,   setPaymentModal]   = useState(null); // { order, type: 'request'|'reminder' }
  const [paymentAmount,  setPaymentAmount]  = useState('');
  const [paymentNotes,   setPaymentNotes]   = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const loadOrders = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      let url = `/admin/orders?page=${p}&limit=15`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (marketFilter) url += `&market=${marketFilter}`;
      const data = await apiGet(url);
      setOrders(data.orders || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
      setSelected([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, marketFilter]);

  useEffect(() => { loadOrders(1); }, [loadOrders]);

  const toggleSelect = (id) =>
    setSelected(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const toggleAll = () =>
    setSelected(selected.length === orders.length ? [] : orders.map(o => o.id));

  const bulkUpdate = async () => {
    if (!selected.length) { setError('Select at least one order.'); return; }
    setBulkLoading(true);
    try {
      const res = await apiPut('/admin/orders/bulk-update', { order_ids: selected, status: bulkStatus });
      setSuccess(`${res.updated_count || selected.length} order(s) updated to "${bulkStatus}".`);
      loadOrders(page);
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const openPaymentModal = (order, type) => {
    setPaymentModal({ order, type });
    setPaymentAmount(order.actual_cost || order.estimated_cost || '');
    setPaymentNotes('');
  };

  const sendPaymentAction = async () => {
    if (!paymentModal) return;
    const { order, type } = paymentModal;
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    const endpoint = type === 'request'
      ? `/admin/orders/${order.id}/request-payment`
      : `/admin/orders/${order.id}/send-reminder`;
    setPaymentLoading(true);
    try {
      const res = await apiPost(endpoint, {
        amount: parseFloat(paymentAmount),
        notes:  paymentNotes || undefined,
      });
      setSuccess(res.message || `${type === 'request' ? 'Payment request' : 'Payment reminder'} sent to ${order.email}.`);
      if (res.email_warning) setError(res.email_warning);
      setPaymentModal(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-black text-slate-900">All Orders</h2>
          <p className="text-slate-500 mt-1">Filter, inspect, and bulk-update shipment orders.</p></div>
        <Button variant="ghost" size="sm" onClick={() => loadOrders(page)}><RefreshCcw size={16} className="mr-1" /> Refresh</Button>
      </div>

      {error   && <ErrorBanner   message={error}   onClose={() => setError('')}   />}
      {success && <SuccessBanner message={success} onClose={() => setSuccess('')} />}

      {/* Payment Request / Reminder Modal */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black/50 z-60 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-black flex items-center gap-2">
                {paymentModal.type === 'request'
                  ? <><DollarSign size={20} className="text-green-600" /> Payment Request</>
                  : <><Bell size={20} className="text-amber-600" /> Payment Reminder</>}
              </h3>
              <button onClick={() => setPaymentModal(null)} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 text-sm">
                <p className="font-black text-slate-700">{paymentModal.order.tracking_number}</p>
                <p className="text-slate-500 mt-0.5">{paymentModal.order.name || paymentModal.order.email}</p>
                <p className="text-xs text-blue-600 mt-0.5">{paymentModal.order.email}</p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Amount (KES)</label>
                <input
                  type="number"
                  min="1"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Enter amount in KES"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Note for customer (optional)</label>
                <textarea
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-600 resize-none"
                  rows={3}
                  placeholder="Add a note for the customer…"
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  className="flex-1"
                  variant={paymentModal.type === 'request' ? 'success' : 'primary'}
                  loading={paymentLoading}
                  onClick={sendPaymentAction}
                >
                  <Send size={16} className="mr-2" />
                  {paymentModal.type === 'request' ? 'Send Request' : 'Send Reminder'}
                </Button>
                <Button variant="ghost" onClick={() => setPaymentModal(null)}>Cancel</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters + Bulk */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {['pending','received_at_warehouse','processing','in_transit','out_for_delivery','delivered'].map(s => (
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
          ))}
        </select>
        <select className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
          value={marketFilter} onChange={e => setMarketFilter(e.target.value)}>
          <option value="">All Markets</option>
          {['UK','USA','CHINA'].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-auto bg-blue-50 border border-blue-200 rounded-xl px-4 py-2">
            <span className="text-sm font-bold text-blue-700">{selected.length} selected</span>
            <select className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg font-bold text-sm outline-none"
              value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}>
              {['pending','received_at_warehouse','processing','in_transit','out_for_delivery','delivered'].map(s => (
                <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
              ))}
            </select>
            <Button size="sm" loading={bulkLoading} onClick={bulkUpdate}>
              <CheckCircle size={14} className="mr-1" /> Update
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <Card className="text-center py-16"><Spinner /></Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-4"><input type="checkbox" className="accent-blue-600" checked={selected.length === orders.length && orders.length > 0} onChange={toggleAll} /></th>
                {['Tracking','Customer','Retailer','Market','Weight','Status','Date','Actions'].map(h => (
                  <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-16 text-slate-400 font-bold">No orders found.</td></tr>
              ) : orders.map(o => (
                <tr key={o.id} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                  selected.includes(o.id) ? 'bg-blue-50' : ''}`}>
                  <td className="p-4"><input type="checkbox" className="accent-blue-600" checked={selected.includes(o.id)} onChange={() => toggleSelect(o.id)} /></td>
                  <td className="p-4 font-mono text-xs text-blue-600">{o.tracking_number}</td>
                  <td className="p-4 text-sm font-bold">{o.name || o.user?.name || o.user_id || '–'}</td>
                  <td className="p-4 font-bold">{o.retailer}</td>
                  <td className="p-4"><Badge color={o.market === 'UK' ? 'blue' : o.market === 'USA' ? 'purple' : 'amber'}>{o.market}</Badge></td>
                  <td className="p-4 text-sm">{o.weight_kg ? `${o.weight_kg} kg` : '–'}</td>
                  <td className="p-4"><Badge color={statusBadgeColor(o.status)}>{(o.status || '').replace(/_/g,' ')}</Badge></td>
                  <td className="p-4 text-xs text-slate-500 whitespace-nowrap">{o.created_at ? new Date(o.created_at).toLocaleDateString() : '–'}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-1">
                      <button
                        title="Send Payment Request"
                        onClick={() => openPaymentModal(o, 'request')}
                        className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
                      >
                        <DollarSign size={16} />
                      </button>
                      <button
                        title="Send Payment Reminder"
                        onClick={() => openPaymentModal(o, 'reminder')}
                        className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <Bell size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 pb-4">
            <Pagination page={page} totalPages={totalPages} onPage={p => loadOrders(p)} />
          </div>
        </Card>
      )}
    </div>
  );
};

// ==========================================
// ADMIN TICKETS — GET /tickets (admin sees all), PUT /tickets/{id}/status
// ==========================================
const AdminTickets = () => {
  const [tickets,  setTickets]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [page,     setPage]     = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter,   setFilter]   = useState('');
  const [active,   setActive]   = useState(null); // selected ticket
  const [reply,    setReply]    = useState('');
  const [messages, setMessages] = useState([]);
  const [sending,  setSending]  = useState(false);
  const [newStatus, setNewStatus] = useState('resolved');
  const [updating,  setUpdating]  = useState(false);

  const loadTickets = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      let url = `/tickets?page=${p}&limit=15`;
      if (filter) url += `&status=${filter}`;
      const data = await apiGet(url);
      setTickets(data.tickets || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadTickets(1); }, [loadTickets]);

  const openTicket = async (ticket) => {
    setActive(ticket);
    setNewStatus(ticket.status === 'open' ? 'resolved' : ticket.status);
    try {
      const data = await apiGet(`/tickets/${ticket.id}`);
      setMessages(data.messages || []);
    } catch { setMessages([]); }
  };

  const sendReply = async () => {
    if (!reply.trim() || !active) return;
    setSending(true);
    try {
      await apiPost(`/tickets/${active.id}/message`, { message: reply });
      setReply('');
      const data = await apiGet(`/tickets/${active.id}`);
      setMessages(data.messages || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async () => {
    if (!active) return;
    setUpdating(true);
    try {
      await apiPut(`/tickets/${active.id}/status`, { status: newStatus });
      setSuccess(`Ticket marked as "${newStatus}".`);
      setActive(null);
      loadTickets(page);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-black text-slate-900">Support Tickets</h2>
          <p className="text-slate-500 mt-1">Manage customer support requests.</p></div>
        <Button variant="ghost" size="sm" onClick={() => loadTickets(page)}><RefreshCcw size={16} className="mr-1" /> Refresh</Button>
      </div>

      {error   && <ErrorBanner   message={error}   onClose={() => setError('')}   />}
      {success && <SuccessBanner message={success} onClose={() => setSuccess('')} />}

      {/* Ticket detail modal */}
      {active && (
        <div className="fixed inset-0 bg-black/60 z-60 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-xl font-black">{active.subject}</h3>
                <div className="flex gap-2 mt-2">
                  <Badge color={statusBadgeColor(active.status)}>{active.status}</Badge>
                  <Badge color={active.priority === 'high' ? 'red' : active.priority === 'medium' ? 'amber' : 'slate'}>{active.priority}</Badge>
                </div>
              </div>
              <button onClick={() => setActive(null)} className="text-slate-400 hover:text-slate-700 mt-1"><X size={20} /></button>
            </div>
            <p className="text-slate-600 text-sm mb-6 bg-slate-50 rounded-xl p-4">{active.description}</p>
            {/* Messages */}
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
              {messages.map((msg, i) => (
                <div key={i} className={`p-3 rounded-xl text-sm ${
                  msg.role === 'admin' ? 'bg-blue-50 text-blue-900 ml-8' : 'bg-slate-50 text-slate-700 mr-8'}`}>
                  <p className="font-black text-xs mb-1 opacity-60">{msg.name || msg.email} · {msg.role}</p>
                  <p>{msg.message}</p>
                </div>
              ))}
            </div>
            {/* Reply */}
            <div className="flex gap-2 mb-6">
              <input className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-600"
                placeholder="Type a reply…" value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendReply()} />
              <Button size="sm" loading={sending} onClick={sendReply}><Send size={14} className="mr-1" /> Send</Button>
            </div>
            {/* Update status */}
            <div className="flex gap-3 pt-4 border-t border-slate-100">
              <select className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none"
                value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                {['open','in_progress','resolved','closed'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                ))}
              </select>
              <Button loading={updating} onClick={updateStatus}>Update Status</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="flex gap-3">
        {['','open','in_progress','resolved','closed'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              filter === s ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {s === '' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {loading ? <Card className="text-center py-16"><Spinner /></Card> : (
        <Card className="p-0">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Subject','User','Priority','Status','Created','Action'].map(h => (
                  <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tickets.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-16 text-slate-400 font-bold">No tickets found.</td></tr>
              ) : tickets.map(t => (
                <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 font-bold text-sm">{t.subject}</td>
                  <td className="p-4 text-sm text-slate-600">{t.user?.email || t.user_id || '–'}</td>
                  <td className="p-4"><Badge color={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'slate'}>{t.priority}</Badge></td>
                  <td className="p-4"><Badge color={statusBadgeColor(t.status)}>{t.status}</Badge></td>
                  <td className="p-4 text-xs text-slate-500">{t.created_at ? new Date(t.created_at).toLocaleDateString() : '–'}</td>
                  <td className="p-4">
                    <Button variant="ghost" size="sm" onClick={() => openTicket(t)}>
                      <Eye size={14} className="mr-1" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 pb-4"><Pagination page={page} totalPages={totalPages} onPage={p => loadTickets(p)} /></div>
        </Card>
      )}
    </div>
  );
};

// ==========================================
// ADMIN REVENUE — GET /admin/revenue, GET /admin/revenue/export
// ==========================================
const AdminRevenue = () => {
  const [revenue,   setRevenue]   = useState([]);
  const [summary,   setSummary]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate,   setEndDate]   = useState(() => new Date().toISOString().split('T')[0]);
  const [exporting, setExporting] = useState(false);

  const loadRevenue = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/admin/revenue?startDate=${startDate}&endDate=${endDate}`);
      setRevenue(data.revenue  || []);
      setSummary(data.summary  || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { loadRevenue(); }, [loadRevenue]);

  const exportCSV = async () => {
    setExporting(true);
    try {
      const token = getToken();
      const res   = await fetch(`${API_BASE}/admin/revenue/export?startDate=${startDate}&endDate=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `revenue-${startDate}-${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const totalRevenue = revenue.reduce((sum, r) => sum + (r.total || r.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h2 className="text-3xl font-black text-slate-900">Revenue Report</h2>
          <p className="text-slate-500 mt-1">Financial overview with date-range filtering.</p></div>
        <Button variant="outline" size="sm" loading={exporting} onClick={exportCSV}>
          <Download size={16} className="mr-2" /> Export CSV
        </Button>
      </div>

      {error && <ErrorBanner message={error} onClose={() => setError('')} />}

      {/* Date range */}
      <Card>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Start Date</label>
            <input type="date" className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-600"
              value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase block mb-1">End Date</label>
            <input type="date" className="p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-600"
              value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <Button onClick={loadRevenue} loading={loading}><Filter size={16} className="mr-2" /> Apply</Button>
        </div>
      </Card>

      {/* Summary by method */}
      {summary.length > 0 && (
        <div className="grid sm:grid-cols-3 gap-4">
          {summary.map((s, i) => (
            <Card key={i}>
              <p className="text-xs font-black text-slate-400 uppercase mb-1">{s.payment_method || s.method || 'Total'}</p>
              <p className="text-3xl font-black text-slate-900">KES {(s.total || s.amount || 0).toLocaleString()}</p>
              <p className="text-xs text-slate-500 mt-1">{s.count || s.transactions || 0} transactions</p>
            </Card>
          ))}
        </div>
      )}

      {/* KES total */}
      <Card className="bg-slate-900 text-white border-none">
        <p className="text-slate-400 font-bold uppercase text-xs mb-2">Total Revenue in Period</p>
        <p className="text-5xl font-black text-green-400">KES {totalRevenue.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</p>
      </Card>

      {/* Daily table */}
      {loading ? <Card className="text-center py-16"><Spinner /></Card> : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Date','Transactions','Revenue (KES)','Method'].map(h => (
                  <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {revenue.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-400 font-bold">No revenue data for this period.</td></tr>
              ) : revenue.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-4 font-bold">{r.date || r.created_at ? new Date(r.date || r.created_at).toLocaleDateString() : '–'}</td>
                  <td className="p-4 text-sm">{r.count || r.transactions || 1}</td>
                  <td className="p-4 font-black text-green-700">KES {(r.total || r.amount || 0).toLocaleString()}</td>
                  <td className="p-4"><Badge color={statusBadgeColor(r.payment_method || r.type || 'deposit')}>{r.payment_method || r.type || '–'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
};

// ==========================================
// ADMIN LOGS — GET /admin/logs
// ==========================================
const AdminLogs = () => {
  const [logs,     setLogs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadLogs = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet(`/admin/logs?page=${p}&limit=20`);
      setLogs(data.logs || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setPage(p);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(1); }, [loadLogs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h2 className="text-3xl font-black text-slate-900">System Logs</h2>
          <p className="text-slate-500 mt-1">Audit trail of all admin and system actions.</p></div>
        <Button variant="ghost" size="sm" onClick={() => loadLogs(1)}><RefreshCcw size={16} className="mr-1" /> Refresh</Button>
      </div>
      {error && <ErrorBanner message={error} onClose={() => setError('')} />}
      {loading ? <Card className="text-center py-16"><Spinner /></Card> : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Timestamp','Action','User','Details'].map(h => (
                  <th key={h} className="p-4 font-black text-xs text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-400 font-bold">No logs available.</td></tr>
              ) : logs.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 font-mono text-xs">
                  <td className="p-4 text-slate-500 whitespace-nowrap">{l.created_at ? new Date(l.created_at).toLocaleString() : '–'}</td>
                  <td className="p-4 font-black text-slate-800">{l.action || l.type || '–'}</td>
                  <td className="p-4 text-slate-600">{l.user?.email || l.user_id || l.admin || '–'}</td>
                  <td className="p-4 text-slate-500 max-w-xs truncate">{l.details ? (typeof l.details === 'object' ? JSON.stringify(l.details) : l.details) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 pb-4"><Pagination page={page} totalPages={totalPages} onPage={p => loadLogs(p)} /></div>
        </Card>
      )}
    </div>
  );
};

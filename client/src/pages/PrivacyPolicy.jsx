import React from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, Zap } from 'lucide-react'

const LiquidBlob = ({ className, color }) => (
  <div className={`absolute blur-[120px] rounded-full mix-blend-multiply opacity-50 animate-morph pointer-events-none ${className} ${color}`} />
)

const GlassCard = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-[2rem] bg-white/40 backdrop-blur-2xl border border-white/40 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
    <div className="relative z-10">{children}</div>
  </div>
)

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="text-xl font-black text-[#0f172a] tracking-tighter uppercase mb-4 flex items-center gap-3">
      <span className="w-1.5 h-6 bg-orange-500 rounded-full shrink-0" />
      {title}
    </h2>
    <div className="text-slate-600 font-medium text-sm leading-relaxed space-y-3">{children}</div>
  </div>
)

export const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 overflow-x-hidden relative">
      <style>{`
        @keyframes morph {
          0%   { transform: translate(0,0)       scale(1);   }
          33%  { transform: translate(30px,-50px) scale(1.1);}
          66%  { transform: translate(-20px,20px) scale(0.9);}
          100% { transform: translate(0,0)       scale(1);   }
        }
        .animate-morph { animation: morph 14s ease-in-out infinite; }
        @keyframes sheen {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%)  skewX(-15deg); }
        }
        .glass-sheen { position: relative; overflow: hidden; }
        .glass-sheen::after {
          content:''; position:absolute; top:0; left:0; width:50%; height:100%;
          background: linear-gradient(to right,transparent,rgba(255,255,255,0.3),transparent);
          animation: sheen 4s infinite;
        }
      `}</style>

      <LiquidBlob className="top-[-10%] left-[-5%]  w-[500px] h-[500px]" color="bg-blue-200"   />
      <LiquidBlob className="bottom-[5%] right-[-5%] w-[600px] h-[600px]" color="bg-orange-100" />
      <div className="absolute inset-0 bg-white/20 backdrop-blur-[2px] pointer-events-none" />

      <div className="max-w-3xl mx-auto px-6 py-12 lg:py-20 relative z-10">

        {/* Back */}
        <Link to="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-orange-500 font-black uppercase tracking-widest text-[10px] mb-10 transition-all group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/60 backdrop-blur-md border border-white/50 text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 shadow-sm">
            <Zap size={10} className="text-orange-500" />
            Legal Document
          </div>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-[#0f172a] rounded-2xl flex items-center justify-center shadow-xl shrink-0">
              <ShieldCheck size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
                Privacy Policy
              </h1>
              <p className="text-slate-500 font-bold text-sm mt-2">Last updated: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Content card */}
        <GlassCard className="p-8 md:p-12">

          <p className="text-slate-600 font-medium text-sm leading-relaxed mb-10">
            Thapsus Cargo ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains what data we collect, why we collect it, and how we use and protect it when you use our platform at <span className="font-black text-[#0f172a]">thapsus.uk</span>.
          </p>

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us, including:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-slate-800">Account information</strong> — name, email address, phone number, and password when you register.</li>
              <li><strong className="text-slate-800">Order information</strong> — shipment details, retailer name, package descriptions, weight, dimensions, and declared value.</li>
              <li><strong className="text-slate-800">Payment information</strong> — M-Pesa transaction references and payment amounts. We do not store full card numbers.</li>
              <li><strong className="text-slate-800">Communications</strong> — messages you send via our support ticket system or email.</li>
            </ul>
            <p className="mt-3">We also collect information automatically, such as IP addresses, browser type, device identifiers, and usage data through cookies and similar technologies.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Process and fulfil your shipping orders and provide real-time tracking updates.</li>
              <li>Send you transactional communications including order confirmations, status updates, and payment receipts.</li>
              <li>Respond to your support requests and improve our customer service.</li>
              <li>Detect and prevent fraud, abuse, and other security issues.</li>
              <li>Comply with applicable laws, customs regulations, and legal obligations.</li>
              <li>Send you service-related notifications (with your consent where required).</li>
            </ul>
          </Section>

          <Section title="3. Sharing of Information">
            <p>We do not sell your personal information. We may share your data with:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-slate-800">Service providers</strong> — third-party logistics partners, courier services, payment processors (e.g. M-Pesa/Safaricom), and cloud infrastructure providers who process data on our behalf.</li>
              <li><strong className="text-slate-800">Customs & regulatory authorities</strong> — as required by UK and Kenyan customs law for international shipments.</li>
              <li><strong className="text-slate-800">Legal requirements</strong> — when we believe disclosure is required by law, court order, or to protect the rights and safety of Thapsus Cargo, our users, or the public.</li>
            </ul>
          </Section>

          <Section title="4. Data Retention">
            <p>We retain your personal information for as long as your account is active or as needed to provide you with services. Order records are retained for a minimum of seven (7) years in compliance with UK accounting and tax regulations. You may request deletion of your account and associated data by contacting us at <a href="mailto:support@thapsus.uk" className="text-orange-500 hover:underline font-bold">support@thapsus.uk</a>.</p>
          </Section>

          <Section title="5. Cookies">
            <p>We use essential cookies to keep you logged in and to secure our platform. We do not use third-party advertising cookies. You may disable cookies in your browser settings, but this may affect the functionality of the platform.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data (subject to legal retention requirements).</li>
              <li>Object to or restrict certain processing activities.</li>
              <li>Data portability — receive a copy of your data in a machine-readable format.</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:support@thapsus.uk" className="text-orange-500 hover:underline font-bold">support@thapsus.uk</a>.</p>
          </Section>

          <Section title="7. Security">
            <p>We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, loss, or destruction. All data is transmitted over HTTPS and stored on secure, encrypted infrastructure. However, no method of transmission over the internet is 100% secure.</p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such data, please contact us immediately.</p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on our website and, where appropriate, by email. Your continued use of our services after any changes constitutes your acceptance of the revised policy.</p>
          </Section>

          <Section title="10. Contact Us">
            <p>If you have any questions about this Privacy Policy, please contact us:</p>
            <ul className="list-none mt-3 space-y-1.5">
              <li><strong className="text-slate-800">Email:</strong> <a href="mailto:support@thapsus.uk" className="text-orange-500 hover:underline font-bold">support@thapsus.uk</a></li>
              <li><strong className="text-slate-800">Phone / WhatsApp:</strong> <a href="https://wa.me/447424531483" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline font-bold">+44 7424 531483</a></li>
              <li><strong className="text-slate-800">Address:</strong> 31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom</li>
            </ul>
          </Section>

        </GlassCard>

        {/* Footer link row */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-orange-500">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-slate-700 transition-colors">Terms of Service</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

export default PrivacyPolicy

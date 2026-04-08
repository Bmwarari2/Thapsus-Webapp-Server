import React from 'react'
import { Link } from 'react-router-dom'
import { FileText, ArrowLeft, Zap } from 'lucide-react'

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

export const TermsOfService = () => {
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

      <LiquidBlob className="top-[-10%] left-[-5%]  w-[500px] h-[500px]" color="bg-orange-200"  />
      <LiquidBlob className="bottom-[5%] right-[-5%] w-[600px] h-[600px]" color="bg-blue-100"   />
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
              <FileText size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-[#0f172a] tracking-tighter uppercase leading-none">
                Terms of Service
              </h1>
              <p className="text-slate-500 font-bold text-sm mt-2">Last updated: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <GlassCard className="p-8 md:p-12">

          <p className="text-slate-600 font-medium text-sm leading-relaxed mb-10">
            These Terms of Service ("Terms") govern your use of the Thapsus Cargo platform located at <span className="font-black text-[#0f172a]">thapsus.uk</span> and all related services (collectively, the "Service"). By accessing or using our Service, you agree to be bound by these Terms. Please read them carefully.
          </p>

          <Section title="1. Acceptance of Terms">
            <p>By creating an account or placing an order, you confirm that you are at least 18 years of age, have read and understood these Terms, and agree to be bound by them. If you do not agree, you may not use our Service.</p>
          </Section>

          <Section title="2. Description of Service">
            <p>Thapsus Cargo provides international package forwarding and consolidation services. We receive packages on your behalf at our warehouse address in the United Kingdom and forward them to Kenya. Our service includes:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Package receipt and storage at our UK warehouse.</li>
              <li>Package consolidation to reduce shipping costs.</li>
              <li>International air and sea freight to Kenya.</li>
              <li>Customs clearance assistance.</li>
              <li>Last-mile delivery coordination within Kenya.</li>
            </ul>
          </Section>

          <Section title="3. User Accounts">
            <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must notify us immediately of any unauthorised use. We reserve the right to suspend or terminate accounts that violate these Terms.</p>
          </Section>

          <Section title="4. Prohibited Items">
            <p>You must not use our Service to ship any of the following:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Weapons, firearms, ammunition, or explosive materials.</li>
              <li>Illegal drugs or controlled substances.</li>
              <li>Counterfeit goods or items that infringe intellectual property rights.</li>
              <li>Hazardous materials, including flammable liquids and gases.</li>
              <li>Perishable food items or live animals.</li>
              <li>Currency, bearer bonds, or financial instruments.</li>
              <li>Any item prohibited by UK or Kenyan customs regulations.</li>
            </ul>
            <p className="mt-3">Shipment of prohibited items may result in seizure by customs authorities, forfeiture of your shipment, legal liability, and immediate termination of your account. We accept no liability for prohibited items.</p>
          </Section>

          <Section title="5. Pricing and Payment">
            <p>All quoted prices are estimates. Final charges are calculated based on the actual weight, dimensions, and declared value of your package after receipt at our warehouse. Payment is required before your package is released for international transit. We accept M-Pesa and other approved payment methods listed on the platform.</p>
            <p className="mt-3">Customs duties, import taxes, and VAT are the responsibility of the recipient and are not included in our shipping fees unless explicitly stated.</p>
          </Section>

          <Section title="6. Declared Value and Insurance">
            <p>You must accurately declare the value of your goods. Providing a false declared value is illegal and may result in penalties. Optional cargo insurance is available at 3% of the declared value and covers loss or damage in transit. Thapsus Cargo's liability without insurance is limited to a maximum of £50 per shipment.</p>
          </Section>

          <Section title="7. Delivery Timescales">
            <p>Estimated delivery timeframes are provided in good faith but are not guaranteed. Delays may occur due to customs inspections, adverse weather, carrier delays, or other factors outside our control. Thapsus Cargo is not liable for losses arising from delivery delays.</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-slate-800">Economy shipping:</strong> 10–14 business days.</li>
              <li><strong className="text-slate-800">Express shipping:</strong> 5–7 business days.</li>
            </ul>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the maximum extent permitted by law, Thapsus Cargo shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or in connection with your use of the Service, including but not limited to loss of profits, data, or goodwill. Our total liability for any claim shall not exceed the amount you paid us for the shipment giving rise to the claim.</p>
          </Section>

          <Section title="9. Indemnification">
            <p>You agree to indemnify and hold harmless Thapsus Cargo, its directors, employees, and agents from any claims, losses, damages, or expenses (including legal fees) arising out of your use of the Service, violation of these Terms, or infringement of any third-party rights.</p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>All content on the Thapsus Cargo platform, including the logo, design, text, and software, is the property of Thapsus Cargo and is protected by UK and international copyright law. You may not reproduce, distribute, or create derivative works without our express written consent.</p>
          </Section>

          <Section title="11. Governing Law">
            <p>These Terms are governed by the laws of England and Wales. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of England and Wales.</p>
          </Section>

          <Section title="12. Changes to Terms">
            <p>We may modify these Terms at any time. We will notify you of material changes by posting the updated Terms on our platform. Your continued use of the Service after such changes constitutes your acceptance of the revised Terms.</p>
          </Section>

          <Section title="13. Contact Us">
            <p>If you have any questions about these Terms, please contact us:</p>
            <ul className="list-none mt-3 space-y-1.5">
              <li><strong className="text-slate-800">Email:</strong> <a href="mailto:admin@thapsus.uk" className="text-orange-500 hover:underline font-bold">admin@thapsus.uk</a></li>
              <li><strong className="text-slate-800">Phone / WhatsApp:</strong> <a href="https://wa.me/447424531483" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline font-bold">+44 7424 531483</a></li>
              <li><strong className="text-slate-800">Address:</strong> 31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom</li>
            </ul>
          </Section>

        </GlassCard>

        {/* Footer link row */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-slate-700 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="text-orange-500">Terms of Service</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

export default TermsOfService

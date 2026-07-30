import React from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, Zap } from 'lucide-react'
import { useAppConfig, formatWhatsapp } from '../hooks/useAppConfig'

const LiquidBlob = ({ className, color }) => (
  null
)

const GlassCard = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-[2rem] bg-surface border border-line shadow-card ${className}`}>
    <div className="absolute inset-0 hidden" />
    <div className="relative z-10">{children}</div>
  </div>
)

const Section = ({ title, id, children }) => (
  <div id={id} className="mb-10 scroll-mt-24">
    <h2 className="text-xl font-black text-white tracking-tighter uppercase mb-4 flex items-center gap-3">
      <span className="w-1.5 h-6 bg-orange-500 rounded-full shrink-0" />
      {title}
    </h2>
    <div className="text-mute font-medium text-sm leading-relaxed space-y-3">{children}</div>
  </div>
)

const ExtLink = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="text-ember-400 hover:underline font-bold">
    {children}
  </a>
)

export const PrivacyPolicy = () => {
  const { support_whatsapp } = useAppConfig()
  return (
    <div className="min-h-screen bg-transparent font-sans text-white overflow-x-hidden relative">
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
      <div className="absolute inset-0 hidden" />

      <div className="max-w-3xl mx-auto px-6 py-12 lg:py-20 relative z-10">

        {/* Back */}
        <Link to="/" className="inline-flex items-center gap-2 text-mute hover:text-ember-400 font-black uppercase tracking-widest text-[10px] mb-10 transition-all group">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          Back to Home
        </Link>

        {/* Header */}
        <div className="mb-12 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.05] border border-line text-[9px] font-black uppercase tracking-[0.3em] text-mute shadow-sm">
            <Zap size={10} className="text-ember-400" />
            Legal Document
          </div>
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-ember-gradient rounded-2xl flex items-center justify-center shadow-xl shrink-0">
              <ShieldCheck size={28} className="text-white" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase leading-none">
                Privacy Policy
              </h1>
              <p className="text-mute font-bold text-sm mt-2">Last updated: {new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}</p>
            </div>
          </div>
        </div>

        {/* Content card */}
        <GlassCard className="p-8 md:p-12">

          <p className="text-mute font-medium text-sm leading-relaxed mb-10">
            Thapsus Cargo ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains what data we collect, why we collect it, and how we use and protect it when you use our platform at <span className="font-black text-white">thapsus.uk</span>, including when you communicate with us over WhatsApp.
          </p>
          <p className="text-mute font-medium text-sm leading-relaxed mb-10">
            If you are here for our WhatsApp messaging practices, see <a href="#whatsapp" className="text-ember-400 hover:underline font-bold">Section 4 — WhatsApp Business Messaging</a>. For instructions on deleting your data, see <a href="#data-deletion" className="text-ember-400 hover:underline font-bold">Section 9 — Data Deletion Instructions</a>.
          </p>

          <Section title="1. Information We Collect">
            <p>We collect information you provide directly to us, including:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-white">Account information</strong> — name, email address, phone number, and password when you register.</li>
              <li><strong className="text-white">Order information</strong> — shipment details, retailer name, package descriptions, weight, dimensions, and declared value.</li>
              <li><strong className="text-white">Payment information</strong> — M-Pesa transaction references and payment amounts. We do not store full card numbers.</li>
              <li><strong className="text-white">Communications</strong> — messages you send via our support ticket system, email, SMS, or WhatsApp.</li>
              <li><strong className="text-white">WhatsApp messaging data</strong> — where you choose to communicate with us on WhatsApp, we receive your WhatsApp phone number, your WhatsApp profile name, your WhatsApp ID, the content of the messages and media you send us, and message metadata such as timestamps and delivery, read, and failure receipts. See <a href="#whatsapp" className="text-ember-400 hover:underline font-bold">Section 4</a> for full details.</li>
            </ul>
            <p className="mt-3">We also collect information automatically, such as IP addresses, browser type, device identifiers, and usage data through cookies and similar technologies.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Process and fulfil your shipping orders and provide real-time tracking updates.</li>
              <li>Send you transactional communications including order confirmations, status updates, and payment receipts — by email, SMS, push notification, or WhatsApp.</li>
              <li>Respond to your support requests and improve our customer service, including support conversations you start on WhatsApp.</li>
              <li>Detect and prevent fraud, abuse, and other security issues.</li>
              <li>Comply with applicable laws, customs regulations, and legal obligations.</li>
              <li>Send you service-related notifications (with your consent where required).</li>
            </ul>
          </Section>

          <Section title="3. Legal Bases for Processing">
            <p>Where the UK GDPR or Kenya's Data Protection Act, 2019 applies, we rely on the following legal bases:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-white">Performance of a contract</strong> — to fulfil the shipping services you order, including sending you the shipment and payment notifications you need to receive your parcel.</li>
              <li><strong className="text-white">Consent</strong> — for optional messaging channels (including WhatsApp notifications) and for any marketing communications. You may withdraw consent at any time.</li>
              <li><strong className="text-white">Legal obligation</strong> — customs declarations, tax and accounting records, and anti-money-laundering checks.</li>
              <li><strong className="text-white">Legitimate interests</strong> — securing our platform, preventing fraud, and improving our services, balanced against your rights.</li>
            </ul>
          </Section>

          <Section title="4. WhatsApp Business Messaging" id="whatsapp">
            <p>
              We use the <strong className="text-white">WhatsApp Business Platform</strong> (the WhatsApp Business API), provided by WhatsApp Ireland Limited and Meta Platforms Ireland Limited ("Meta"), to send service messages to customers and to receive customer-support enquiries. This section explains that processing specifically.
            </p>

            <p className="mt-4"><strong className="text-white">Opt-in.</strong> We only send you WhatsApp messages after you have given us your explicit opt-in for that channel — for example by ticking the WhatsApp notifications option in your account settings, by providing your WhatsApp number for that purpose during checkout or registration, or by messaging us first. Opting in to WhatsApp is never a condition of using Thapsus Cargo; email remains available for every notification we send.</p>

            <p className="mt-4"><strong className="text-white">What we send.</strong> Business-initiated WhatsApp messages are limited to pre-approved message templates for:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Order and shipment confirmations, consolidation notices, and dispatch alerts.</li>
              <li>Tracking and delivery status updates, including last-mile and collection notifications.</li>
              <li>Payment requests, receipts, and customs or duty notices.</li>
              <li>Responses to support enquiries you have raised.</li>
            </ul>
            <p className="mt-3">We do not send marketing or promotional WhatsApp messages unless you have separately opted in to marketing on that channel.</p>

            <p className="mt-4"><strong className="text-white">What data is involved.</strong> To deliver a WhatsApp message we transmit your WhatsApp phone number and the content of the message (including variables such as your name, tracking number, order reference, or amount due) to Meta. When you reply, we receive your message content, any media you attach, your WhatsApp profile name, your WhatsApp ID, and delivery/read metadata.</p>

            <p className="mt-4"><strong className="text-white">Meta's role and its own processing.</strong> Meta acts as our processor for the delivery of these messages, and separately processes data as a controller in accordance with its own terms. Message content sent through the WhatsApp Business Platform is end-to-end encrypted in transit between WhatsApp clients, but because we use a cloud-hosted business API, message content is processed on Meta's infrastructure in order to be delivered. Your use of WhatsApp itself is also governed by Meta's policies:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><ExtLink href="https://www.whatsapp.com/legal/privacy-policy">WhatsApp Privacy Policy</ExtLink></li>
              <li><ExtLink href="https://www.whatsapp.com/legal/business-terms/">WhatsApp Business Terms of Service</ExtLink></li>
              <li><ExtLink href="https://business.whatsapp.com/policy">WhatsApp Business Messaging Policy</ExtLink></li>
            </ul>

            <p className="mt-4"><strong className="text-white">How to opt out.</strong> You can stop receiving WhatsApp messages from us at any time by:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Replying <strong className="text-white">STOP</strong> to any WhatsApp message we send you;</li>
              <li>Turning off WhatsApp notifications in your account settings; or</li>
              <li>Emailing <a href="mailto:admin@thapsus.uk" className="text-ember-400 hover:underline font-bold">admin@thapsus.uk</a> with the subject "WhatsApp opt-out".</li>
            </ul>
            <p className="mt-3">We action opt-out requests promptly and record them so the channel is not used for you again. Opting out of WhatsApp does not delete your account; we will continue to send essential service notices by email. You can also block or report our number from within WhatsApp at any time.</p>

            <p className="mt-4"><strong className="text-white">What not to send us on WhatsApp.</strong> Please do not send passwords, full card numbers, or other highly sensitive information over WhatsApp. We will never ask you for your Thapsus Cargo password or your full card details on WhatsApp.</p>

            <p className="mt-4"><strong className="text-white">Retention of WhatsApp data.</strong> We retain WhatsApp conversation history and delivery logs for up to 24 months for customer-service continuity, dispute resolution, and proof of notification, after which they are deleted or anonymised — except where a longer period is required to meet a legal obligation. You may request earlier deletion of your WhatsApp conversation history as described in <a href="#data-deletion" className="text-ember-400 hover:underline font-bold">Section 9</a>.</p>

            <p className="mt-4"><strong className="text-white">No unauthorised use of WhatsApp data.</strong> We do not sell WhatsApp data, use it for advertising or ad targeting, build profiles for third parties from it, or share it with data brokers. We use it only for the purposes described in this section.</p>
          </Section>

          <Section title="5. Sharing of Information">
            <p>We do not sell your personal information. We may share your data with:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-white">Service providers</strong> — third-party logistics partners, courier services, payment processors (e.g. M-Pesa/Safaricom), and cloud infrastructure providers who process data on our behalf.</li>
              <li><strong className="text-white">Messaging providers</strong> — WhatsApp Ireland Limited and Meta Platforms Ireland Limited (WhatsApp Business Platform), together with our SMS, email, and push notification providers, in order to deliver the notifications you have asked to receive.</li>
              <li><strong className="text-white">Customs & regulatory authorities</strong> — as required by UK and Kenyan customs law for international shipments.</li>
              <li><strong className="text-white">Legal requirements</strong> — when we believe disclosure is required by law, court order, or to protect the rights and safety of Thapsus Cargo, our users, or the public.</li>
            </ul>
          </Section>

          <Section title="6. International Data Transfers">
            <p>Thapsus Cargo operates between the United Kingdom and Kenya, so your data is transferred between those countries in order to ship your parcel. Some of our providers — including Meta, which operates the WhatsApp Business Platform — process data outside the UK, the EEA, and Kenya, including in the United States.</p>
            <p>Where data leaves the UK, the EEA, or Kenya, we rely on an adequacy decision where one exists, or otherwise on Standard Contractual Clauses (with the UK International Data Transfer Addendum where applicable) together with appropriate technical safeguards such as encryption in transit.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your personal information for as long as your account is active or as needed to provide you with services. Order records are retained for a minimum of seven (7) years in compliance with UK accounting and tax regulations. WhatsApp conversation history and messaging logs are retained for up to 24 months as described in <a href="#whatsapp" className="text-ember-400 hover:underline font-bold">Section 4</a>. You may request deletion of your account and associated data as described in <a href="#data-deletion" className="text-ember-400 hover:underline font-bold">Section 9</a>.</p>
          </Section>

          <Section title="8. Cookies">
            <p>We use essential cookies to keep you logged in and to secure our platform. We do not use third-party advertising cookies. You may disable cookies in your browser settings, but this may affect the functionality of the platform.</p>
          </Section>

          <Section title="9. Data Deletion Instructions" id="data-deletion">
            <p>You can ask us to delete your personal data, including any data we hold from your WhatsApp conversations with us, in any of the following ways:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-white">In the app</strong> — sign in and go to <span className="font-black text-white">Account → Delete account</span> (<Link to="/account/delete" className="text-ember-400 hover:underline font-bold">thapsus.uk/account/delete</Link>). Deletion runs after a 14-day cooling-off period, during which you can cancel, and you can export your data first from <span className="font-black text-white">Account → Data rights (GDPR)</span>.</li>
              <li><strong className="text-white">By email</strong> — send a request to <a href="mailto:admin@thapsus.uk" className="text-ember-400 hover:underline font-bold">admin@thapsus.uk</a> with the subject "Data deletion request" from the email address on your account, or including the phone number you use with us.</li>
              <li><strong className="text-white">WhatsApp data only</strong> — reply <strong className="text-white">DELETE</strong> to any of our WhatsApp messages, or email us as above asking us to delete your WhatsApp conversation history. We will delete the conversation and stop using the channel for you, leaving the rest of your account intact.</li>
            </ul>
            <p className="mt-3">We verify that a request comes from the account holder before acting on it, then confirm and complete deletion within 30 days. Records we are legally required to keep — such as order, customs, and payment records held for seven (7) years under UK accounting and tax rules — are retained for the remainder of that period and then deleted; they are not used for any other purpose in the meantime. Deleting your data on our systems does not delete the messages held in your own WhatsApp app on your device, which you can delete yourself in WhatsApp.</p>
            <p className="mt-3">You can also request a machine-readable copy of your data before deleting it — see <a href="#your-rights" className="text-ember-400 hover:underline font-bold">Section 10</a>.</p>
          </Section>

          <Section title="10. Your Rights" id="your-rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your data (subject to legal retention requirements).</li>
              <li>Object to or restrict certain processing activities.</li>
              <li>Data portability — receive a copy of your data in a machine-readable format.</li>
              <li>Withdraw consent for any optional messaging channel, including WhatsApp, at any time.</li>
              <li>Lodge a complaint with a supervisory authority — the UK Information Commissioner's Office (<ExtLink href="https://ico.org.uk">ico.org.uk</ExtLink>) or the Office of the Data Protection Commissioner in Kenya (<ExtLink href="https://www.odpc.go.ke">odpc.go.ke</ExtLink>).</li>
            </ul>
            <p className="mt-3">To exercise any of these rights, contact us at <a href="mailto:admin@thapsus.uk" className="text-ember-400 hover:underline font-bold">admin@thapsus.uk</a>. We respond within 30 days.</p>
          </Section>

          <Section title="11. Security">
            <p>We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, loss, or destruction. All data is transmitted over HTTPS and stored on secure, encrypted infrastructure. Access to WhatsApp conversations and messaging credentials is restricted to authorised staff who need it to provide support. However, no method of transmission over the internet is 100% secure.</p>
          </Section>

          <Section title="12. Children's Privacy">
            <p>Our services are not directed to individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected such data, please contact us immediately.</p>
          </Section>

          <Section title="13. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the updated policy on our website and, where appropriate, by email. Your continued use of our services after any changes constitutes your acceptance of the revised policy.</p>
          </Section>

          <Section title="14. Contact Us">
            <p>The data controller for the processing described in this policy is <strong className="text-white">Thapsus Cargo Global</strong>. If you have any questions about this Privacy Policy, or want to exercise any of your rights, please contact us:</p>
            <ul className="list-none mt-3 space-y-1.5">
              <li><strong className="text-white">Email:</strong> <a href="mailto:admin@thapsus.uk" className="text-ember-400 hover:underline font-bold">admin@thapsus.uk</a></li>
              <li><strong className="text-white">Phone / WhatsApp:</strong> <a href={`https://wa.me/${support_whatsapp}`} target="_blank" rel="noopener noreferrer" className="text-ember-400 hover:underline font-bold">{formatWhatsapp(support_whatsapp)}</a></li>
              <li><strong className="text-white">Address:</strong> 31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB, United Kingdom</li>
            </ul>
          </Section>

        </GlassCard>

        {/* Footer link row */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
          <p>© {new Date().getFullYear()} Thapsus Cargo Global</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-ember-400">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white/80 transition-colors">Terms of Service</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

export default PrivacyPolicy

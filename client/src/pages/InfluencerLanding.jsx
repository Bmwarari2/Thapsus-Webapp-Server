import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { User, Mail, Phone, Lock, AlertCircle, Gift, Link2, Plus, X, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { influencerApi } from '../api'
import { PillLabel } from '../components/ui'

/**
 * InfluencerLanding — public page at /i/:code.
 *
 * Someone who received an influencer's referral link lands here. We show the
 * influencer's name, count the visit ("received the link"), then let the
 * visitor create an account AND paste the item link(s) they want shipped in
 * one step. On success we route to the "check your inbox" page — sign-up is
 * email-verification-gated, same as the normal register form.
 */
export const InfluencerLanding = () => {
  const { code } = useParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState('loading') // loading | invalid | ready
  const [influencerName, setInfluencerName] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' })
  const [items, setItems] = useState([{ url: '', description: '' }])
  const visitIdRef = useRef(null)

  useEffect(() => {
    let alive = true
    influencerApi.lookup(code)
      .then((res) => {
        if (!alive) return
        if (res.data?.valid) {
          setInfluencerName(res.data.influencer_name || '')
          setPhase('ready')
          // Record this visit once per browser session so a refresh doesn't
          // inflate the influencer's "opens" number. The returned visit_id
          // ties an eventual signup back to this exact open.
          const key = `inf_visit_${code}`
          const recordVisit = () =>
            influencerApi.visit(code)
              .then((r) => { visitIdRef.current = r.data?.visit_id || null; return r.data?.visit_id })
              .catch(() => {})
          try {
            const stored = sessionStorage.getItem(key)
            if (stored) {
              visitIdRef.current = stored
            } else {
              recordVisit().then((vid) => { if (vid) { try { sessionStorage.setItem(key, vid) } catch {} } })
            }
          } catch {
            recordVisit()
          }
        } else {
          setPhase('invalid')
        }
      })
      .catch(() => { if (alive) setPhase('invalid') })
    return () => { alive = false }
  }, [code])

  const setField = (name, value) => setForm((p) => ({ ...p, [name]: value }))

  const setItem = (idx, key, value) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)))
  const addItem = () => setItems((prev) => (prev.length >= 10 ? prev : [...prev, { url: '', description: '' }]))
  const removeItem = (idx) => setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('Please enter your full name')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Please enter a valid email')
    if (!form.phone.trim()) return setError('Please enter your phone number')
    if (form.password.length < 8) return setError('Password must be at least 8 characters')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match')

    const cleanItems = items
      .map((it) => ({ url: it.url.trim(), description: it.description.trim() }))
      .filter((it) => it.url)

    try {
      setSubmitting(true)
      const res = await influencerApi.signup(code, {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        items: cleanItems,
        visit_id: visitIdRef.current || undefined,
      })
      toast.success('Account created — check your inbox to activate it.')
      navigate(`/check-inbox?email=${encodeURIComponent(res.data?.email || form.email.trim())}`)
    } catch (err) {
      const msg = err?.response?.data?.message || 'Signup failed. Please try again.'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (phase === 'invalid') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="glow-card p-8 max-w-md text-center space-y-4">
          <AlertCircle className="mx-auto text-red-400" size={40} />
          <h1 className="text-2xl font-bold text-white">This link isn’t active</h1>
          <p className="text-mute text-sm">
            The referral link you followed is invalid or has been turned off. You can still create an account and start shipping.
          </p>
          <Link to="/register" className="btn-primary inline-block">Create an account</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[44rem] h-[44rem] bg-ember-radial blur-2xl pointer-events-none" />

      <div className="w-full max-w-lg relative z-10 animate-slide-up">
        <div className="glow-card p-8 md:p-10">
          <div className="text-center mb-7 space-y-4">
            <div className="flex justify-center"><PillLabel>You’ve been invited</PillLabel></div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
              {influencerName ? <>{influencerName} invited you to<br/>Thapsus Cargo</> : 'Welcome to Thapsus Cargo'}
            </h1>
            <p className="text-mute text-sm">
              Create your account and drop the link to whatever you want us to ship — we’ll quote it and get it moving.
            </p>
          </div>

          {influencerName && (
            <div className="mb-6 p-3 rounded-2xl bg-ember-500/[0.06] border border-ember-500/20">
              <p className="text-xs text-mute leading-relaxed flex gap-2">
                <Gift size={15} className="text-ember-400 shrink-0 mt-0.5" />
                <span>You’re signing up through <strong className="text-ember-400 font-semibold">{influencerName}</strong>’s referral.</span>
              </p>
            </div>
          )}

          {error && (
            <div className="alert-error mb-5 animate-scale-in">
              <AlertCircle className="shrink-0 mt-0.5 text-red-400" size={20} />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Full name</label>
              <IconField icon={User} type="text" value={form.name} onChange={(v) => setField('name', v)} placeholder="John Doe" autoComplete="name" />
            </div>
            <div>
              <label className="form-label">Email</label>
              <IconField icon={Mail} type="email" value={form.email} onChange={(v) => setField('email', v)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div>
              <label className="form-label">Phone</label>
              <IconField icon={Phone} type="tel" value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+254 712 345678" autoComplete="tel" />
            </div>
            <div>
              <label className="form-label">Password</label>
              <IconField icon={Lock} type="password" value={form.password} onChange={(v) => setField('password', v)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div>
              <label className="form-label">Confirm password</label>
              <IconField icon={Lock} type="password" value={form.confirmPassword} onChange={(v) => setField('confirmPassword', v)} placeholder="••••••••" autoComplete="new-password" />
            </div>

            {/* Item links */}
            <div className="pt-2">
              <label className="form-label flex items-center gap-2">
                <Package size={14} className="text-ember-400" /> What do you want us to ship?
              </label>
              <p className="text-[11px] text-dim mb-3">Paste the product link(s). Add a note if the size/colour matters. You can add more later too.</p>
              <div className="space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-2xl border border-line bg-surface-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Link2 size={15} className="text-dim shrink-0" />
                      <input
                        type="url" value={it.url} onChange={(e) => setItem(idx, 'url', e.target.value)}
                        placeholder="https://store.com/product…"
                        className="form-input !py-2 flex-1"
                      />
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-dim hover:text-red-400 p-1" aria-label="Remove item">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                    <input
                      type="text" value={it.description} onChange={(e) => setItem(idx, 'description', e.target.value)}
                      placeholder="Optional — e.g. size M, black"
                      className="form-input !py-2"
                    />
                  </div>
                ))}
              </div>
              {items.length < 10 && (
                <button type="button" onClick={addItem} className="mt-3 inline-flex items-center gap-1.5 text-ember-400 hover:text-ember-300 text-xs font-semibold">
                  <Plus size={14} /> Add another item
                </button>
              )}
            </div>

            <button type="submit" disabled={submitting} className="btn-primary glass-sheen w-full btn-lg !mt-6">
              {submitting ? 'Creating…' : 'Create account & submit'}
            </button>
          </form>

          <p className="text-center text-mute text-sm mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-ember-400 hover:text-ember-300 font-semibold ml-1">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function IconField({ icon: Icon, type, value, onChange, placeholder, autoComplete }) {
  return (
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" size={18} />
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} autoComplete={autoComplete}
        className="form-input pl-11"
      />
    </div>
  )
}

export default InfluencerLanding

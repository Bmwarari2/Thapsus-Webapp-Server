import React, { useEffect, useState } from 'react'
import { Settings2, Save, Stethoscope, Wrench, CheckCircle2, XCircle, BellRing } from 'lucide-react'
import toast from 'react-hot-toast'
import { waApi, waWebhookApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading } from '../../components/GlassUI'

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-line text-white ' +
  'placeholder:text-mute focus:outline-none focus:border-ember-500/50'

export function WaSettings() {
  const [form, setForm] = useState(null)
  const [caps, setCaps] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    waApi.settings()
      .then((res) => {
        const s = res.data.settings
        setCaps(res.data.capabilities || {})
        setForm({
          markup_pct: String(s.markup_pct),
          promo_active: s.promo_active,
          promo_type: s.promo_type,
          promo_message: s.promo_message || '',
          default_delivery_fee_kes: String(s.default_delivery_fee_kes),
          fx_buffer_pct: String(s.fx_buffer_pct ?? 2.5),
          welcome_media_urls: (s.welcome_media_urls || []).join('\n'),
          template_map: JSON.stringify(s.template_map || {}, null, 2),
          ai_enabled: s.ai_enabled === true,
          nudges_enabled: s.nudges_enabled !== false,
          ai_knowledge_base: s.ai_knowledge_base || '',
          ai_resume_after_minutes: String(s.ai_resume_after_minutes ?? 120),
          staff_alert_numbers: (s.staff_alert_numbers || []).join('\n'),
          staff_alert_template: s.staff_alert_template || 'Staff_Alert',
        })
      })
      .catch((e) => toast.error(e.response?.data?.message || 'Failed to load settings'))
  }, [])

  const save = async () => {
    setBusy(true)
    try {
      let templateMap
      try { templateMap = JSON.parse(form.template_map || '{}') }
      catch { throw Object.assign(new Error(), { response: { data: { message: 'Template map is not valid JSON' } } }) }
      await waApi.saveSettings({
        markup_pct: Number(form.markup_pct),
        promo_active: form.promo_active,
        promo_type: form.promo_type,
        promo_message: form.promo_message,
        default_delivery_fee_kes: Number(form.default_delivery_fee_kes),
        fx_buffer_pct: Number(form.fx_buffer_pct),
        welcome_media_urls: form.welcome_media_urls.split('\n').map((s) => s.trim()).filter(Boolean),
        template_map: templateMap,
        ai_enabled: form.ai_enabled,
        nudges_enabled: form.nudges_enabled,
        ai_knowledge_base: form.ai_knowledge_base,
        ai_resume_after_minutes: Number(form.ai_resume_after_minutes),
        staff_alert_numbers: form.staff_alert_numbers.split('\n').map((n) => n.trim()).filter(Boolean),
        staff_alert_template: form.staff_alert_template,
      })
      toast.success('Settings saved')
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  if (!form) return <div className="max-w-3xl mx-auto px-4 py-16 text-center text-mute">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <GlassStyles />
      <PageHeading icon={Settings2} title="WhatsApp Settings"
        subtitle="Quote margin, FX buffer, promos, delivery fee and templates" />

      <div className="space-y-4">
        <GlassCard className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Quote margin (%)</label>
            <input value={form.markup_pct} onChange={set('markup_pct')} inputMode="decimal" className={inputCls} />
            <p className="text-xs text-mute mt-1">
              Final KES = USD price × quoting rate × (1 + margin/100). This is the SHEIN
              service fee — waive it freely; the FX buffer below is what protects the money.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">FX buffer (%)</label>
            <input value={form.fx_buffer_pct} onChange={set('fx_buffer_pct')} inputMode="decimal" className={inputCls} />
            <p className="text-xs text-mute mt-1">
              Lifts the mid-market USD→KES rate to the rate quotes are actually priced at.
              The live rate is a <span className="text-white">mid</span> rate — the midpoint of
              a spread nobody trades at — while collecting KES and paying suppliers in GBP
              costs 3–4 shillings on the cross. This is cost recovery, not margin, so leave it
              on even when the service fee is waived. 0 quotes at mid and absorbs the spread.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Default delivery fee (KSh)</label>
            <input value={form.default_delivery_fee_kes} onChange={set('default_delivery_fee_kes')} inputMode="numeric" className={inputCls} />
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-white">Promo active</span>
              <p className="text-xs text-mute">While on, arriving parcels get the promo instead of a fee request</p>
            </div>
            <input type="checkbox" checked={form.promo_active} onChange={set('promo_active')}
              className="w-5 h-5 accent-orange-600" />
          </label>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Promo type</label>
            <select value={form.promo_type} onChange={set('promo_type')} className={inputCls}>
              <option value="waive_fee">Waive delivery fee</option>
              <option value="discount">Merchandise discount (message only)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Promo message</label>
            <input value={form.promo_message} onChange={set('promo_message')}
              placeholder="e.g. Free delivery on all orders through mid-August" className={inputCls} />
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Welcome media URLs (one per line, https)</label>
            <textarea rows={3} value={form.welcome_media_urls} onChange={set('welcome_media_urls')}
              placeholder="https://…/how-it-works.png" className={inputCls} />
            <p className="text-xs text-mute mt-1">Images/infographics sent with the welcome message (max 5)</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">sent.dm template map (JSON)</label>
            <textarea rows={6} value={form.template_map} onChange={set('template_map')}
              className={`${inputCls} font-mono text-xs`} />
            <p className="text-xs text-mute mt-1">
              Maps message keys (welcome, quote, payment_received, receipt, purchased, arrived_fee,
              arrived_waived, dispatched, delivered) to approved WhatsApp template names.
              Leave empty to send free-form text inside the 24h session window.
            </p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-sm font-semibold text-white">AI assistant (Gemini)</span>
              <p className="text-xs text-mute">
                Opens by explaining what we do and what we charge — straight from the knowledge
                base below — then invites a product link and collects the customer's name and
                address while they wait for your quote. It states the standing rates but never
                prices a specific item, confirms an order, or touches payments — those stay with
                you. Requires GEMINI_API_KEY on Railway.
              </p>
            </div>
            <input type="checkbox" checked={form.ai_enabled} onChange={set('ai_enabled')}
              className="w-5 h-5 accent-orange-600" />
          </label>
          <label className="flex items-start justify-between gap-4 cursor-pointer">
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Follow-up nudges</span>
              <p className="text-xs text-mute">
                One-shot follow-ups inside WhatsApp's 24-hour window: a quote unanswered for a few
                hours gets a "we're holding it for you", a customer who asked about the service but
                never sent a cart gets a how-to-share-your-cart message before the window shuts, and
                a fresh delivery gets one "anything else on your list?". Each sends at most once,
                never while you hold the chat. Quotes still unanswered on day 2 page staff for a
                personal follow-up.
              </p>
            </div>
            <input type="checkbox" checked={form.nudges_enabled} onChange={set('nudges_enabled')}
              className="w-5 h-5 accent-orange-600" />
          </label>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Resume after (minutes of silence)</label>
            <input value={form.ai_resume_after_minutes} onChange={set('ai_resume_after_minutes')} inputMode="numeric"
              className={inputCls} />
            <p className="text-xs text-mute mt-1">
              When you reply to a chat the assistant steps back so the customer isn't answered twice.
              It starts answering that chat again after this much quiet — or immediately when you tap
              the AI toggle in the inbox.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Knowledge base</label>
            <textarea rows={10} value={form.ai_knowledge_base} onChange={set('ai_knowledge_base')}
              placeholder={"Facts the assistant may use, e.g.:\n- We buy from any online store abroad (Amazon, ASOS, Shein…) and deliver to your door in Kenya\n- Service fee: 10% of the item price\n- Minimum order: KSh 2,000\n- Typical delivery: 10–14 days from purchase to Nairobi\n- Delivery fee: KSh 300 within Nairobi\n- Promotion: free delivery on all orders through mid-August\n- Payment: M-Pesa only\n- Support hours: Mon–Sat 8am–6pm"}
              className={`${inputCls} text-sm`} />
            <p className="text-xs text-mute mt-1">
              This is what the assistant opens every new chat with, so put the fees, the minimum
              order, the delivery time and any promotion in here — it can only state facts written
              here, and anything else gets handed to you in the inbox. Leave a number out and it
              will say the team will confirm. Don't ask it to collect an M-Pesa number; payments
              are matched from the M-Pesa statement.
            </p>
          </div>
        </GlassCard>

        <GlassCard className="p-5 space-y-4">
          <div className="flex items-start gap-3">
            <BellRing size={18} className="text-ember-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-bold text-white">Staff WhatsApp alerts</h2>
              <p className="text-xs text-mute mt-0.5">
                Pings these numbers on WhatsApp when a human is needed: a new customer finishes
                onboarding, a customer confirms a quote, someone says they've paid (verify on
                M-Pesa), or the assistant hands off. Leave empty to disable.
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Alert numbers (one per line)</label>
            <textarea rows={3} value={form.staff_alert_numbers} onChange={set('staff_alert_numbers')}
              placeholder={'0712 345 678\n254733000000'} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Alert template (name or ID)</label>
            <input value={form.staff_alert_template} onChange={set('staff_alert_template')}
              placeholder="Staff_Alert" className={inputCls} />
            <p className="text-xs text-mute mt-1">
              Your approved sent.dm template with two variables — var_1 (what happened) and
              var_2 (the details).
            </p>
          </div>
        </GlassCard>

        {caps.stk_available === false && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-sm text-amber-200">
            <span className="font-semibold">Payments are manual.</span> M-Pesa STK Push is switched
            off (MPESA_PROVIDER), so the dashboard sends till instructions
            {caps.mpesa_till ? <> (Till <span className="font-mono">{caps.mpesa_till}</span>)</> : null}
            {' '}and an admin approves each payment after checking M-Pesa.
          </div>
        )}

        <button onClick={save} disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold disabled:opacity-50">
          <Save size={18} /> Save settings
        </button>

        <WebhookDoctor />
      </div>
    </div>
  )
}

/**
 * sent.dm webhook diagnostics: shows what's registered vs. what should
 * be, the recent delivery attempts, and a one-click repair (fix URL /
 * re-activate / create).
 */
function WebhookDoctor() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [secret, setSecret] = useState(null)

  const check = async () => {
    setBusy(true)
    try {
      const res = await waWebhookApi.status()
      setStatus(res.data)
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load webhook status')
    } finally {
      setBusy(false)
    }
  }

  const repair = async () => {
    setBusy(true)
    try {
      const res = await waWebhookApi.repair()
      for (const a of res.data.actions || []) toast.success(a)
      if (res.data.signing_secret) setSecret(res.data.signing_secret)
      await check()
    } catch (e) {
      toast.error(e.response?.data?.message || 'Repair failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">sent.dm webhook</h2>
          <p className="text-xs text-mute mt-0.5">Inbound messages reach the inbox through this — diagnose delivery failures here.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={check} disabled={busy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-sm disabled:opacity-50">
            <Stethoscope size={15} /> Check
          </button>
          <button onClick={repair} disabled={busy}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-ember-600 hover:bg-ember-500 text-white text-sm font-semibold disabled:opacity-50">
            <Wrench size={15} /> Repair
          </button>
        </div>
      </div>

      {status?.ai && (
        <div className={`rounded-xl border p-3 text-sm ${
          status.ai.ok ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-red-500/5 border-red-500/25'
        }`}>
          <p className="flex items-center gap-2 text-white font-semibold">
            {status.ai.ok
              ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              : <XCircle size={15} className="text-red-400 shrink-0" />}
            AI assistant {status.ai.enabled ? '(on)' : '(toggle off)'}
          </p>
          {status.ai.ok
            ? <p className="text-xs text-mute mt-1">Model in use: <span className="font-mono">{status.ai.model}</span></p>
            : <p className="text-[11px] font-mono text-red-300 mt-1 break-words">{status.ai.error}</p>}
        </div>
      )}

      {status && (
        <div className="space-y-3 text-sm">
          <p className="text-mute">
            Expected URL: <span className="text-white font-mono text-xs">{status.expected_url}</span>
            {' · '}secret {status.secret_configured
              ? <span className="text-emerald-300">configured</span>
              : <span className="text-red-300">MISSING on Railway</span>}
          </p>
          {status.webhooks.length === 0 && (
            <p className="text-amber-300">No webhook registered on sent.dm — click Repair to create it.</p>
          )}
          {status.webhooks.map((w) => (
            <div key={w.id} className="rounded-xl bg-white/[0.04] border border-line p-3 space-y-1.5">
              <p className="flex items-center gap-2 text-white">
                {w.url_matches && w.is_active
                  ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  : <XCircle size={15} className="text-red-400 shrink-0" />}
                <span className="font-mono text-xs break-all">{w.endpoint_url || '(no URL)'}</span>
              </p>
              <p className="text-xs text-mute">
                {w.is_active ? 'active' : 'DISABLED'} · {w.consecutive_failures} consecutive failures ·
                last success: {w.last_successful_delivery_at
                  ? new Date(w.last_successful_delivery_at).toLocaleString()
                  : 'never'}
              </p>
              {w.recent_events.length > 0 && (
                <div className="pt-1 space-y-0.5">
                  {w.recent_events.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-[11px] font-mono text-mute">
                      {new Date(e.created_at).toLocaleTimeString()} {e.event_type} → {e.delivery_status}
                      {e.http_status_code != null ? ` (HTTP ${e.http_status_code})` : ' (no response)'}
                      {e.error ? ` — ${e.error}` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {status?.outbound_failures?.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Recent failed sends</p>
          {status.outbound_failures.map((f, i) => (
            <div key={i} className="rounded-xl bg-red-500/5 border border-red-500/20 p-3 space-y-1">
              <p className="text-xs text-white">
                → {f.to} · {new Date(f.at).toLocaleTimeString()} · <span className="text-mute">"{f.body}"</span>
              </p>
              {f.request_error && (
                <p className="text-[11px] font-mono text-red-300">rejected: {f.request_error}</p>
              )}
              {f.activities.map((a, j) => (
                <p key={j} className="text-[11px] font-mono text-mute">
                  {a.status}{a.description ? ` — ${a.description}` : ''}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}

      {secret && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
          <p className="text-sm text-amber-200 font-semibold mb-1">New signing secret — shown only once!</p>
          <p className="font-mono text-xs text-white break-all select-all">{secret}</p>
          <p className="text-xs text-amber-200/80 mt-1.5">
            Set this as <span className="font-mono">SENTDM_WEBHOOK_SECRET</span> on Railway (Thapsus service → Variables), then wait for the redeploy.
          </p>
        </div>
      )}
    </GlassCard>
  )
}

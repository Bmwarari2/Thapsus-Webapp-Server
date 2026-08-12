import React, { useEffect, useState } from 'react'
import { Settings2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { waApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading } from '../../components/GlassUI'

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-line text-white ' +
  'placeholder:text-mute focus:outline-none focus:border-ember-500/50'

export function WaSettings() {
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    waApi.settings()
      .then((res) => {
        const s = res.data.settings
        setForm({
          markup_pct: String(s.markup_pct),
          promo_active: s.promo_active,
          promo_type: s.promo_type,
          promo_message: s.promo_message || '',
          default_delivery_fee_kes: String(s.default_delivery_fee_kes),
          welcome_media_urls: (s.welcome_media_urls || []).join('\n'),
          template_map: JSON.stringify(s.template_map || {}, null, 2),
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
        welcome_media_urls: form.welcome_media_urls.split('\n').map((s) => s.trim()).filter(Boolean),
        template_map: templateMap,
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
        subtitle="Quote margin, promos, delivery fee and templates" />

      <div className="space-y-4">
        <GlassCard className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-white mb-1.5">Quote margin (%)</label>
            <input value={form.markup_pct} onChange={set('markup_pct')} inputMode="decimal" className={inputCls} />
            <p className="text-xs text-mute mt-1">Final KES = USD price × live rate × (1 + margin/100)</p>
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
              placeholder="e.g. Free delivery on all orders through mid-August! 🎉" className={inputCls} />
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

        <button onClick={save} disabled={busy}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold disabled:opacity-50">
          <Save size={18} /> Save settings
        </button>
      </div>
    </div>
  )
}

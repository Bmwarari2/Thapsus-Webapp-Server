import React, { useEffect, useState } from 'react'
import { Settings, Save, Plus, Tag, Percent, Banknote, Sliders, Globe, Hash, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { pricingTiersApi, pricingApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /ops/settings — admin pricing + fee + promotion editor (Spec §4.7).
 */
export const OpsSettings = () => {
  const [tab, setTab] = useState('model')
  return (
    <div className="relative min-h-screen bg-white/[0.03]">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Settings} title="Pricing settings"
          subtitle="Six knobs power every quote. Edits are live within ~60s." />

        <div className="flex flex-wrap gap-2 mb-6">
          <Tab active={tab === 'model'}      label="Pricing model" icon={<Sliders size={14}/>}  onClick={() => setTab('model')} />
          <Tab active={tab === 'customs'}    label="Customs tiers" icon={<Globe size={14}/>}    onClick={() => setTab('customs')} />
          <Tab active={tab === 'hs'}         label="HS codes"      icon={<Hash size={14}/>}     onClick={() => setTab('hs')} />
          <Tab active={tab === 'tiers'}      label="Legacy tiers"  icon={<Tag size={14}/>}      onClick={() => setTab('tiers')} />
          <Tab active={tab === 'fees'}       label="Fees"          icon={<Banknote size={14}/>} onClick={() => setTab('fees')}  />
          <Tab active={tab === 'promotions'} label="Promotions"    icon={<Percent size={14}/>}  onClick={() => setTab('promotions')} />
        </div>

        {tab === 'model'      && <PricingModelTab />}
        {tab === 'customs'    && <CustomsTiersTab />}
        {tab === 'hs'         && <HsCodesTab />}
        {tab === 'tiers'      && <TiersTab />}
        {tab === 'fees'       && <FeesTab />}
        {tab === 'promotions' && <PromosTab />}
      </div>
    </div>
  )
}

const Tab = ({ active, label, icon, onClick }) => (
  <button onClick={onClick}
    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 transition-all
      ${active ? 'bg-ember-gradient text-white border-[#1e3a5f]'
               : 'bg-surface-2 text-white border-line hover:border-slate-300'}`}>
    {icon} {label}
  </button>
)

const TiersTab = () => {
  const [tiers, setTiers] = useState([])
  const [draft, setDraft] = useState({ channel: 'UK_air', min_kg: 0, max_kg: 5, gbp_per_kg: 12 })

  const refresh = () => pricingTiersApi.listTiers().then(r => setTiers(r.data?.tiers || []))

  useEffect(() => { refresh() }, [])

  const onSave = async (id, gbp_per_kg) => {
    try { await pricingTiersApi.updateTier(id, { gbp_per_kg: +gbp_per_kg }); toast.success('Saved'); refresh() }
    catch { toast.error('Save failed') }
  }
  const onAdd = async () => {
    try {
      await pricingTiersApi.createTier({
        ...draft,
        min_kg: +draft.min_kg, max_kg: +draft.max_kg, gbp_per_kg: +draft.gbp_per_kg,
      })
      toast.success('Tier added')
      refresh()
    } catch { toast.error('Failed to add tier') }
  }

  return (
    <>
      <GlassCard className="p-5 mb-5">
        <h3 className="text-lg font-black text-white mb-3">Add new tier</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={draft.channel}
            onChange={e => setDraft({ ...draft, channel: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line">
            <option value="UK_air">UK air</option>
            <option value="UK_sea">UK sea</option>
          </select>
          <input type="number" step="0.1" placeholder="Min kg" value={draft.min_kg}
            onChange={e => setDraft({ ...draft, min_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line" />
          <input type="number" step="0.1" placeholder="Max kg" value={draft.max_kg}
            onChange={e => setDraft({ ...draft, max_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line" />
          <input type="number" step="0.01" placeholder="£/kg" value={draft.gbp_per_kg}
            onChange={e => setDraft({ ...draft, gbp_per_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line" />
          <button onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
            <Plus size={14}/> Add
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-mute">
            <tr>
              <th className="text-left py-2">Channel</th>
              <th className="text-right py-2">Min kg</th>
              <th className="text-right py-2">Max kg</th>
              <th className="text-right py-2">£/kg</th>
              <th className="text-right py-2">Save</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map(t => (
              <TierRow key={t.id} t={t} onSave={onSave}/>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </>
  )
}

const TierRow = ({ t, onSave }) => {
  const [val, setVal] = useState(t.gbp_per_kg)
  useEffect(() => setVal(t.gbp_per_kg), [t.gbp_per_kg])
  return (
    <tr className="border-t border-line">
      <td className="py-2">{t.channel}</td>
      <td className="py-2 text-right">{t.min_kg}</td>
      <td className="py-2 text-right">{t.max_kg}</td>
      <td className="py-2 text-right">
        <input type="number" step="0.01" value={val}
          onChange={e => setVal(e.target.value)}
          className="w-24 px-2 py-1 rounded border border-line text-right" />
      </td>
      <td className="py-2 text-right">
        <button onClick={() => onSave(t.id, val)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white">
          <Save size={12}/> Save
        </button>
      </td>
    </tr>
  )
}

const FeesTab = () => {
  const [fees, setFees] = useState([])
  const refresh = () => pricingTiersApi.listFees().then(r => setFees(r.data?.fees || []))
  useEffect(() => { refresh() }, [])

  const onSave = async (id, amount) => {
    try { await pricingTiersApi.updateFee(id, { amount: +amount }); toast.success('Saved') }
    catch { toast.error('Save failed') }
  }

  return (
    <GlassCard className="p-5">
      <table className="min-w-full text-sm">
        <thead className="text-[10px] uppercase text-mute">
          <tr>
            <th className="text-left py-2">Code</th>
            <th className="text-left py-2">Label</th>
            <th className="text-left py-2">Currency</th>
            <th className="text-right py-2">Amount</th>
            <th className="text-right py-2">% ?</th>
            <th className="text-right py-2">Save</th>
          </tr>
        </thead>
        <tbody>
          {fees.map(f => <FeeRow key={f.id} f={f} onSave={onSave}/>)}
        </tbody>
      </table>
    </GlassCard>
  )
}

const FeeRow = ({ f, onSave }) => {
  const [val, setVal] = useState(f.amount)
  useEffect(() => setVal(f.amount), [f.amount])
  return (
    <tr className="border-t border-line">
      <td className="py-2 font-mono text-xs">{f.code}</td>
      <td className="py-2">{f.label}</td>
      <td className="py-2">{f.currency}</td>
      <td className="py-2 text-right">
        <input type="number" step="0.01" value={val}
          onChange={e => setVal(e.target.value)}
          className="w-24 px-2 py-1 rounded border border-line text-right" />
      </td>
      <td className="py-2 text-right">{f.is_percentage ? 'Yes' : 'No'}</td>
      <td className="py-2 text-right">
        <button onClick={() => onSave(f.id, val)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white">
          <Save size={12}/> Save
        </button>
      </td>
    </tr>
  )
}

const PromosTab = () => {
  const [promos, setPromos] = useState([])
  const [draft, setDraft]   = useState({ code: '', type: 'percent_off', value: 5, description: '' })

  const refresh = () => pricingTiersApi.listPromotions().then(r => setPromos(r.data?.promotions || []))
  useEffect(() => { refresh() }, [])

  const onAdd = async () => {
    if (!draft.code) { toast.error('Code required'); return }
    try {
      await pricingTiersApi.createPromotion({ ...draft, value: +draft.value })
      setDraft({ code: '', type: 'percent_off', value: 5, description: '' })
      refresh()
      toast.success('Promo added')
    } catch { toast.error('Failed to add promo') }
  }

  return (
    <>
      <GlassCard className="p-5 mb-5">
        <h3 className="text-lg font-black text-white mb-3">Create promo code</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={draft.code} placeholder="CODE"
            onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            className="px-3 py-2 rounded-xl border border-line" />
          <select value={draft.type}
            onChange={e => setDraft({ ...draft, type: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line">
            <option value="percent_off">% off</option>
            <option value="fixed_off">£ off</option>
            <option value="flat_gbp_per_kg">Flat £/kg</option>
          </select>
          <input type="number" placeholder="Value" value={draft.value}
            onChange={e => setDraft({ ...draft, value: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line" />
          <input placeholder="Description" value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line md:col-span-1" />
          <button onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
            <Plus size={14}/> Add
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-mute">
            <tr>
              <th className="text-left py-2">Code</th>
              <th className="text-left py-2">Type</th>
              <th className="text-right py-2">Value</th>
              <th className="text-right py-2">Uses</th>
              <th className="text-right py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {promos.map(p => (
              <tr key={p.id} className="border-t border-line">
                <td className="py-2 font-mono">{p.code}</td>
                <td className="py-2">{p.type}</td>
                <td className="py-2 text-right">{p.value}</td>
                <td className="py-2 text-right">{p.uses}{p.max_uses ? ` / ${p.max_uses}` : ''}</td>
                <td className="py-2 text-right">
                  <StatusBadge status={p.is_active ? 'paid' : 'closed'}/>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
    </>
  )
}

// ─── New: pricing model (the four numeric knobs) ────────────────────────────

const KNOB_META = {
  base_shipping_per_kg: { label: 'Base shipping (£ per kg)',       step: '0.01', help: 'Multiplied by the chargeable weight = max(actual_kg, vol_kg).' },
  base_handling_fee:    { label: 'Base handling fee (flat £)',     step: '0.01', help: 'Flat per-order handling fee. Replaces the old max(£3, 0.5×kg) rule.' },
  card_processing_pct:  { label: 'Card processing surcharge (%)',  step: '0.001', help: 'Applied to the FULL subtotal incl. customs. Stored as a fraction — 0.03 means 3%.', isPercent: true },
  dim_divisor:          { label: 'Volumetric divisor',             step: '1',    help: '5000 = courier convention, 6000 = IATA. Affects vol_kg = (L × W × H) / divisor.' },
}

const PricingModelTab = () => {
  const [settings, setSettings] = useState(null)
  const [draft,    setDraft]    = useState(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    pricingApi.getSettings()
      .then((r) => { setSettings(r.data?.settings || {}); setDraft(r.data?.settings || {}) })
      .catch(() => toast.error('Failed to load pricing settings'))
  }, [])

  if (!draft) return <GlassCard className="p-5">Loading…</GlassCard>

  const dirty = settings && Object.keys(KNOB_META).some((k) => Number(draft[k]) !== Number(settings[k]))

  const onSave = async () => {
    setSaving(true)
    try {
      const payload = {}
      for (const k of Object.keys(KNOB_META)) payload[k] = Number(draft[k])
      const r = await pricingApi.updateSettings(payload)
      setSettings(r.data?.settings || payload)
      toast.success('Pricing model saved')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassCard className="p-5">
      <p className="text-sm text-mute mb-4">
        Quote formula: <code className="px-1 py-0.5 rounded bg-white/[0.05] text-xs">total = (shipping + handling + special + customs) × (1 + card_pct)</code>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(KNOB_META).map(([key, meta]) => (
          <div key={key} className="rounded-xl border border-line p-4 bg-surface-2">
            <label className="block text-sm font-bold text-white mb-1">{meta.label}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step={meta.step}
                value={draft[key] ?? ''}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="flex-1 px-3 py-2 rounded-lg border border-line font-mono"
              />
              {meta.isPercent && draft[key] !== '' && Number.isFinite(Number(draft[key])) && (
                <span className="text-xs text-mute font-mono">= {(Number(draft[key]) * 100).toFixed(2)}%</span>
              )}
            </div>
            <p className="text-xs text-mute mt-2">{meta.help}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end mt-5">
        <button
          onClick={onSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 text-white text-sm font-bold">
          <Save size={14}/> {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </GlassCard>
  )
}

// ─── New: customs tiers ─────────────────────────────────────────────────────

const PCT_FIELDS = [
  { k: 'duty_pct', label: 'Duty %' },
  { k: 'vat_pct',  label: 'VAT %'  },
  { k: 'idf_pct',  label: 'IDF %'  },
  { k: 'rdl_pct',  label: 'RDL %'  },
]

const CustomsTiersTab = () => {
  const [tiers, setTiers] = useState([])

  const refresh = () =>
    pricingApi.getCustomsTiers()
      .then((r) => setTiers(r.data?.tiers || []))
      .catch(() => toast.error('Failed to load customs tiers'))

  useEffect(() => { refresh() }, [])

  const onSave = async (tier_key, draft) => {
    try {
      const payload = {}
      payload[tier_key] = {
        duty_pct: Number(draft.duty_pct),
        vat_pct:  Number(draft.vat_pct),
        idf_pct:  Number(draft.idf_pct),
        rdl_pct:  Number(draft.rdl_pct),
      }
      await pricingApi.updateCustomsTiers(payload)
      toast.success(`${tier_key} saved`)
      refresh()
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Save failed')
    }
  }

  return (
    <GlassCard className="p-5">
      <p className="text-sm text-mute mb-3">
        Edit per-tier rates. Values are fractions — <code className="px-1 bg-white/[0.05] rounded text-xs">0.25</code> means 25%.
      </p>
      <table className="min-w-full text-sm">
        <thead className="text-[10px] uppercase text-mute">
          <tr>
            <th className="text-left py-2">Tier</th>
            {PCT_FIELDS.map((f) => <th key={f.k} className="text-right py-2">{f.label}</th>)}
            <th className="text-right py-2">Save</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => <CustomsTierRow key={t.key} t={t} onSave={onSave} />)}
        </tbody>
      </table>
    </GlassCard>
  )
}

const CustomsTierRow = ({ t, onSave }) => {
  const [draft, setDraft] = useState({
    duty_pct: t.duty_rate ?? t.duty_pct ?? 0,
    vat_pct:  t.vat_rate  ?? t.vat_pct  ?? 0,
    idf_pct:  t.idf_rate  ?? t.idf_pct  ?? 0.035,
    rdl_pct:  t.rdl_rate  ?? t.rdl_pct  ?? 0.02,
  })
  useEffect(() => {
    setDraft({
      duty_pct: t.duty_rate ?? t.duty_pct ?? 0,
      vat_pct:  t.vat_rate  ?? t.vat_pct  ?? 0,
      idf_pct:  t.idf_rate  ?? t.idf_pct  ?? 0.035,
      rdl_pct:  t.rdl_rate  ?? t.rdl_pct  ?? 0.02,
    })
  }, [t.key])

  return (
    <tr className="border-t border-line">
      <td className="py-2">
        <div className="font-bold text-white">{t.label}</div>
        <div className="font-mono text-[10px] text-mute">{t.key}</div>
      </td>
      {PCT_FIELDS.map((f) => (
        <td key={f.k} className="py-2 text-right">
          <input type="number" step="0.001" value={draft[f.k]}
            onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
            className="w-24 px-2 py-1 rounded border border-line text-right font-mono" />
        </td>
      ))}
      <td className="py-2 text-right">
        <button onClick={() => onSave(t.key, draft)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-orange-500 hover:bg-orange-600 text-white">
          <Save size={12}/> Save
        </button>
      </td>
    </tr>
  )
}

// ─── New: HS code prefix → tier mapping ─────────────────────────────────────

const HsCodesTab = () => {
  const [mapping, setMapping] = useState([])
  const [tiers,   setTiers]   = useState([])
  const [draft,   setDraft]   = useState({ hs_prefix: '', tier_key: '', notes: '' })

  const refresh = async () => {
    try {
      const [m, t] = await Promise.all([
        pricingApi.getHsCodes(),
        pricingApi.getCustomsTiers(),
      ])
      setMapping(m.data?.mapping || [])
      setTiers((t.data?.tiers || []).map((x) => x.key))
    } catch {
      toast.error('Failed to load HS-code mapping')
    }
  }
  useEffect(() => { refresh() }, [])

  const onAdd = async () => {
    if (!/^[0-9]{2,10}$/.test(draft.hs_prefix)) { toast.error('HS prefix must be 2–10 digits'); return }
    if (!draft.tier_key) { toast.error('Pick a tier'); return }
    try {
      await pricingApi.updateHsCodes({ upsert: [{ ...draft }] })
      setDraft({ hs_prefix: '', tier_key: '', notes: '' })
      refresh()
      toast.success('HS prefix added')
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to add HS prefix')
    }
  }

  const onRemove = async (hs_prefix) => {
    try {
      await pricingApi.updateHsCodes({ upsert: [], remove: [hs_prefix] })
      refresh()
    } catch { toast.error('Failed to remove') }
  }

  return (
    <>
      <GlassCard className="p-5 mb-5">
        <h3 className="text-lg font-black text-white mb-3">Add HS prefix → tier</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input placeholder="HS prefix (e.g. 8517)"
            value={draft.hs_prefix}
            onChange={(e) => setDraft({ ...draft, hs_prefix: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line font-mono" />
          <select value={draft.tier_key}
            onChange={(e) => setDraft({ ...draft, tier_key: e.target.value })}
            className="px-3 py-2 rounded-xl border border-line">
            <option value="">— pick tier —</option>
            {tiers.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <input placeholder="Notes (optional)" value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            className="md:col-span-2 px-3 py-2 rounded-xl border border-line" />
          <button onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
            <Plus size={14}/> Add
          </button>
        </div>
        <p className="text-xs text-mute mt-2">
          Longest prefix wins on per-item resolution. Items whose hs_code matches no prefix fall back to <code className="px-1 bg-white/[0.05] rounded">general</code>.
        </p>
      </GlassCard>

      <GlassCard className="p-5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-mute">
            <tr>
              <th className="text-left py-2">HS prefix</th>
              <th className="text-left py-2">Tier</th>
              <th className="text-left py-2">Notes</th>
              <th className="text-right py-2">Remove</th>
            </tr>
          </thead>
          <tbody>
            {mapping.map((m) => (
              <tr key={m.hs_prefix} className="border-t border-line">
                <td className="py-2 font-mono">{m.hs_prefix}</td>
                <td className="py-2">{m.tier_key}</td>
                <td className="py-2 text-mute text-xs">{m.notes || ''}</td>
                <td className="py-2 text-right">
                  <button onClick={() => onRemove(m.hs_prefix)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/15 text-red-300">
                    <Trash2 size={12}/> Remove
                  </button>
                </td>
              </tr>
            ))}
            {mapping.length === 0 && (
              <tr><td colSpan="4" className="py-4 text-center text-dim text-sm">No HS prefixes yet</td></tr>
            )}
          </tbody>
        </table>
      </GlassCard>
    </>
  )
}

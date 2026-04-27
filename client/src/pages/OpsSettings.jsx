import React, { useEffect, useState } from 'react'
import { Settings, Save, Plus, Tag, Percent, Banknote } from 'lucide-react'
import toast from 'react-hot-toast'
import { pricingTiersApi } from '../api'
import { GlassStyles, GlassCard, LiquidBlob, PageHeading, StatusBadge } from '../components/GlassUI'

/**
 * /ops/settings — admin pricing + fee + promotion editor (Spec §4.7).
 */
export const OpsSettings = () => {
  const [tab, setTab] = useState('tiers')
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-orange-50 via-white to-blue-50">
      <GlassStyles />
      <LiquidBlob className="top-[-15%] right-[-15%] w-[40rem] h-[40rem]" color="bg-blue-200" />

      <div className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 py-10">
        <PageHeading icon={Settings} title="Pricing settings"
          subtitle="Tiers, fees and promo codes are read live by the calculator and intake quote." />

        <div className="flex gap-2 mb-6">
          <Tab active={tab === 'tiers'}      label="Pricing tiers" icon={<Tag size={14}/>}      onClick={() => setTab('tiers')} />
          <Tab active={tab === 'fees'}       label="Fees"          icon={<Banknote size={14}/>} onClick={() => setTab('fees')}  />
          <Tab active={tab === 'promotions'} label="Promotions"    icon={<Percent size={14}/>}  onClick={() => setTab('promotions')} />
        </div>

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
      ${active ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
               : 'bg-white/70 text-[#1e3a5f] border-slate-200 hover:border-slate-300'}`}>
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
        <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Add new tier</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <select value={draft.channel}
            onChange={e => setDraft({ ...draft, channel: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200">
            <option value="UK_air">UK air</option>
            <option value="UK_sea">UK sea</option>
            <option value="China_air">China air</option>
          </select>
          <input type="number" step="0.1" placeholder="Min kg" value={draft.min_kg}
            onChange={e => setDraft({ ...draft, min_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200" />
          <input type="number" step="0.1" placeholder="Max kg" value={draft.max_kg}
            onChange={e => setDraft({ ...draft, max_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200" />
          <input type="number" step="0.01" placeholder="£/kg" value={draft.gbp_per_kg}
            onChange={e => setDraft({ ...draft, gbp_per_kg: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200" />
          <button onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
            <Plus size={14}/> Add
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-slate-500">
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
    <tr className="border-t border-slate-100">
      <td className="py-2">{t.channel}</td>
      <td className="py-2 text-right">{t.min_kg}</td>
      <td className="py-2 text-right">{t.max_kg}</td>
      <td className="py-2 text-right">
        <input type="number" step="0.01" value={val}
          onChange={e => setVal(e.target.value)}
          className="w-24 px-2 py-1 rounded border border-slate-200 text-right" />
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
        <thead className="text-[10px] uppercase text-slate-500">
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
    <tr className="border-t border-slate-100">
      <td className="py-2 font-mono text-xs">{f.code}</td>
      <td className="py-2">{f.label}</td>
      <td className="py-2">{f.currency}</td>
      <td className="py-2 text-right">
        <input type="number" step="0.01" value={val}
          onChange={e => setVal(e.target.value)}
          className="w-24 px-2 py-1 rounded border border-slate-200 text-right" />
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
        <h3 className="text-lg font-black text-[#1e3a5f] mb-3">Create promo code</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <input value={draft.code} placeholder="CODE"
            onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase() })}
            className="px-3 py-2 rounded-xl border border-slate-200" />
          <select value={draft.type}
            onChange={e => setDraft({ ...draft, type: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200">
            <option value="percent_off">% off</option>
            <option value="fixed_off">£ off</option>
            <option value="flat_gbp_per_kg">Flat £/kg</option>
          </select>
          <input type="number" placeholder="Value" value={draft.value}
            onChange={e => setDraft({ ...draft, value: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200" />
          <input placeholder="Description" value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
            className="px-3 py-2 rounded-xl border border-slate-200 md:col-span-1" />
          <button onClick={onAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold">
            <Plus size={14}/> Add
          </button>
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <table className="min-w-full text-sm">
          <thead className="text-[10px] uppercase text-slate-500">
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
              <tr key={p.id} className="border-t border-slate-100">
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

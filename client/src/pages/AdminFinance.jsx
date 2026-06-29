import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import {
  Wallet, TrendingUp, TrendingDown, Scale, Landmark, Receipt, Plus, RefreshCw,
  Download, Printer, ArrowDownLeft, ArrowUpRight, X, ShieldCheck, AlertTriangle,
  PiggyBank, FileText, Settings as SettingsIcon, CheckCircle, Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { financeApi } from '../api'
import { useAuth } from '../context/AuthContext'
import { PrintableFinanceReport } from '../components/PrintableFinanceReport'

const CashflowBarChart = lazy(() =>
  import('../components/admin/FinanceCharts').then((m) => ({ default: m.CashflowBarChart })))
const ProfitAreaChart = lazy(() =>
  import('../components/admin/FinanceCharts').then((m) => ({ default: m.ProfitAreaChart })))
const ExpensePieChart = lazy(() =>
  import('../components/admin/FinanceCharts').then((m) => ({ default: m.ExpensePieChart })))

const ChartFallback = () => (
  <div className="h-full w-full flex items-center justify-center">
    <div className="h-2 w-24 rounded-full bg-slate-200/60 animate-pulse" />
  </div>
)

// ── helpers ──────────────────────────────────────────────────────────────────
const money = (minor, currency = 'GBP') =>
  `${currency} ${(Number(minor || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const today = () => new Date().toISOString().slice(0, 10)
const yearStart = () => `${new Date().getFullYear()}-01-01`

const GlassCard = ({ children, className = '' }) => (
  <div className={`relative overflow-hidden rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-200 shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] ${className}`}>
    {children}
  </div>
)

const Tile = ({ icon: Icon, label, value, sub, tone = 'slate' }) => {
  const tones = {
    slate: 'text-slate-700 bg-slate-100',
    green: 'text-emerald-700 bg-emerald-100',
    red: 'text-red-700 bg-red-100',
    orange: 'text-orange-700 bg-orange-100',
    blue: 'text-blue-700 bg-blue-100',
  }
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-900 tabular-nums">{value}</p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <div className={`h-11 w-11 rounded-2xl flex items-center justify-center ${tones[tone]}`}>
          <Icon size={20} />
        </div>
      </div>
    </GlassCard>
  )
}

const Badge = ({ status }) => {
  const map = {
    clear: ['Compliant', 'bg-emerald-100 text-emerald-700', ShieldCheck],
    filed: ['Filed', 'bg-emerald-100 text-emerald-700', CheckCircle],
    paid: ['Paid', 'bg-emerald-100 text-emerald-700', CheckCircle],
    due: ['Due', 'bg-amber-100 text-amber-700', Clock],
    open: ['Open', 'bg-slate-100 text-slate-600', Clock],
    upcoming: ['Upcoming', 'bg-amber-100 text-amber-700', Clock],
    overdue: ['Overdue', 'bg-red-100 text-red-700', AlertTriangle],
  }
  const [label, cls, Icon] = map[status] || map.open
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
      <Icon size={12} /> {label}
    </span>
  )
}

const TABS = [
  ['overview', 'Overview', Wallet],
  ['transactions', 'Money in / out', Receipt],
  ['pnl', 'Profit & Loss', Scale],
  ['tax', 'Tax & Compliance', Landmark],
  ['settings', 'Accounts & Settings', SettingsIcon],
]

export const AdminFinance = () => {
  const { user } = useAuth()
  const [tab, setTab] = useState('overview')
  const [currency, setCurrency] = useState('GBP')
  const [busy, setBusy] = useState(false)

  // shared lookups for forms
  const [categories, setCategories] = useState([])
  const [accounts, setAccounts] = useState([])
  const [taxCodes, setTaxCodes] = useState([])

  // tab data
  const [overview, setOverview] = useState(null)
  const [cashflow, setCashflow] = useState(null)
  const [pnl, setPnl] = useState(null)
  const [taxReport, setTaxReport] = useState(null)
  const [taxPeriods, setTaxPeriods] = useState([])
  const [transactions, setTransactions] = useState([])
  const [balances, setBalances] = useState([])
  const [range, setRange] = useState({ from: yearStart(), to: today() })

  const [showEntry, setShowEntry] = useState(false)
  const [printing, setPrinting] = useState(false)

  const loadLookups = useCallback(async () => {
    try {
      const [c, a, t] = await Promise.all([
        financeApi.listCategories(), financeApi.listAccounts(), financeApi.listTaxCodes(),
      ])
      setCategories(c.data.categories || [])
      setAccounts(a.data.accounts || [])
      setTaxCodes(t.data.codes || [])
    } catch (e) { /* surfaced per-tab */ }
  }, [])

  const loadOverview = useCallback(async () => {
    const [o, cf] = await Promise.all([
      financeApi.overview(currency),
      financeApi.reportCashflow({ from: range.from, to: range.to, currency }),
    ])
    setOverview(o.data)
    setCashflow(cf.data.report)
  }, [currency, range])

  const loadPnl = useCallback(async () => {
    const r = await financeApi.reportPnl({ from: range.from, to: range.to, currency })
    setPnl(r.data.report)
  }, [currency, range])

  const loadTax = useCallback(async () => {
    const [tr, tp] = await Promise.all([
      financeApi.reportTax({ from: range.from, to: range.to }),
      financeApi.listTaxPeriods(),
    ])
    setTaxReport(tr.data.report)
    setTaxPeriods(tp.data.periods || [])
  }, [range])

  const loadTransactions = useCallback(async () => {
    const r = await financeApi.listTransactions({ limit: 100 })
    setTransactions(r.data.transactions || [])
  }, [])

  const loadBalances = useCallback(async () => {
    const r = await financeApi.accountBalances()
    setBalances(r.data.accounts || [])
  }, [])

  useEffect(() => { loadLookups() }, [loadLookups])

  useEffect(() => {
    const run = async () => {
      setBusy(true)
      try {
        if (tab === 'overview') await loadOverview()
        else if (tab === 'pnl') await loadPnl()
        else if (tab === 'tax') await loadTax()
        else if (tab === 'transactions') await loadTransactions()
        else if (tab === 'settings') await loadBalances()
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Failed to load finance data')
      } finally { setBusy(false) }
    }
    run()
  }, [tab, loadOverview, loadPnl, loadTax, loadTransactions, loadBalances])

  const sync = async () => {
    setBusy(true)
    try {
      await financeApi.sync()
      toast.success('Ledger synced from payments & invoices')
      if (tab === 'overview') await loadOverview()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Sync failed')
    } finally { setBusy(false) }
  }

  const exportCsv = async (type) => {
    try {
      const res = await financeApi.exportReport(type, { from: range.from, to: range.to, currency })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `finance-${type}-${range.from}_to_${range.to}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      toast.error('Export failed')
    }
  }

  const printPdf = async () => {
    if (!pnl) await loadPnl()
    setPrinting(true)
    setTimeout(() => { window.print(); setPrinting(false) }, 150)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-6 md:px-8">
      <div className="max-w-7xl mx-auto">
        {/* header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-2">
              <PiggyBank className="text-orange-500" /> Finance Management
            </h1>
            <p className="text-sm text-slate-500">Business bookkeeping · {user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl bg-white border border-slate-200 p-1">
              {['GBP', 'KES'].map((c) => (
                <button key={c} onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 text-sm font-bold rounded-lg ${currency === c ? 'bg-orange-500 text-white' : 'text-slate-600'}`}>
                  {c}
                </button>
              ))}
            </div>
            <button onClick={sync} disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Sync
            </button>
            <button onClick={() => setShowEntry(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold hover:bg-orange-600">
              <Plus size={16} /> Record
            </button>
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 no-scrollbar">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab overview={overview} cashflow={cashflow} currency={currency} />}
        {tab === 'transactions' && <TransactionsTab transactions={transactions} currency={currency}
          onVoid={async (id) => { await financeApi.voidTransaction(id); toast.success('Voided'); loadTransactions() }}
          onExport={() => exportCsv('transactions')} />}
        {tab === 'pnl' && <PnlTab pnl={pnl} currency={currency} range={range} setRange={setRange}
          onExport={() => exportCsv('pnl')} onPrint={printPdf} />}
        {tab === 'tax' && <TaxTab report={taxReport} periods={taxPeriods} currency={currency}
          onExport={() => exportCsv('tax')} reload={loadTax} />}
        {tab === 'settings' && <SettingsTab balances={balances} categories={categories} taxCodes={taxCodes}
          reload={() => { loadBalances(); loadLookups() }} />}
      </div>

      {showEntry && (
        <EntryModal categories={categories} accounts={accounts} taxCodes={taxCodes}
          onClose={() => setShowEntry(false)}
          onSaved={() => { setShowEntry(false); toast.success('Recorded'); if (tab === 'transactions') loadTransactions(); if (tab === 'overview') loadOverview() }} />
      )}

      {printing && <PrintableFinanceReport pnl={pnl} tax={taxReport} currency={currency} from={range.from} to={range.to} />}
    </div>
  )
}

// ── Overview ─────────────────────────────────────────────────────────────────
function OverviewTab({ overview, cashflow, currency }) {
  if (!overview) return <ChartFallback />
  const ma = overview.money_available
  const pl = overview.profit_loss
  const cmp = overview.compliance
  const months = (cashflow?.months || []).map((m) => ({
    month: m.month, income: m.in_minor / 100, expense: m.out_minor / 100, net: m.net_minor / 100,
  }))
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Wallet} tone="blue" label="Money available" value={money(ma.reporting_minor, currency)}
          sub={`${money(ma.gbp_minor, 'GBP')} · ${money(ma.kes_minor, 'KES')}`} />
        <Tile icon={pl.mtd.net_minor >= 0 ? TrendingUp : TrendingDown} tone={pl.mtd.net_minor >= 0 ? 'green' : 'red'}
          label="Profit (this month)" value={money(pl.mtd.net_minor, currency)}
          sub={`In ${money(pl.mtd.income_minor, currency)} · Out ${money(pl.mtd.expense_minor, currency)}`} />
        <Tile icon={pl.ytd.net_minor >= 0 ? TrendingUp : TrendingDown} tone={pl.ytd.net_minor >= 0 ? 'green' : 'red'}
          label="Profit (year to date)" value={money(pl.ytd.net_minor, currency)} />
        <Tile icon={cmp.status === 'overdue' ? AlertTriangle : ShieldCheck} tone={cmp.status === 'overdue' ? 'red' : cmp.status === 'due' ? 'orange' : 'green'}
          label="Tax compliance" value={cmp.status === 'clear' ? 'Compliant' : cmp.status === 'due' ? `${cmp.upcoming} due` : `${cmp.overdue} overdue`}
          sub={cmp.next_due ? `Next due ${new Date(cmp.next_due).toLocaleDateString('en-GB')}` : 'No filings pending'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Money in vs out (monthly)</h3>
          <div className="h-64"><Suspense fallback={<ChartFallback />}><CashflowBarChart data={months} currency={currency} /></Suspense></div>
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Net profit trend</h3>
          <div className="h-64"><Suspense fallback={<ChartFallback />}><ProfitAreaChart data={months} currency={currency} /></Suspense></div>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Cash by account</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ma.accounts.map((a) => (
            <div key={a.id} className="rounded-2xl border border-slate-200 p-3">
              <p className="text-xs text-slate-400 font-bold uppercase">{a.name}</p>
              <p className="mt-1 font-black text-slate-900 tabular-nums">{money(a.balance_minor, a.currency)}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  )
}

// ── Transactions ─────────────────────────────────────────────────────────────
function TransactionsTab({ transactions, onVoid, onExport }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-700">Ledger ({transactions.length})</h3>
        <button onClick={onExport} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900">
          <Download size={16} /> CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-200">
              <th className="py-2 pr-3">Date</th><th className="pr-3">Type</th><th className="pr-3">Description</th>
              <th className="pr-3">Category</th><th className="pr-3 text-right">Amount</th><th className="pr-3">Source</th><th></th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t.id} className={`border-b border-slate-100 ${t.status === 'void' ? 'opacity-40 line-through' : ''}`}>
                <td className="py-2 pr-3 whitespace-nowrap text-slate-500">{String(t.occurred_on).slice(0, 10)}</td>
                <td className="pr-3">
                  <span className={`inline-flex items-center gap-1 font-bold ${t.direction === 'in' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {t.direction === 'in' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{t.direction === 'in' ? 'In' : 'Out'}
                  </span>
                </td>
                <td className="pr-3 text-slate-700">{t.description || '—'}{t.counterparty ? ` · ${t.counterparty}` : ''}</td>
                <td className="pr-3 text-slate-500">{t.category_name || '—'}</td>
                <td className="pr-3 text-right font-bold tabular-nums text-slate-900">{money(t.amount_minor, t.currency)}</td>
                <td className="pr-3"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{t.source}</span></td>
                <td className="text-right">
                  {t.status !== 'void' && (
                    <button onClick={() => onVoid(t.id)} className="text-xs text-red-500 hover:underline">Void</button>
                  )}
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-slate-400">No transactions yet. Use “Record” or “Sync”.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

// ── P&L ──────────────────────────────────────────────────────────────────────
function PnlTab({ pnl, currency, range, setRange, onExport, onPrint }) {
  if (!pnl) return <ChartFallback />
  const pie = (pnl.expense || []).map((c) => ({ name: c.name || 'Uncategorised', value: Number(c.total_minor) / 100 }))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <span className="text-slate-400">→</span>
        <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
        <div className="flex-1" />
        <button onClick={onExport} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-600"><Download size={16} /> CSV</button>
        <button onClick={onPrint} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-600"><Printer size={16} /> PDF</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Profit &amp; Loss ({currency})</h3>
          <table className="w-full text-sm">
            <tbody>
              {(pnl.income || []).map((c) => (
                <tr key={c.id || c.name}><td className="py-1.5 text-slate-600">{c.name || 'Uncategorised'}</td>
                  <td className="text-right font-bold text-emerald-600 tabular-nums">{money(c.total_minor, currency)}</td></tr>
              ))}
              <tr className="border-t border-slate-200"><td className="py-1.5 font-bold">Total income</td>
                <td className="text-right font-black text-emerald-700 tabular-nums">{money(pnl.income_minor, currency)}</td></tr>
              {(pnl.expense || []).map((c) => (
                <tr key={c.id || c.name}><td className="py-1.5 text-slate-600">{c.name || 'Uncategorised'}</td>
                  <td className="text-right font-bold text-red-600 tabular-nums">{money(c.total_minor, currency)}</td></tr>
              ))}
              <tr className="border-t border-slate-200"><td className="py-1.5 font-bold">Total expenses</td>
                <td className="text-right font-black text-red-700 tabular-nums">{money(pnl.expense_minor, currency)}</td></tr>
              <tr className="border-t-2 border-slate-900"><td className="py-2 font-black">Net {pnl.net_minor >= 0 ? 'profit' : 'loss'}</td>
                <td className={`text-right font-black tabular-nums ${pnl.net_minor >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{money(pnl.net_minor, currency)}</td></tr>
            </tbody>
          </table>
        </GlassCard>
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Expense breakdown</h3>
          <div className="h-64"><Suspense fallback={<ChartFallback />}><ExpensePieChart data={pie} /></Suspense></div>
        </GlassCard>
      </div>
    </div>
  )
}

// ── Tax & Compliance ─────────────────────────────────────────────────────────
function TaxTab({ report, periods, currency, onExport, reload }) {
  const [form, setForm] = useState({ jurisdiction: 'UK', tax_kind: 'vat', period_start: '', period_end: '', due_date: '' })
  const createPeriod = async (e) => {
    e.preventDefault()
    try { await financeApi.createTaxPeriod(form); toast.success('Tax period created'); reload() }
    catch (err) { toast.error(err?.response?.data?.message || 'Failed') }
  }
  const mark = async (id, status) => {
    try { await financeApi.updateTaxPeriod(id, { status }); toast.success(`Marked ${status}`); reload() }
    catch (err) { toast.error('Failed') }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-700">VAT summary ({currency})</h3>
            <button onClick={onExport} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600"><Download size={16} /> CSV</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-slate-400 text-left"><th className="py-1">Code</th><th className="text-right">Collected</th><th className="text-right">Reclaimable</th><th className="text-right">Net</th></tr></thead>
            <tbody>
              {(report?.lines || []).map((l) => (
                <tr key={l.tax_code} className="border-t border-slate-100">
                  <td className="py-1.5 text-slate-600">{l.name}</td>
                  <td className="text-right tabular-nums">{money(l.collected_minor, currency)}</td>
                  <td className="text-right tabular-nums">{money(l.reclaimable_minor, currency)}</td>
                  <td className="text-right font-bold tabular-nums">{money(l.net_minor, currency)}</td>
                </tr>
              ))}
              {(!report || report.lines.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No tax-coded transactions in range.</td></tr>}
            </tbody>
          </table>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">New filing period</h3>
          <form onSubmit={createPeriod} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={form.jurisdiction} onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="UK">UK (HMRC)</option><option value="KE">Kenya (KRA)</option>
              </select>
              <select value={form.tax_kind} onChange={(e) => setForm({ ...form, tax_kind: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <option value="vat">VAT</option><option value="income_tax">Income tax</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">Period start<input type="date" required value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label className="text-xs text-slate-500">Period end<input type="date" required value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>
            <label className="text-xs text-slate-500 block">Filing due date<input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <button className="w-full py-2 rounded-xl bg-orange-500 text-white font-bold text-sm">Create period</button>
          </form>
        </GlassCard>
      </div>

      <GlassCard className="p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">Filing periods</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-slate-400 text-left border-b border-slate-200"><th className="py-2">Jurisdiction</th><th>Kind</th><th>Period</th><th>Due</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-2">{p.jurisdiction}</td>
                  <td className="uppercase text-xs">{p.tax_kind}</td>
                  <td className="text-slate-500">{String(p.period_start).slice(0, 10)} → {String(p.period_end).slice(0, 10)}</td>
                  <td className="text-slate-500">{String(p.due_date).slice(0, 10)}</td>
                  <td className="font-bold tabular-nums">{money(p.amount_due_minor, p.currency)}</td>
                  <td><Badge status={p.effective_status || p.status} /></td>
                  <td className="text-right space-x-2">
                    {p.status !== 'filed' && p.status !== 'paid' && <button onClick={() => mark(p.id, 'filed')} className="text-xs text-blue-600 hover:underline">Mark filed</button>}
                    {p.status !== 'paid' && <button onClick={() => mark(p.id, 'paid')} className="text-xs text-emerald-600 hover:underline">Mark paid</button>}
                  </td>
                </tr>
              ))}
              {periods.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-slate-400">No filing periods yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsTab({ balances, categories, taxCodes, reload }) {
  const [acc, setAcc] = useState({ name: '', type: 'bank', currency: 'GBP', opening_balance: '' })
  const addAccount = async (e) => {
    e.preventDefault()
    try { await financeApi.createAccount(acc); toast.success('Account added'); setAcc({ name: '', type: 'bank', currency: 'GBP', opening_balance: '' }); reload() }
    catch (err) { toast.error(err?.response?.data?.message || 'Failed') }
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GlassCard className="p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Accounts &amp; balances</h3>
          <div className="space-y-2 mb-4">
            {balances.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2">
                <div><p className="font-bold text-slate-800">{a.name}</p><p className="text-xs text-slate-400 uppercase">{a.type} · {a.currency}</p></div>
                <p className="font-black tabular-nums">{money(a.balance_minor, a.currency)}</p>
              </div>
            ))}
          </div>
          <form onSubmit={addAccount} className="space-y-2 border-t border-slate-100 pt-3">
            <input required placeholder="Account name" value={acc.name} onChange={(e) => setAcc({ ...acc, name: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <select value={acc.type} onChange={(e) => setAcc({ ...acc, type: e.target.value })} className="rounded-xl border border-slate-200 px-2 py-2 text-sm">
                {['bank', 'cash', 'mpesa', 'stripe', 'other'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={acc.currency} onChange={(e) => setAcc({ ...acc, currency: e.target.value })} className="rounded-xl border border-slate-200 px-2 py-2 text-sm">
                <option value="GBP">GBP</option><option value="KES">KES</option>
              </select>
              <input type="number" step="0.01" placeholder="Opening" value={acc.opening_balance} onChange={(e) => setAcc({ ...acc, opening_balance: e.target.value })} className="rounded-xl border border-slate-200 px-2 py-2 text-sm" />
            </div>
            <button className="w-full py-2 rounded-xl bg-slate-900 text-white font-bold text-sm">Add account</button>
          </form>
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Categories ({categories.length})</h3>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c.id} className={`text-xs px-2.5 py-1 rounded-full font-bold ${c.kind === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{c.name}</span>
              ))}
            </div>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Tax codes ({taxCodes.length})</h3>
            <div className="flex flex-wrap gap-2">
              {taxCodes.map((t) => (
                <span key={t.id} className="text-xs px-2.5 py-1 rounded-full font-bold bg-slate-100 text-slate-600">{t.name}</span>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

// ── Record money in/out modal ────────────────────────────────────────────────
function EntryModal({ categories, accounts, taxCodes, onClose, onSaved }) {
  const [f, setF] = useState({
    direction: 'out', amount: '', currency: 'GBP', category_id: '', account_id: '',
    occurred_on: today(), description: '', counterparty: '', reference: '', tax_code: '',
  })
  const [saving, setSaving] = useState(false)
  const cats = categories.filter((c) => c.kind === (f.direction === 'in' ? 'income' : 'expense'))

  const submit = async (e) => {
    e.preventDefault()
    if (!(Number(f.amount) > 0)) { toast.error('Enter a positive amount'); return }
    setSaving(true)
    try { await financeApi.createTransaction(f); onSaved() }
    catch (err) { toast.error(err?.response?.data?.message || 'Failed to record'); }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-black text-slate-900">Record money {f.direction === 'in' ? 'in' : 'out'}</h3>
          <button onClick={onClose}><X className="text-slate-400" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {['out', 'in'].map((d) => (
              <button type="button" key={d} onClick={() => setF({ ...f, direction: d, category_id: '' })}
                className={`py-2 rounded-xl font-bold text-sm ${f.direction === d ? (d === 'in' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white') : 'bg-slate-100 text-slate-600'}`}>
                {d === 'in' ? 'Money in' : 'Money out'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" step="0.01" required placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="rounded-xl border border-slate-200 px-2 py-2 text-sm">
              <option value="GBP">GBP</option><option value="KES">KES</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Category…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={f.account_id} onChange={(e) => setF({ ...f, account_id: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">Account…</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">Date<input type="date" value={f.occurred_on} onChange={(e) => setF({ ...f, occurred_on: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            <select value={f.tax_code} onChange={(e) => setF({ ...f, tax_code: e.target.value })} className="self-end rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="">No tax</option>
              {taxCodes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <input placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Counterparty (who)" value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Reference" value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button disabled={saving} className="w-full py-2.5 rounded-xl bg-orange-500 text-white font-bold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminFinance

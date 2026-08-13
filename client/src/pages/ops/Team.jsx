import React, { useCallback, useEffect, useState } from 'react'
import { Users, UserPlus, AlertTriangle, RefreshCw, Trash2, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'
import { adminApi } from '../../api'
import { GlassStyles, GlassCard, PageHeading, StatusBadge } from '../../components/GlassUI'

// What survived the old admin dashboard.
//
// That page carried revenue reports, legacy order tables, transaction
// queues and a market breakdown — all of it for products this business no
// longer runs. Two things there were still load-bearing: somewhere to
// create the accounts staff log in with, and somewhere to see what the
// server is failing at. They live here now, and nothing else does.

const ROLES = ['operator', 'admin']
const field = 'w-full px-3 py-2.5 rounded-xl bg-white/5 border border-line text-white placeholder:text-mute text-sm focus:outline-none focus:border-ember-500/50'

export function Team() {
  const [users, setUsers] = useState([])
  const [logs, setLogs] = useState([])
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'operator' })

  const load = useCallback(async () => {
    try {
      const [u, l] = await Promise.all([
        adminApi.listUsers({ limit: 100 }),
        adminApi.getErrorLogs({ limit: 15 }).catch(() => ({ data: { logs: [] } })),
      ])
      // Customers from the old platform still exist as rows; only staff
      // can sign in now, so only staff belong on this screen.
      const all = u.data.users || u.data.data || []
      setUsers(all.filter((x) => ROLES.includes(x.role)))
      setLogs(l.data.logs || l.data.errors || [])
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load the team')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const run = (fn, ok) => async () => {
    setBusy(true)
    try { await fn(); if (ok) toast.success(ok); await load() }
    catch (e) { toast.error(e.response?.data?.message || 'Action failed') }
    finally { setBusy(false) }
  }

  const create = async (e) => {
    e.preventDefault()
    if (!f.email.trim() || !f.password.trim()) return toast.error('Email and password are required')
    await run(() => adminApi.createUser({ ...f, email: f.email.trim().toLowerCase() }),
      `${f.role} account created`)()
    setF({ name: '', email: '', password: '', role: 'operator' })
    setAdding(false)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <GlassStyles />
      <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
        <PageHeading icon={Users} title="Team" subtitle="Who can sign in, and what the server is complaining about" />
        <div className="flex gap-2">
          <button onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold">
            <UserPlus size={17} /> Add
          </button>
          <button onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-line text-white hover:bg-white/10">
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      {adding && (
        <GlassCard className="p-5 mb-4">
          <form onSubmit={create} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="Full name" className={field} />
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="name@thapsus.uk" type="email" className={field} />
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              placeholder="Temporary password" className={field} />
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={field}>
              <option value="operator">Operator — inbox and pipeline</option>
              <option value="admin">Admin — also payments and settings</option>
            </select>
            <button disabled={busy}
              className="sm:col-span-2 py-2.5 rounded-xl bg-ember-600 hover:bg-ember-500 text-white font-semibold disabled:opacity-50">
              Create account
            </button>
          </form>
        </GlassCard>
      )}

      <GlassCard className="p-5 mb-4">
        <h2 className="font-bold text-white mb-3">Staff accounts</h2>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-line last:border-0">
              <div className="min-w-0">
                <p className="text-white text-sm truncate">{u.name || u.email}</p>
                <p className="text-xs text-mute truncate">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={u.is_active === false ? 'inactive' : u.role} />
                <button onClick={run(() => adminApi.resetUserPassword(u.id), 'Reset email sent')}
                  disabled={busy} title="Send a password-reset email"
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-xs">
                  <KeyRound size={13} />
                </button>
                <button
                  onClick={run(() => adminApi.updateUser(u.id, { is_active: u.is_active === false }),
                    u.is_active === false ? 'Account enabled' : 'Account disabled')}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-line text-white hover:bg-white/10 text-xs">
                  {u.is_active === false ? 'Enable' : 'Disable'}
                </button>
                <button
                  onClick={() => window.confirm(`Delete ${u.email}? This cannot be undone.`)
                    && run(() => adminApi.deleteUser(u.id), 'Account deleted')()}
                  disabled={busy}
                  className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 text-xs">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="text-sm text-mute">No staff accounts.</p>}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="font-bold text-white mb-3 inline-flex items-center gap-2">
          <AlertTriangle size={16} /> Recent server errors
        </h2>
        <div className="space-y-2">
          {logs.map((l) => (
            <div key={l.id} className="text-xs border-b border-line last:border-0 pb-2">
              <p className="text-white truncate">{l.route || l.path || l.context || 'error'} — {l.message}</p>
              <p className="text-mute">{new Date(l.created_at).toLocaleString('en-KE')}</p>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-mute">Nothing logged. Good sign.</p>}
        </div>
      </GlassCard>
    </div>
  )
}

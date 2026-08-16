import { useCurrency } from '../CurrencyContext'
import { useRef, useState } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { AppData, StartupCost, WorkspaceData } from '../types'
import { formatCurrency, reconcileStartupCostTransactions } from '../utils'
import { updateActiveWorkspace } from '../storage'

const PRESET_CATEGORIES = ['Legal', 'Equipment', 'Software', 'Marketing', 'Office', 'Hiring', 'R&D', 'Free Zone', 'Other']
const CAT_COLORS = ['#6366f1', '#f97316', '#14b8a6', '#f0506e', '#f59e0b', '#22c55e', '#a855f7', '#0ea5e9', '#94a3b8']

function catColor(cat: string) {
  const idx = PRESET_CATEGORIES.indexOf(cat)
  return idx >= 0 ? CAT_COLORS[idx] : CAT_COLORS[CAT_COLORS.length - 1]
}

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const EMPTY: Omit<StartupCost, 'id'> = { date: '', description: '', category: 'Other', amount: 0, notes: '' }

export default function StartupCostsPage({ data, ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const allCosts = ws.startupCosts ?? []
  const [pageTab, setPageTab] = useState<'invested' | 'planned'>('invested')
  const [form, setForm] = useState<Omit<StartupCost, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [catInput, setCatInput] = useState(false)
  const [sortCol, setSortCol] = useState<'date' | 'amount' | 'category'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const formRef = useRef<HTMLDivElement>(null)

  const costs = allCosts.filter((c) => pageTab === 'planned' ? !!c.planned : !c.planned)
  const totalInvested = costs.reduce((s, c) => s + c.amount, 0)

  const byCategory = Array.from(
    costs.reduce((m, c) => {
      m.set(c.category, (m.get(c.category) ?? 0) + c.amount)
      return m
    }, new Map<string, number>()),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const sorted = [...costs].sort((a, b) => {
    const highlightCmp = (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0)
    if (highlightCmp !== 0) return highlightCmp
    let cmp = 0
    if (sortCol === 'date') cmp = a.date.localeCompare(b.date)
    else if (sortCol === 'amount') cmp = a.amount - b.amount
    else cmp = a.category.localeCompare(b.category)
    return sortDir === 'desc' ? -cmp : cmp
  })

  function toggleSort(col: typeof sortCol) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('desc') }
  }

  function toggleHighlight(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        startupCosts: (w.startupCosts ?? []).map((c) => (c.id === id ? { ...c, highlighted: !c.highlighted } : c)),
      })),
    )
  }

  function save() {
    if (!form.description.trim() || form.amount <= 0 || !form.date) return
    const isPlanned = pageTab === 'planned'
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const list = w.startupCosts ?? []
        const updated = editId
          ? { ...w, startupCosts: list.map((c) => (c.id === editId ? { ...form, id: editId, planned: isPlanned } : c)) }
          : { ...w, startupCosts: [...list, { ...form, id: crypto.randomUUID(), planned: isPlanned }] }
        return isPlanned ? updated : reconcileStartupCostTransactions(updated)
      }),
    )
    setForm(EMPTY)
    setEditId(null)
  }

  function startEdit(cost: StartupCost) {
    setForm({ date: cost.date, description: cost.description, category: cost.category, amount: cost.amount, notes: cost.notes ?? '' })
    setEditId(cost.id)
    setCatInput(!PRESET_CATEGORIES.includes(cost.category))
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function remove(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const updated = { ...w, startupCosts: (w.startupCosts ?? []).filter((c) => c.id !== id) }
        return pageTab === 'planned' ? updated : reconcileStartupCostTransactions(updated)
      }),
    )
    if (editId === id) { setForm(EMPTY); setEditId(null) }
  }

  function cancel() { setForm(EMPTY); setEditId(null) }

  const th = (col: typeof sortCol, label: string) => (
    <th onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none' }}>
      {label} {sortCol === col ? (sortDir === 'desc' ? '↓' : '↑') : ''}
    </th>
  )

  const investedCount = allCosts.filter((c) => !c.planned).length
  const plannedCount = allCosts.filter((c) => !!c.planned).length

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Startup &amp; Investment Costs</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Track every one-time cost you invested or plan to invest to build or grow the business.
        </p>
      </div>

      <div className="tabs">
        <button className={pageTab === 'invested' ? 'active' : ''} onClick={() => { setPageTab('invested'); setForm(EMPTY); setEditId(null) }}>
          💸 Already Invested {investedCount > 0 ? `(${investedCount})` : ''}
        </button>
        <button className={pageTab === 'planned' ? 'active' : ''} onClick={() => { setPageTab('planned'); setForm(EMPTY); setEditId(null) }}>
          📋 Future / Planned {plannedCount > 0 ? `(${plannedCount})` : ''}
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">{pageTab === 'planned' ? 'Total Planned' : 'Total Invested'}</div>
          <div className="value negative">{fmt(totalInvested)}</div>
          <div className="sub">{costs.length} line item{costs.length !== 1 ? 's' : ''}</div>
        </div>
        {pageTab === 'planned' && investedCount > 0 && (
          <div className="stat-card">
            <div className="label">Already Invested</div>
            <div className="value negative">{formatCurrency(allCosts.filter((c) => !c.planned).reduce((s, c) => s + c.amount, 0), ws.currency)}</div>
            <div className="sub">{investedCount} item{investedCount !== 1 ? 's' : ''}</div>
          </div>
        )}
        {byCategory.slice(0, 3).map((b) => (
          <div className="stat-card" key={b.name}>
            <div className="label">{b.name}</div>
            <div className="value">{fmt(b.value)}</div>
            <div className="sub">{totalInvested > 0 ? `${((b.value / totalInvested) * 100).toFixed(1)}% of total` : ''}</div>
          </div>
        ))}
      </div>

      {/* ── Add / Edit form ────────────────────────────────────────────── */}
      <div className="panel" ref={formRef}>
        <div className="panel-header">
          <h2>{editId ? 'Edit Cost' : pageTab === 'planned' ? 'Add Planned Cost' : 'Add Investment Cost'}</h2>
          {pageTab === 'planned' && !editId && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              These are future costs you expect to incur — they won't appear in your transaction history until moved to Invested.
            </p>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          <div className="field">
            <label>{pageTab === 'planned' ? 'Expected Date' : 'Date'}</label>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <input
              type="text"
              className="table-input"
              placeholder="e.g. Company registration"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Category</label>
            {catInput ? (
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  type="text"
                  className="table-input"
                  placeholder="Custom category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  style={{ flex: 1 }}
                />
                <button className="btn ghost small" onClick={() => { setCatInput(false); setForm({ ...form, category: 'Other' }) }}>×</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <select
                  value={form.category}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') { setCatInput(true); setForm({ ...form, category: '' }) }
                    else setForm({ ...form, category: e.target.value })
                  }}
                  style={{ flex: 1 }}
                >
                  {PRESET_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  <option value="__custom__">Custom…</option>
                </select>
              </div>
            )}
          </div>
          <div className="field">
            <label>Amount ({curr})</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input
              type="text"
              className="table-input"
              placeholder="Vendor, receipt #, etc."
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn accent"
            disabled={!form.description.trim() || form.amount <= 0 || !form.date}
            onClick={save}
          >
            {editId ? 'Save Changes' : pageTab === 'planned' ? '+ Add Planned Cost' : '+ Add Cost'}
          </button>
          {editId && <button className="btn ghost" onClick={cancel}>Cancel</button>}
        </div>
      </div>

      {costs.length > 0 && (
        <>
          {/* ── Category breakdown chart ──────────────────────────────── */}
          <div className="panel">
            <div className="panel-header"><h2>Breakdown by Category</h2></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'center' }}>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {byCategory.map((entry) => (
                        <Cell key={entry.name} fill={catColor(entry.name)} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((b) => (
                    <tr key={b.name}>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: catColor(b.name), flexShrink: 0 }} />
                          {b.name}
                        </span>
                      </td>
                      <td className="amount negative">{fmt(b.value)}</td>
                      <td className="amount" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                        {totalInvested > 0 ? `${((b.value / totalInvested) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    <td className="amount negative"><strong>{fmt(totalInvested)}</strong></td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── All costs table ───────────────────────────────────────── */}
          <div className="panel">
            <div className="panel-header">
              <h2>{pageTab === 'planned' ? 'Planned Costs' : 'All Costs'}</h2>
            </div>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    {th('date', pageTab === 'planned' ? 'Expected Date' : 'Date')}
                    <th>Description</th>
                    {th('category', 'Category')}
                    {th('amount', `Amount (${curr})`)}
                    <th>Notes</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c) => (
                    <tr
                      key={c.id}
                      className={editId === c.id ? 'editing' : ''}
                      style={c.highlighted ? { background: '#f59e0b0c' } : undefined}
                    >
                      <td>{c.date}</td>
                      <td>
                        {c.highlighted && <span style={{ marginRight: 6 }}>★</span>}
                        {c.description}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: catColor(c.category), flexShrink: 0 }} />
                          {c.category}
                        </span>
                      </td>
                      <td className="amount negative">{fmt(c.amount)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{c.notes || '—'}</td>
                      <td className="actions">
                        <button
                          className="btn ghost small"
                          onClick={() => toggleHighlight(c.id)}
                          title={c.highlighted ? 'Remove highlight' : 'Highlight as priority cost'}
                          style={c.highlighted ? { color: '#f59e0b', borderColor: '#f59e0b' } : undefined}
                        >
                          {c.highlighted ? '★' : '☆'}
                        </button>
                        <button className="btn ghost small" onClick={() => startEdit(c)}>Edit</button>
                        <button className="btn ghost small danger" onClick={() => remove(c.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><strong>Total</strong></td>
                    <td className="amount negative"><strong>{fmt(totalInvested)}</strong></td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}

      {costs.length === 0 && (
        <div className="panel">
          <div className="empty-state">
            {pageTab === 'planned'
              ? 'No planned costs yet. Add future investments you expect to make.'
              : 'No investment costs yet. Add your first one above to start tracking what you\'ve put in.'}
          </div>
        </div>
      )}
    </div>
  )
}

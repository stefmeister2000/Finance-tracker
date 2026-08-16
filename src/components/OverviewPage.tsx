import { useCurrency } from '../CurrencyContext'
import { useMemo, useState } from 'react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { v4 as uuid } from 'uuid'
import type { AppData, FreelanceClient, WorkspaceData } from '../types'
import type { View } from '../App'
import { currentMonthId, loadData, monthLabel, sortedMonthIds, updateActiveWorkspace } from '../storage'
import {
  adSpendHistory,
  adSpendTotals,
  allMonthIds,
  cashFlowHistory,
  formatCurrency,
  netWorthAtMonth,
  netWorthHistory,
  totalsByCategoryRange,
} from '../utils'
import AddMonthModal from './AddMonthModal'
import CategoryTag from './CategoryTag'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  setView: (v: View) => void
  onAddMonth: (id: string, copyFromPrev: boolean) => void
}

export default function OverviewPage({ data, ws, setData, setView, onAddMonth }: Props) {
  const { fmt, curr } = useCurrency()
  const [addOpen, setAddOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showStripeSetup, setShowStripeSetup] = useState(false)
  const [stripeKeyDraft, setStripeKeyDraft] = useState(ws.stripeConfig?.apiKey ?? '')
  const [stripeSyncing, setStripeSyncing] = useState(false)
  const [stripeError, setStripeError] = useState<string | null>(null)
  const [stripeStatus, setStripeStatus] = useState<string | null>(null)

  const ids = sortedMonthIds(ws.months)
  const nwIds = allMonthIds(ws)
  const isBusiness = ws.kind === 'business'
  const pnlLabel = isBusiness ? 'Profit / Loss' : 'Savings'

  const allIds = Array.from(new Set([...ids, ...nwIds])).sort()
  const [fromMonth, setFromMonth] = useState(() => (allIds.length ? allIds[0] : currentMonthId()))
  const [toMonth, setToMonth] = useState(() => (allIds.length ? allIds[allIds.length - 1] : currentMonthId()))

  if (allIds.length && !allIds.includes(fromMonth) && !allIds.includes(toMonth)) {
    setFromMonth(allIds[0])
    setToMonth(allIds[allIds.length - 1])
  }

  const inRange = (id: string) => id >= fromMonth && id <= toMonth

  const nwHistory = netWorthHistory(ws)
    .filter((d) => inRange(d.month))
    .map((d) => ({ ...d, label: monthLabel(d.month) }))
  const cfHistory = cashFlowHistory(ws)
    .filter((d) => inRange(d.month))
    .map((d) => ({ ...d, label: monthLabel(d.month) }))
  const filteredIds = ids.filter(inRange)

  const latestNetWorth = netWorthAtMonth(ws, toMonth)
  const firstNetWorth = netWorthAtMonth(ws, fromMonth)
  const totalChange = latestNetWorth - firstNetWorth
  const totalIncome = cfHistory.reduce((s, d) => s + d.income, 0)
  const totalExpense = cfHistory.reduce((s, d) => s + d.expense, 0)
  const avgRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0

  const adTotals = isBusiness ? adSpendTotals(ws) : null
  const adHistory = isBusiness ? adSpendHistory(ws).map((h) => ({ ...h, label: monthLabel(h.month) })) : []
  const totalStartupInvested = isBusiness ? (ws.startupCosts ?? []).reduce((s, c) => s + c.amount, 0) : 0
  // Ad spend per month map for the P&L table
  const adSpendByMonth = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of ws.adSpendEntries ?? []) {
      const m = e.date.slice(0, 7)
      map.set(m, (map.get(m) ?? 0) + e.spend)
    }
    return map
  }, [ws.adSpendEntries])

  const outstandingReceivables = (ws.receivables ?? [])
    .filter((r) => !r.paid)
    .sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))
  const totalOwed = outstandingReceivables.reduce((s, r) => s + r.amount, 0)

  function markReceivablePaid(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        receivables: (w.receivables ?? []).map((r) =>
          r.id === id ? { ...r, paid: true, paidDate: r.paidDate || new Date().toISOString().slice(0, 10) } : r,
        ),
      })),
    )
  }

  function removeReceivable(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        receivables: (w.receivables ?? []).filter((r) => r.id !== id),
      })),
    )
  }

  const freelanceClients = ws.freelanceClients ?? []
  const freelanceOutstanding = freelanceClients.filter((c) => !c.paid).reduce((s, c) => s + c.amount, 0)

  function addFreelanceClient() {
    const c: FreelanceClient = { id: uuid(), client: '', description: '', amount: 0, paymentDate: '', paid: false }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, freelanceClients: [...(w.freelanceClients ?? []), c] })))
  }

  function updateFreelanceClient(id: string, updates: Partial<FreelanceClient>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        freelanceClients: (w.freelanceClients ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),
    )
  }

  function removeFreelanceClient(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        freelanceClients: (w.freelanceClients ?? []).filter((c) => c.id !== id),
      })),
    )
  }

  // ── Search across all workspaces ──────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q.length < 2) return null
    const results: {
      wsId: string
      wsName: string
      monthId: string
      transactions: { id: string; date: string; description: string; amount: number; type: string }[]
    }[] = []
    for (const [wsId, workspace] of Object.entries(data.workspaces)) {
      for (const [monthId, month] of Object.entries(workspace.months)) {
        const matched = month.transactions.filter(
          (t) => t.type !== 'ignore' && t.description.toLowerCase().includes(q),
        )
        if (matched.length > 0) {
          results.push({ wsId, wsName: workspace.name, monthId, transactions: matched })
        }
      }
    }
    return results.sort((a, b) => b.monthId.localeCompare(a.monthId))
  }, [searchQuery, data])

  const searchTotalSpend = useMemo(() => {
    if (!searchResults) return 0
    return searchResults.flatMap((r) => r.transactions).filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  }, [searchResults])

  const searchTotalIncome = useMemo(() => {
    if (!searchResults) return 0
    return searchResults.flatMap((r) => r.transactions).filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  }, [searchResults])

  // ── Stripe sync ───────────────────────────────────────────────────────────
  function saveStripeConfig() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        stripeConfig: { apiKey: stripeKeyDraft.trim() },
      })),
    )
    setShowStripeSetup(false)
  }

  async function handleStripeSync() {
    const cfg = ws.stripeConfig
    if (!cfg?.apiKey) { setShowStripeSetup(true); return }
    setStripeSyncing(true)
    setStripeError(null)
    setStripeStatus(null)
    try {
      const res = await fetch('/api/sync/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cfg.apiKey, workspaceId: data.activeWorkspace }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      const refreshed = await loadData()
      setData(refreshed)
      setStripeStatus(`Imported ${json.imported} new payment${json.imported === 1 ? '' : 's'} from ${json.total} total.`)
    } catch (err: unknown) {
      setStripeError(err instanceof Error ? err.message : String(err))
    } finally {
      setStripeSyncing(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Overview</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            type="text"
            className="table-input"
            placeholder="Search any item across all months…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ minWidth: 220 }}
          />
          {/* Stripe (business only) */}
          {isBusiness && (
            <>
              <button className="btn secondary small" onClick={handleStripeSync} disabled={stripeSyncing}>
                {stripeSyncing ? 'Syncing…' : '↻ Sync Stripe'}
              </button>
              <button className="btn ghost small" onClick={() => { setStripeKeyDraft(ws.stripeConfig?.apiKey ?? ''); setShowStripeSetup((v) => !v) }}>
                ⚙ Stripe
              </button>
            </>
          )}
          {/* Date range */}
          {allIds.length > 1 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className="field" style={{ minWidth: 140 }}>
                <input type="month" value={fromMonth} min={allIds[0]} max={toMonth} onChange={(e) => setFromMonth(e.target.value)} />
              </div>
              <span className="sub">to</span>
              <div className="field" style={{ minWidth: 140 }}>
                <input type="month" value={toMonth} min={fromMonth} max={allIds[allIds.length - 1]} onChange={(e) => setToMonth(e.target.value)} />
              </div>
            </div>
          )}
          <button className="btn accent" onClick={() => setAddOpen(true)}>+ Add Month</button>
        </div>
      </div>

      {/* Stripe setup panel */}
      {showStripeSetup && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-header">
            <h2>Stripe Setup</h2>
            <p>Enter your Stripe secret key to pull in payments as income. Find it at <strong>dashboard.stripe.com → Developers → API keys</strong>. Use a restricted key with read-only access to charges.</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 500 }}>
            <input
              type="password"
              className="table-input"
              style={{ flex: 1 }}
              placeholder="sk_live_xxxx…"
              value={stripeKeyDraft}
              onChange={(e) => setStripeKeyDraft(e.target.value)}
            />
            <button className="btn secondary small" disabled={!stripeKeyDraft.trim()} onClick={saveStripeConfig}>Save</button>
            <button className="btn ghost small" onClick={() => setShowStripeSetup(false)}>Cancel</button>
          </div>
        </div>
      )}

      {stripeError && (
        <div className="panel" style={{ background: 'var(--red-soft,#ef444420)', borderColor: 'var(--red)', marginBottom: 12, padding: '10px 16px' }}>
          <p style={{ margin: 0, color: 'var(--red)', fontSize: 13 }}>Stripe error: {stripeError}</p>
        </div>
      )}
      {stripeStatus && (
        <div className="panel" style={{ background: 'var(--green-soft,#22c55e20)', borderColor: 'var(--green)', marginBottom: 12, padding: '10px 16px' }}>
          <p style={{ margin: 0, color: 'var(--green)', fontSize: 13 }}>{stripeStatus}</p>
        </div>
      )}

      {/* ── Search results ───────────────────────────────────────────── */}
      {searchResults && (
        <div className="panel">
          <div className="panel-header">
            <h2>Search: "{searchQuery.trim()}"</h2>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              {searchTotalIncome > 0 && <span className="positive">+{fmt(searchTotalIncome)} income</span>}
              {searchTotalSpend > 0 && <span className="negative">−{fmt(searchTotalSpend)} spent</span>}
              {searchResults.length === 0 && <span style={{ color: 'var(--text-muted)' }}>No matches</span>}
            </div>
          </div>
          {searchResults.length === 0 ? (
            <div className="empty-state">Nothing found across any month or workspace.</div>
          ) : (
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Month</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r) =>
                    r.transactions.map((t) => (
                      <tr key={t.id}>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{r.wsName}</td>
                        <td>{monthLabel(r.monthId)}</td>
                        <td>{t.description}</td>
                        <td style={{ textTransform: 'capitalize', fontSize: 13, color: 'var(--text-muted)' }}>{t.type}</td>
                        <td className={`amount ${t.type === 'income' ? 'positive' : 'negative'}`}>
                          {t.type === 'income' ? '+' : '−'}{fmt(t.amount)}
                        </td>
                        <td className="actions">
                          {r.wsId === data.activeWorkspace && ws.months[r.monthId] && (
                            <button className="btn ghost small" onClick={() => setView({ type: 'month', id: r.monthId })}>
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Business summary stats ────────────────────────────────────── */}
      {isBusiness && ((adTotals && adTotals.spend > 0) || totalStartupInvested > 0) && (
        <div className="stat-grid">
          {adTotals && adTotals.spend > 0 && (
            <div className="stat-card">
              <div className="label">Total Ad Spend</div>
              <div className="value negative">{fmt(adTotals.spend)}</div>
              <div className="sub">{adTotals.roas !== null ? `${adTotals.roas.toFixed(2)}x ROAS` : 'no revenue tracked yet'}</div>
            </div>
          )}
          {adTotals && adTotals.revenue > 0 && (
            <div className="stat-card">
              <div className="label">Revenue Attributed</div>
              <div className="value positive">{fmt(adTotals.revenue)}</div>
            </div>
          )}
          {totalStartupInvested > 0 && (
            <div className="stat-card">
              <div className="label">Total Invested</div>
              <div className="value negative">{fmt(totalStartupInvested)}</div>
              <div className="sub">
                <button className="btn ghost small" style={{ padding: '1px 6px', fontSize: 11 }} onClick={() => setView({ type: 'startup' })}>
                  View breakdown →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isBusiness && adHistory.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Ad Spend vs Revenue</h2>
            <button className="btn ghost small" onClick={() => setView({ type: 'adspend' })}>View Details →</button>
          </div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={adHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="spend" name="Ad Spend" fill="#f0506e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#1eb980" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {ids.length === 0 ? (
        <div className="panel">
          <div className="empty-state">No months yet. Click <strong>+ Add Month</strong> to start tracking your finances.</div>
        </div>
      ) : (
        <>
          <div className="stat-grid">
            {!isBusiness && (
              <div className="stat-card">
                <div className="label">Net Worth</div>
                <div className={`value ${latestNetWorth >= 0 ? 'positive' : 'negative'}`}>{fmt(latestNetWorth)}</div>
                <div className="sub">as of {monthLabel(toMonth)}</div>
              </div>
            )}
            {!isBusiness && (
              <div className="stat-card">
                <div className="label">Net Worth Change</div>
                <div className={`value ${totalChange >= 0 ? 'positive' : 'negative'}`}>
                  {totalChange >= 0 ? '+' : ''}{fmt(totalChange)}
                </div>
                <div className="sub">since {monthLabel(fromMonth)}</div>
              </div>
            )}
            <div className="stat-card">
              <div className="label">Total Income</div>
              <div className="value positive">{fmt(totalIncome)}</div>
              <div className="sub">across {filteredIds.length} month(s)</div>
            </div>
            <div className="stat-card">
              <div className="label">{pnlLabel}</div>
              <div className={`value ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>
                {fmt(totalIncome - totalExpense)}
              </div>
              <div className="sub">{avgRate.toFixed(1)}% margin · {fmt(totalExpense)} spent</div>
            </div>
            <div className="stat-card">
              <div className="label">Owed to You</div>
              <div className={`value ${totalOwed > 0 ? 'positive' : ''}`}>{fmt(totalOwed)}</div>
              <div className="sub">{outstandingReceivables.length === 0 ? 'Nothing outstanding' : `${outstandingReceivables.length} outstanding`}</div>
            </div>
          </div>

          {!isBusiness && (
            <div className="panel">
              <div className="panel-header"><h2>Net Worth Over Time</h2></div>
              <div style={{ width: '100%', height: 280 }}>
                <ResponsiveContainer>
                  <LineChart data={nwHistory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} />
                    <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#ff5a36" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-header"><h2>Income vs Expenses</h2></div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <BarChart data={cfHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="income" name="Income" fill="#1eb980" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="#f0506e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {outstandingReceivables.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h2>Owed to You</h2>
                <span className="value" style={{ fontSize: 14 }}>Total: {fmt(totalOwed)}</span>
              </div>
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr>
                      <th>Person</th><th>Description</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Expected Date</th><th>Month</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingReceivables.map((r) => (
                      <tr key={r.id}>
                        <td>{r.person || '—'}</td>
                        <td>{r.description || '—'}</td>
                        <td className="amount">{fmt(r.amount)}</td>
                        <td>{r.expectedDate || '—'}</td>
                        <td>{monthLabel(r.monthId)}</td>
                        <td className="actions">
                          <button className="btn ghost small" onClick={() => markReceivablePaid(r.id)} title="Mark as paid back">✓ Paid</button>
                          <button className="btn ghost small" onClick={() => setView({ type: 'month', id: r.monthId })}>Open</button>
                          <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${r.person || 'this entry'}" (${fmt(r.amount)}) from Owed to You?`)) removeReceivable(r.id) }} title="Remove">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-header">
              <h2>Freelance Clients</h2>
              <span className="value" style={{ fontSize: 14 }}>Outstanding: {fmt(freelanceOutstanding)}</span>
              <button className="btn secondary small" onClick={addFreelanceClient}>+ Add Client</button>
            </div>
            {freelanceClients.length === 0 ? (
              <div className="empty-state">No freelance clients yet — add one to track who owes you and when they pay.</div>
            ) : (
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Work</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th>Payment date</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...freelanceClients]
                      .sort((a, b) => Number(a.paid) - Number(b.paid) || (a.paymentDate ?? '').localeCompare(b.paymentDate ?? ''))
                      .map((c) => {
                        const overdue = !c.paid && !!c.paymentDate && c.paymentDate < new Date().toISOString().slice(0, 10)
                        return (
                          <tr key={c.id} style={overdue ? { background: '#ef444410' } : undefined}>
                            <td>
                              <input type="text" className="table-input" value={c.client} placeholder="Client name" style={{ maxWidth: 150 }}
                                onChange={(e) => updateFreelanceClient(c.id, { client: e.target.value })} />
                            </td>
                            <td>
                              <input type="text" className="table-input" value={c.description ?? ''} placeholder="Project / service" style={{ maxWidth: 180 }}
                                onChange={(e) => updateFreelanceClient(c.id, { description: e.target.value })} />
                            </td>
                            <td className="amount">
                              <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 100 }} value={c.amount || ''} placeholder="0.00"
                                onChange={(e) => updateFreelanceClient(c.id, { amount: parseFloat(e.target.value) || 0 })} />
                            </td>
                            <td>
                              <input type="date" className="table-input" value={c.paymentDate ?? ''} style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}
                                onChange={(e) => updateFreelanceClient(c.id, { paymentDate: e.target.value || undefined })} />
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  className="btn ghost small"
                                  onClick={() => updateFreelanceClient(c.id, { paid: !c.paid })}
                                  style={c.paid ? { color: 'var(--green)', borderColor: 'var(--green)' } : undefined}
                                  title={c.paid ? 'Mark as unpaid' : 'Mark as paid'}
                                >
                                  {c.paid ? '✓ Paid' : 'Unpaid'}
                                </button>
                                {overdue && <span title="Past payment date" style={{ color: 'var(--red)', fontWeight: 700 }}>⚠</span>}
                              </div>
                            </td>
                            <td className="actions">
                              <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${c.client || 'this client'}"?`)) removeFreelanceClient(c.id) }}>✕</button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Spending Breakdown</h2>
              <p>Every category's total across {monthLabel(fromMonth)} – {monthLabel(toMonth)}.</p>
            </div>
            <div className="panel-grid">
              <CategoryBreakdownTable title="Income by Category" map={totalsByCategoryRange(ws, filteredIds, 'income')} ws={ws} />
              <CategoryBreakdownTable title="Expenses by Category" map={totalsByCategoryRange(ws, filteredIds, 'expense')} ws={ws} />
            </div>
          </div>

          {/* ── P&L by month — includes ad spend + fixed costs for business ── */}
          <div className="panel">
            <div className="panel-header"><h2>Profit &amp; Loss by Month</h2></div>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th style={{ textAlign: 'right' }}>Income</th>
                    <th style={{ textAlign: 'right' }}>Expenses</th>
                    {isBusiness && <th style={{ textAlign: 'right' }}>Ad Spend</th>}
                    {isBusiness && <th style={{ textAlign: 'right' }}>Fixed Costs</th>}
                    <th style={{ textAlign: 'right' }}>{pnlLabel}</th>
                    {!isBusiness && <th style={{ textAlign: 'right' }}>Net Worth</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIds.slice().reverse().map((id) => {
                    const cf = cfHistory.find((c) => c.month === id)!
                    const nw = netWorthAtMonth(ws, id)
                    const adSpend = adSpendByMonth.get(id) ?? 0
                    const fixedCostTotal = (ws.fixedCosts ?? []).reduce((s, f) => s + f.monthlyCost, 0)
                    return (
                      <tr key={id}>
                        <td>{monthLabel(id)}</td>
                        <td className="amount positive">{fmt(cf.income)}</td>
                        <td className="amount negative">{fmt(cf.expense)}</td>
                        {isBusiness && <td className={`amount ${adSpend > 0 ? 'negative' : ''}`}>{adSpend > 0 ? fmt(adSpend) : '—'}</td>}
                        {isBusiness && <td className="amount negative">{fixedCostTotal > 0 ? fmt(fixedCostTotal) : '—'}</td>}
                        <td className={`amount ${cf.net >= 0 ? 'positive' : 'negative'}`}>{fmt(cf.net)}</td>
                        {!isBusiness && (
                          <td className={`amount ${nw >= 0 ? 'positive' : 'negative'}`}>{fmt(nw)}</td>
                        )}
                        <td className="actions">
                          <button className="btn ghost small" onClick={() => setView({ type: 'month', id })}>Open</button>
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td><strong>Total</strong></td>
                    <td className="amount positive"><strong>{fmt(totalIncome)}</strong></td>
                    <td className="amount negative"><strong>{fmt(totalExpense)}</strong></td>
                    {isBusiness && <td className="amount negative"><strong>{formatCurrency(Array.from(adSpendByMonth.values()).reduce((s,v)=>s+v,0), ws.currency)}</strong></td>}
                    {isBusiness && <td></td>}
                    <td className={`amount ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>
                      <strong>{fmt(totalIncome - totalExpense)}</strong>
                    </td>
                    {!isBusiness && <td></td>}
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {addOpen && (
        <AddMonthModal
          defaultMonth={ids.length ? ids[ids.length - 1] : currentMonthId()}
          existing={Object.keys(ws.months)}
          hasPrevious={ids.length > 0}
          onClose={() => setAddOpen(false)}
          onAdd={(id, copy) => { onAddMonth(id, copy); setAddOpen(false) }}
        />
      )}
    </div>
  )
}

function CategoryBreakdownTable({ title, map, ws }: { title: string; map: Map<string, number>; ws: WorkspaceData }) {
  const { fmt, curr } = useCurrency()
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const rows = Array.from(map.entries())
    .map(([catId, amount]) => ({ cat: categoryById.get(catId), amount }))
    .filter((r) => r.cat && r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((s, r) => s + r.amount, 0)

  return (
    <div>
      <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <div className="empty-state">No data for this range.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.cat!.id}>
                <td><CategoryTag category={r.cat!} /></td>
                <td className="amount">{fmt(r.amount)}</td>
                <td className="amount" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                  {total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td className="amount">{fmt(total)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

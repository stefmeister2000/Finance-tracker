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
import type { AppData, FreelanceClient, Receivable, WorkspaceData } from '../types'
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
  const [customizeOverview, setCustomizeOverview] = useState(false)
  const hiddenOverview = new Set(ws.hiddenOverviewSections ?? [])
  const overviewSections = [{"id":"stat-total-ad-spend","title":"Total Ad Spend","personal":false,"business":true},{"id":"stat-revenue-attributed","title":"Revenue Attributed","personal":false,"business":true},{"id":"stat-total-invested","title":"Total Invested","personal":false,"business":true},{"id":"ad-chart","title":"Ad Spend vs Revenue","personal":false,"business":true},{"id":"stat-net-worth","title":"Net Worth","personal":true,"business":false},{"id":"stat-net-worth-change","title":"Net Worth Change","personal":true,"business":false},{"id":"stat-total-income","title":"Total Income","personal":false,"business":false},{"id":"stat-savings-profit-loss","title":"Savings / Profit & Loss","personal":false,"business":false},{"id":"stat-owed-to-you","title":"Owed to You","personal":false,"business":false},{"id":"net-worth-history","title":"Net Worth Over Time","personal":true,"business":false},{"id":"income-expenses","title":"Income vs Expenses","personal":false,"business":false},{"id":"monthly-result","title":"Monthly result","personal":false,"business":false},{"id":"receivables","title":"Owed to You"},{"id":"debts","title":"You Owe (Debts)"},{"id":"freelance","title":"Freelance Clients","personal":true,"business":false},{"id":"breakdown","title":"Spending Breakdown","personal":false,"business":false},{"id":"profit-loss","title":"Profit & Loss by Month","personal":false,"business":false}].filter(section => !('personal' in section && section.personal) || ws.kind === 'personal').filter(section => !('business' in section && section.business) || ws.kind === 'business')
  function toggleOverview(id: string) {
    setData(prev => updateActiveWorkspace(prev, w => {
      const hidden = new Set(w.hiddenOverviewSections ?? [])
      hidden.has(id) ? hidden.delete(id) : hidden.add(id)
      return { ...w, hiddenOverviewSections: [...hidden] }
    }))
  }
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

  // The month the dashboard calculation and new items attach to (current month, else latest with data).
  const monthResultId = ids.includes(currentMonthId()) ? currentMonthId() : (ids.length ? ids[ids.length - 1] : currentMonthId())
  const monthTx = ws.months[monthResultId]?.transactions ?? []
  const monthIncome = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthExpense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const monthNet = monthIncome - monthExpense

  const outstandingReceivables = (ws.receivables ?? [])
    .filter((r) => !r.paid)
    .sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))
  const totalOwed = outstandingReceivables.reduce((s, r) => s + r.amount, 0)

  const outstandingDebts = (ws.debts ?? [])
    .filter((r) => !r.paid)
    .sort((a, b) => (a.expectedDate ?? '').localeCompare(b.expectedDate ?? ''))
  const totalDebt = outstandingDebts.reduce((s, r) => s + r.amount, 0)

  // Projected end-of-month position: this month's net cash, plus what's still owed to you, minus what you still owe.
  const projectedPosition = monthNet + totalOwed - totalDebt

  function updateList(key: 'receivables' | 'debts', id: string, updates: Partial<Receivable>) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, [key]: (w[key] ?? []).map((r) => (r.id === id ? { ...r, ...updates } : r)) })))
  }
  function addToList(key: 'receivables' | 'debts', person: string) {
    const r: Receivable = { id: uuid(), person, description: '', amount: 0, monthId: monthResultId, expectedDate: '', paid: false }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, [key]: [...(w[key] ?? []), r] })))
  }
  function removeFromList(key: 'receivables' | 'debts', id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, [key]: (w[key] ?? []).filter((r) => r.id !== id) })))
  }
  const markReceivablePaid = (id: string) => updateList('receivables', id, { paid: true, paidDate: new Date().toISOString().slice(0, 10) })
  const removeReceivable = (id: string) => removeFromList('receivables', id)

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
    <div className="overview-page">
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Overview</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn secondary small" aria-expanded={customizeOverview} onClick={() => setCustomizeOverview(!customizeOverview)}>Customize overview{hiddenOverview.size > 0 ? ' (' + hiddenOverview.size + ' hidden)' : ''}</button>
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

      {customizeOverview && <div className="panel overview-customize"><div className="panel-header"><h2>Show on overview</h2><p>Choose what you want to see. Your data and totals stay unchanged.</p><button className="btn ghost small" onClick={() => setData(prev => updateActiveWorkspace(prev, w => ({ ...w, hiddenOverviewSections: [] })))}>Show all</button></div><div className="overview-options">{overviewSections.map(section => <label key={section.id}><input type="checkbox" checked={!hiddenOverview.has(section.id)} onChange={() => toggleOverview(section.id)}/>{section.title}{section.id.startsWith('stat-') ? ' · summary card' : ''}</label>)}</div></div>}
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
            <div className="stat-card" hidden={hiddenOverview.has('stat-total-ad-spend')} data-overview-section="stat-total-ad-spend"><button className="overview-hide" aria-label="Hide Total Ad Spend" title="Hide Total Ad Spend" onClick={() => toggleOverview('stat-total-ad-spend')}>Hide</button>
              <div className="label">Total Ad Spend</div>
              <div className="value negative">{fmt(adTotals.spend)}</div>
              <div className="sub">{adTotals.roas !== null ? `${adTotals.roas.toFixed(2)}x ROAS` : 'no revenue tracked yet'}</div>
            </div>
          )}
          {adTotals && adTotals.revenue > 0 && (
            <div className="stat-card" hidden={hiddenOverview.has('stat-revenue-attributed')} data-overview-section="stat-revenue-attributed"><button className="overview-hide" aria-label="Hide Revenue Attributed" title="Hide Revenue Attributed" onClick={() => toggleOverview('stat-revenue-attributed')}>Hide</button>
              <div className="label">Revenue Attributed</div>
              <div className="value positive">{fmt(adTotals.revenue)}</div>
            </div>
          )}
          {totalStartupInvested > 0 && (
            <div className="stat-card" hidden={hiddenOverview.has('stat-total-invested')} data-overview-section="stat-total-invested"><button className="overview-hide" aria-label="Hide Total Invested" title="Hide Total Invested" onClick={() => toggleOverview('stat-total-invested')}>Hide</button>
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
        <div className="panel" hidden={hiddenOverview.has('ad-chart')} data-overview-section="ad-chart"><button className="overview-hide" aria-label="Hide Ad Spend vs Revenue" title="Hide Ad Spend vs Revenue" onClick={() => toggleOverview('ad-chart')}>Hide</button>
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
              <div className="stat-card" hidden={hiddenOverview.has('stat-net-worth')} data-overview-section="stat-net-worth"><button className="overview-hide" aria-label="Hide Net Worth" title="Hide Net Worth" onClick={() => toggleOverview('stat-net-worth')}>Hide</button>
                <div className="label">Net Worth</div>
                <div className={`value ${latestNetWorth >= 0 ? 'positive' : 'negative'}`}>{fmt(latestNetWorth)}</div>
                <div className="sub">as of {monthLabel(toMonth)}</div>
              </div>
            )}
            {!isBusiness && (
              <div className="stat-card" hidden={hiddenOverview.has('stat-net-worth-change')} data-overview-section="stat-net-worth-change"><button className="overview-hide" aria-label="Hide Net Worth Change" title="Hide Net Worth Change" onClick={() => toggleOverview('stat-net-worth-change')}>Hide</button>
                <div className="label">Net Worth Change</div>
                <div className={`value ${totalChange >= 0 ? 'positive' : 'negative'}`}>
                  {totalChange >= 0 ? '+' : ''}{fmt(totalChange)}
                </div>
                <div className="sub">since {monthLabel(fromMonth)}</div>
              </div>
            )}
            <div className="stat-card" hidden={hiddenOverview.has('stat-total-income')} data-overview-section="stat-total-income"><button className="overview-hide" aria-label="Hide Total Income" title="Hide Total Income" onClick={() => toggleOverview('stat-total-income')}>Hide</button>
              <div className="label">Total Income</div>
              <div className="value positive">{fmt(totalIncome)}</div>
              <div className="sub">across {filteredIds.length} month(s)</div>
            </div>
            <div className="stat-card" hidden={hiddenOverview.has('stat-savings-profit-loss')} data-overview-section="stat-savings-profit-loss"><button className="overview-hide" aria-label="Hide Savings / Profit & Loss" title="Hide Savings / Profit & Loss" onClick={() => toggleOverview('stat-savings-profit-loss')}>Hide</button>
              <div className="label">{pnlLabel}</div>
              <div className={`value ${totalIncome - totalExpense >= 0 ? 'positive' : 'negative'}`}>
                {fmt(totalIncome - totalExpense)}
              </div>
              <div className="sub">{avgRate.toFixed(1)}% margin · {fmt(totalExpense)} spent</div>
            </div>
            <div className="stat-card" hidden={hiddenOverview.has('stat-owed-to-you')} data-overview-section="stat-owed-to-you"><button className="overview-hide" aria-label="Hide Owed to You" title="Hide Owed to You" onClick={() => toggleOverview('stat-owed-to-you')}>Hide</button>
              <div className="label">Owed to You</div>
              <div className={`value ${totalOwed > 0 ? 'positive' : ''}`}>{fmt(totalOwed)}</div>
              <div className="sub">{outstandingReceivables.length === 0 ? 'Nothing outstanding' : `${outstandingReceivables.length} outstanding`}</div>
            </div>
          </div>

          {!isBusiness && (
            <div className="panel" hidden={hiddenOverview.has('net-worth-history')} data-overview-section="net-worth-history"><button className="overview-hide" aria-label="Hide Net Worth Over Time" title="Hide Net Worth Over Time" onClick={() => toggleOverview('net-worth-history')}>Hide</button>
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

          <div className="panel" hidden={hiddenOverview.has('income-expenses')} data-overview-section="income-expenses"><button className="overview-hide" aria-label="Hide Income vs Expenses" title="Hide Income vs Expenses" onClick={() => toggleOverview('income-expenses')}>Hide</button>
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

          <section className="panel month-result" hidden={hiddenOverview.has('monthly-result')} data-overview-section="monthly-result"><button className="overview-hide" aria-label="Hide Monthly result" title="Hide Monthly result" onClick={() => toggleOverview('monthly-result')}>Hide</button>
            <div className="panel-header">
              <h2>Monthly result</h2><span className="month-result-period">{monthLabel(monthResultId)}</span>
            </div>
            <div className="month-result-layout">
              <div className="month-result-calculation">
                <div><span>Income</span><strong>{fmt(monthIncome)}</strong></div>
                <div><span>Expenses</span><strong>−{fmt(monthExpense)}</strong></div>
                <div className="month-result-subtotal"><span>Net this month</span><strong>{fmt(monthNet)}</strong></div>
                <div><span>Still to receive</span><strong>+{fmt(totalOwed)}</strong></div>
                <div><span>Still to pay</span><strong>−{fmt(totalDebt)}</strong></div>
              </div>
              <div className={`month-result-answer ${projectedPosition < 0 ? 'is-negative' : ''}`}>
                <span>After outstanding payments</span>
                <strong>{fmt(projectedPosition)}</strong>
                <p>Monthly net + money owed to you − money you owe.</p>
                {totalOwed === 0 && totalDebt === 0 && <small>No outstanding payments to account for.</small>}
              </div>
            </div>
          </section>

          <div className="overview-ledger" hidden={hiddenOverview.has('receivables')} data-overview-section="receivables"><button className="overview-hide" aria-label="Hide Owed to You" onClick={() => toggleOverview('receivables')}>Hide</button><LedgerPanel
            title="Owed to You" positive
            items={outstandingReceivables} total={totalOwed} fmt={fmt}
            onAdd={() => addToList('receivables', '')}
            onUpdate={(id, u) => updateList('receivables', id, u)}
            onRemove={(id) => removeFromList('receivables', id)}
            onPaid={(id) => markReceivablePaid(id)}
          /></div>

          <div className="overview-ledger" hidden={hiddenOverview.has('debts')} data-overview-section="debts"><button className="overview-hide" aria-label="Hide You Owe (Debts)" onClick={() => toggleOverview('debts')}>Hide</button><LedgerPanel
            title="You Owe (Debts)" positive={false}
            items={outstandingDebts} total={totalDebt} fmt={fmt}
            onAdd={() => addToList('debts', '')}
            onUpdate={(id, u) => updateList('debts', id, u)}
            onRemove={(id) => removeFromList('debts', id)}
            onPaid={(id) => updateList('debts', id, { paid: true, paidDate: new Date().toISOString().slice(0, 10) })}
          /></div>


          {ws.kind === 'personal' && (
          <div className="panel" hidden={hiddenOverview.has('freelance')} data-overview-section="freelance"><button className="overview-hide" aria-label="Hide Freelance Clients" title="Hide Freelance Clients" onClick={() => toggleOverview('freelance')}>Hide</button>
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
                      <th>Monthly fixed income</th>
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
                              <input type="checkbox" checked={c.fixedIncome ?? false}
                                aria-label={`Include ${c.client || 'client'} in monthly fixed income`}
                                onChange={(e) => updateFreelanceClient(c.id, { fixedIncome: e.target.checked })} />
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

          )}

          <div className="panel" hidden={hiddenOverview.has('breakdown')} data-overview-section="breakdown"><button className="overview-hide" aria-label="Hide Spending Breakdown" title="Hide Spending Breakdown" onClick={() => toggleOverview('breakdown')}>Hide</button>
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
          <div className="panel" hidden={hiddenOverview.has('profit-loss')} data-overview-section="profit-loss"><button className="overview-hide" aria-label="Hide Profit & Loss by Month" title="Hide Profit & Loss by Month" onClick={() => toggleOverview('profit-loss')}>Hide</button>
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
  const { fmt } = useCurrency()
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const rows = Array.from(map.entries())
    .map(([catId, amount]) => ({ cat: categoryById.get(catId), amount }))
    .filter((r) => r.cat && r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
  const fullTotal = rows.reduce((s, r) => s + r.amount, 0)
  const includedTotal = rows.filter((r) => !excluded.has(r.cat!.id)).reduce((s, r) => s + r.amount, 0)
  const removed = fullTotal - includedTotal

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', margin: 0 }}>{title}</h3>
        {excluded.size > 0 && (
          <button className="btn ghost small" onClick={() => setExcluded(new Set())} style={{ fontSize: 11 }}>Reset ({excluded.size} hidden)</button>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">No data for this range.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th style={{ textAlign: 'right' }}>% of Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const off = excluded.has(r.cat!.id)
              return (
                <tr key={r.cat!.id} style={off ? { opacity: 0.4 } : undefined}>
                  <td><CategoryTag category={r.cat!} /></td>
                  <td className="amount" style={off ? { textDecoration: 'line-through' } : undefined}>{fmt(r.amount)}</td>
                  <td className="amount" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                    {off ? '—' : includedTotal > 0 ? `${((r.amount / includedTotal) * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => toggle(r.cat!.id)} title={off ? 'Include again' : 'Exclude to see the total without it'}>
                      {off ? '↩' : '✕'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total{excluded.size > 0 ? ' (shown)' : ''}</strong></td>
              <td className="amount"><strong>{fmt(includedTotal)}</strong></td>
              <td colSpan={2}></td>
            </tr>
            {removed > 0 && (
              <tr>
                <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>Excluded {excluded.size} · full total {fmt(fullTotal)}</td>
                <td className="amount" style={{ color: 'var(--text-muted)', fontSize: 12 }}>−{fmt(removed)}</td>
                <td colSpan={2}></td>
              </tr>
            )}
          </tfoot>
        </table>
      )}
    </div>
  )
}

/** Editable dashboard ledger for "owed to you" or "you owe" — add, edit inline, mark paid, remove. */
function LedgerPanel({ title, positive, items, total, fmt, onAdd, onUpdate, onRemove, onPaid }: {
  title: string
  positive: boolean
  items: Receivable[]
  total: number
  fmt: (n: number) => string
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<Receivable>) => void
  onRemove: (id: string) => void
  onPaid: (id: string) => void
}) {
  const amountColor = positive ? 'var(--green)' : 'var(--red)'
  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <span className="value" style={{ fontSize: 14, color: amountColor }}>Total: {fmt(total)}</span>
        <button className="btn secondary small" onClick={onAdd}>+ Add</button>
      </div>
      {items.length === 0 ? (
        <div className="empty-state">
          {positive ? 'Nothing owed to you right now — click Add to note money you still need to get.' : 'No debts right now — click Add to note money you still owe.'}
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>{positive ? 'Person' : 'Owed to'}</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Expected date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input type="text" className="table-input" value={r.person} placeholder={positive ? 'Who owes you' : 'Who you owe'} style={{ minWidth: 130 }}
                      onChange={(e) => onUpdate(r.id, { person: e.target.value })} />
                  </td>
                  <td>
                    <input type="text" className="table-input" value={r.description ?? ''} placeholder="What for" style={{ minWidth: 150 }}
                      onChange={(e) => onUpdate(r.id, { description: e.target.value })} />
                  </td>
                  <td className="amount" style={{ color: amountColor }}>
                    <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 110 }} value={r.amount || ''} placeholder="0.00"
                      onChange={(e) => onUpdate(r.id, { amount: parseFloat(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input type="date" className="table-input" value={r.expectedDate ?? ''}
                      onChange={(e) => onUpdate(r.id, { expectedDate: e.target.value || undefined })} />
                  </td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => onPaid(r.id)} title={positive ? 'Mark as received' : 'Mark as paid off'}>✓ {positive ? 'Got it' : 'Paid'}</button>
                    <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${r.person || 'this entry'}"?`)) onRemove(r.id) }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

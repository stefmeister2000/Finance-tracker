import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { AdAccount, AdCampaign, AdCampaignStatus, AdCategoryBudget, AdSpendEntry, AppData, WorkspaceData } from '../types'
import { monthLabel, updateActiveWorkspace, loadData } from '../storage'
import { adCampaignStats, adSpendHistory, adSpendTotals, formatCurrency, reconcileAdSpendTransactions } from '../utils'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function InlineSpend({
  campaignId,
  entries,
  currency,
  onUpdate,
}: {
  campaignId: string
  entries: AdSpendEntry[]
  currency: string
  onUpdate: (campaignId: string, spend: number) => void
}) {
  const { fmt, curr } = useCurrency()
  const [editing, setEditing] = useState(false)
  const thisMonth = currentMonth()
  const entry = entries.find((e) => e.campaignId === campaignId && e.date.startsWith(thisMonth))
  const current = entry?.spend ?? 0
  const [draft, setDraft] = useState('')

  if (editing) {
    return (
      <input
        type="number"
        step="0.01"
        autoFocus
        className="table-input amount-input"
        style={{ maxWidth: 100, textAlign: 'right' }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const val = parseFloat(draft)
          if (!isNaN(val)) onUpdate(campaignId, val)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button
      className="amount-edit-trigger"
      style={{ color: 'var(--red)', fontWeight: 600 }}
      onClick={() => { setDraft(current.toFixed(2)); setEditing(true) }}
      title="Click to edit this month's spend"
    >
      {fmt(current)}
    </button>
  )
}

function toMonthKey(date: string): string {
  return date.slice(0, 7)
}

const ACCOUNT_COLORS = ['#6366f1', '#f97316', '#22c55e', '#f0506e', '#14b8a6', '#a855f7', '#f59e0b', '#3b82f6']

export default function AdSpendPage({ data, ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [tokenDraft, setTokenDraft] = useState(ws.metaAdConfig?.accessToken ?? '')
  const [accountsDraft, setAccountsDraft] = useState<string[]>(
    ws.metaAdConfig?.adAccountIds?.length ? ws.metaAdConfig.adAccountIds : ['']
  )
  const [datePreset, setDatePreset] = useState<string>('this_month')

  const adAccounts = ws.adAccounts ?? []
  const campaigns = ws.adCampaigns ?? []
  const entries = ws.adSpendEntries ?? []
  const stats = adCampaignStats(ws)
  const totals = adSpendTotals(ws)
  const history = adSpendHistory(ws)
  const best = stats.find((s) => s.spend > 0)

  const accountById = new Map(adAccounts.map((a) => [a.id, a]))

  // Spend per account
  const spendByAccount = new Map<string, number>()
  for (const s of stats) {
    const accId = s.campaign.accountId ?? '__none__'
    spendByAccount.set(accId, (spendByAccount.get(accId) ?? 0) + s.spend)
  }

  // ── Account CRUD ────────────────────────────────────────────────────────────
  function addAccount() {
    const color = ACCOUNT_COLORS[adAccounts.length % ACCOUNT_COLORS.length]
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adAccounts: [...(w.adAccounts ?? []), { id: uuid(), name: 'New Account', color }],
      }))
    )
  }

  function updateAccount(id: string, updates: Partial<AdAccount>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adAccounts: (w.adAccounts ?? []).map((a) => (a.id === id ? { ...a, ...updates } : a)),
      }))
    )
  }

  function removeAccount(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adAccounts: (w.adAccounts ?? []).filter((a) => a.id !== id),
        adCampaigns: (w.adCampaigns ?? []).map((c) =>
          c.accountId === id ? { ...c, accountId: undefined } : c
        ),
      }))
    )
  }

  // ── Campaign CRUD ───────────────────────────────────────────────────────────
  function addCampaign(accountId?: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adCampaigns: [
          ...(w.adCampaigns ?? []),
          { id: uuid(), name: 'New Campaign', platform: 'Meta', status: 'active' as AdCampaignStatus, accountId },
        ],
      }))
    )
  }

  function updateCampaign(id: string, updates: Partial<AdCampaign>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adCampaigns: (w.adCampaigns ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)),
      }))
    )
  }

  function removeCampaign(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adCampaigns: (w.adCampaigns ?? []).filter((c) => c.id !== id),
        adSpendEntries: (w.adSpendEntries ?? []).filter((e) => e.campaignId !== id),
      }))
    )
  }

  // ── Entry CRUD ──────────────────────────────────────────────────────────────
  function addEntry(presetCampaignId?: string) {
    if (campaigns.length === 0) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const newEntry: AdSpendEntry = {
          id: uuid(),
          campaignId: presetCampaignId ?? (w.adCampaigns ?? [])[0].id,
          date: `${currentMonth()}-01`,
          spend: 0,
          revenue: 0,
          conversions: 0,
          clicks: 0,
        }
        return reconcileAdSpendTransactions({ ...w, adSpendEntries: [...(w.adSpendEntries ?? []), newEntry] })
      })
    )
  }

  function updateEntry(id: string, updates: Partial<AdSpendEntry>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const updated = (w.adSpendEntries ?? []).map((e) => (e.id === id ? { ...e, ...updates } : e))
        return reconcileAdSpendTransactions({ ...w, adSpendEntries: updated })
      })
    )
  }

  function removeEntry(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const filtered = (w.adSpendEntries ?? []).filter((e) => e.id !== id)
        return reconcileAdSpendTransactions({ ...w, adSpendEntries: filtered })
      })
    )
  }

  // ── Meta Sync ───────────────────────────────────────────────────────────────
  function saveMetaConfig() {
    const ids = accountsDraft.map((a) => a.trim()).filter(Boolean)
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        metaAdConfig: { accessToken: tokenDraft.trim(), adAccountIds: ids },
      }))
    )
    setShowSetup(false)
  }

  async function handleSync() {
    const cfg = ws.metaAdConfig
    const ids = cfg?.adAccountIds?.filter(Boolean) ?? []
    if (!cfg?.accessToken || ids.length === 0) { setShowSetup(true); return }
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/sync/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: cfg.accessToken, adAccountIds: ids, datePreset, workspaceId: data.activeWorkspace }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Sync failed')
      const refreshed = await loadData()
      setData(refreshed)
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  // ── Category budgets CRUD ───────────────────────────────────────────────────
  const categoryBudgets = ws.adCategoryBudgets ?? []
  const thisMonth = currentMonth()
  const rawCategories = Array.from(new Set((ws.products ?? []).map((p) => p.category).filter(Boolean))) as string[]
  const catOrder = ws.categoryOrder ?? []
  const productCategories = [
    ...catOrder.filter((c) => rawCategories.includes(c)),
    ...rawCategories.filter((c) => !catOrder.includes(c)).sort(),
  ]

  const [dragCatRow, setDragCatRow] = useState<string | null>(null)
  const [dragOverCatRow, setDragOverCatRow] = useState<string | null>(null)

  function handleCatRowDrop(targetCat: string) {
    if (!dragCatRow || dragCatRow === targetCat) { setDragCatRow(null); setDragOverCatRow(null); return }
    const cats = [...productCategories]
    const from = cats.indexOf(dragCatRow)
    const to = cats.indexOf(targetCat)
    cats.splice(from, 1)
    cats.splice(to, 0, dragCatRow)
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, categoryOrder: cats })))
    setDragCatRow(null)
    setDragOverCatRow(null)
  }

  function deleteCategoryBudget(productCategory: string, monthId: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w,
      adCategoryBudgets: (w.adCategoryBudgets ?? []).filter(
        (b) => !(b.productCategory === productCategory && b.monthId === monthId)
      ),
    })))
  }

  function upsertCategoryBudget(productCategory: string, monthId: string, field: 'spend' | 'revenue' | 'leads', value: number) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const list = w.adCategoryBudgets ?? []
        const existing = list.find((b) => b.productCategory === productCategory && b.monthId === monthId)
        if (existing) {
          return { ...w, adCategoryBudgets: list.map((b) => b.id === existing.id ? { ...b, [field]: value } : b) }
        }
        const newBudget: AdCategoryBudget = { id: uuid(), productCategory, monthId, spend: 0, revenue: 0, leads: 0, [field]: value }
        return { ...w, adCategoryBudgets: [...list, newBudget] }
      })
    )
  }

  function removeCategoryBudgetMonth(monthId: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        adCategoryBudgets: (w.adCategoryBudgets ?? []).filter((b) => b.monthId !== monthId),
      }))
    )
  }

  // All months that appear in category budgets, plus this month
  const catMonths = Array.from(new Set([thisMonth, ...categoryBudgets.map((b) => b.monthId)])).sort().reverse()

  const sortedEntries = entries.slice().sort((a, b) => b.date.localeCompare(a.date))

  // Group campaigns by account (unassigned goes to a special bucket)
  const groupedCampaigns = new Map<string, typeof stats>()
  for (const s of stats) {
    const key = s.campaign.accountId ?? '__none__'
    if (!groupedCampaigns.has(key)) groupedCampaigns.set(key, [])
    groupedCampaigns.get(key)!.push(s)
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Ad Spend</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="table-input" value={datePreset} onChange={(e) => setDatePreset(e.target.value)} style={{ minWidth: 140 }}>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
            <option value="last_30d">Last 30 days</option>
            <option value="last_90d">Last 90 days</option>
          </select>
          <button className="btn secondary small" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : '↻ Sync from Meta'}
          </button>
          <button className="btn ghost small" onClick={() => { setTokenDraft(ws.metaAdConfig?.accessToken ?? ''); setAccountsDraft(ws.metaAdConfig?.adAccountIds?.length ? ws.metaAdConfig.adAccountIds : ['']); setShowSetup((v) => !v) }}>
            ⚙ Meta Setup
          </button>
        </div>
      </div>

      {syncError && (
        <div className="panel" style={{ background: 'var(--red-soft, #ef444420)', borderColor: 'var(--red)', marginBottom: 12 }}>
          <p style={{ margin: 0, color: 'var(--red)', fontSize: 13 }}>Sync error: {syncError}</p>
        </div>
      )}

      {showSetup && (
        <div className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-header">
            <h2>Meta Ads Setup</h2>
            <p>Enter your Meta access token and ad account IDs to enable auto-sync.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
            <div className="field">
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                Ad Account IDs (numbers only, e.g. 1394578675259914)
              </label>
              {accountsDraft.map((id, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                  <input type="text" className="table-input" style={{ flex: 1 }} placeholder="1394578675259914" value={id}
                    onChange={(e) => { const next = [...accountsDraft]; next[i] = e.target.value; setAccountsDraft(next) }} />
                  {accountsDraft.length > 1 && (
                    <button className="btn ghost small danger" onClick={() => setAccountsDraft(accountsDraft.filter((_, j) => j !== i))}>✕</button>
                  )}
                </div>
              ))}
              <button className="btn ghost small" onClick={() => setAccountsDraft([...accountsDraft, ''])}>+ Add Account</button>
            </div>
            <div className="field">
              <label style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Access Token</label>
              <input type="password" className="table-input" style={{ width: '100%' }} placeholder="EAAxxxxx…" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn secondary small" disabled={!tokenDraft.trim() || accountsDraft.every((a) => !a.trim())} onClick={saveMetaConfig}>Save</button>
              <button className="btn ghost small" onClick={() => setShowSetup(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stat cards: total + per account ── */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Ad Spend</div>
          <div className="value negative">{fmt(totals.spend)}</div>
        </div>
        {adAccounts.map((acc) => {
          const spend = spendByAccount.get(acc.id) ?? 0
          return (
            <div key={acc.id} className="stat-card" style={{ borderLeft: `4px solid ${acc.color}` }}>
              <div className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: acc.color, display: 'inline-block', flexShrink: 0 }} />
                {acc.name}
              </div>
              <div className="value negative">{fmt(spend)}</div>
              <div className="sub">{totals.spend > 0 ? `${((spend / totals.spend) * 100).toFixed(0)}% of total` : '—'}</div>
            </div>
          )
        })}
        <div className="stat-card">
          <div className="label">Overall ROAS</div>
          <div className="value">{totals.roas !== null ? `${totals.roas.toFixed(2)}x` : '—'}</div>
          <div className="sub">revenue ÷ spend</div>
        </div>
        <div className="stat-card">
          <div className="label">Best Performer</div>
          <div className="value">{best ? best.campaign.name : '—'}</div>
          <div className="sub">{best && best.roas !== null ? `${best.roas.toFixed(2)}x ROAS` : 'no spend logged yet'}</div>
        </div>
      </div>

      {/* ── Chart ── */}
      {history.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2>Spend vs Revenue by Month</h2></div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={history.map((h) => ({ ...h, label: monthLabel(h.month) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip formatter={(value: number) => fmt(value)} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="spend" name="Spend" fill="#f0506e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#1eb980" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Ad spend by product category ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>Spend &amp; Revenue by Product Category</h2>
          <p>Track how much you spend and earn per product line each month.</p>
        </div>
        {productCategories.length === 0 ? (
          <div className="empty-state">No products found — add products in Business Tools first.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {catMonths.map((monthId) => {
              const budgets = categoryBudgets.filter((b) => b.monthId === monthId)
              const totalSpend = budgets.reduce((s, b) => s + b.spend, 0)
              const totalRevenue = budgets.reduce((s, b) => s + b.revenue, 0)
              const totalLeads = budgets.reduce((s, b) => s + (b.leads ?? 0), 0)
              const roas = totalSpend > 0 ? totalRevenue / totalSpend : null
              return (
                <div key={monthId} style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{monthId}</span>
                    {totalSpend > 0 && (
                      <>
                        <span style={{ fontSize: 12, color: 'var(--red)' }}>Spend: {fmt(totalSpend)}</span>
                        <span style={{ fontSize: 12, color: 'var(--green)' }}>Revenue: {fmt(totalRevenue)}</span>
                        {roas !== null && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>ROAS: {roas.toFixed(2)}x</span>}
                      </>
                    )}
                    {monthId !== thisMonth && (
                      <button className="btn ghost small" style={{ marginLeft: 'auto' }} onClick={() => removeCategoryBudgetMonth(monthId)}>Remove month</button>
                    )}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 24, borderBottom: '1px solid var(--border)' }}></th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Category</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Ad Spend</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Revenue</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Qual. Leads</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>CPL</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>ROAS</th>
                        <th style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Profit on Ads</th>
                        <th style={{ width: 32, borderBottom: '1px solid var(--border)' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {productCategories.map((cat) => {
                        const b = budgets.find((x) => x.productCategory === cat)
                        const spend = b?.spend ?? 0
                        const revenue = b?.revenue ?? 0
                        const leads = b?.leads ?? 0
                        const catRoas = spend > 0 ? revenue / spend : null
                        const cpl = leads > 0 ? spend / leads : null
                        const profit = revenue - spend
                        const isDragOver = dragOverCatRow === cat && dragCatRow !== cat
                        return (
                          <tr
                            key={cat}
                            draggable
                            onDragStart={() => setDragCatRow(cat)}
                            onDragEnd={() => { setDragCatRow(null); setDragOverCatRow(null) }}
                            onDragOver={(e) => { e.preventDefault(); setDragOverCatRow(cat) }}
                            onDrop={() => handleCatRowDrop(cat)}
                            style={{
                              borderBottom: '1px solid var(--border)11',
                              opacity: dragCatRow === cat ? 0.4 : 1,
                              background: isDragOver ? 'var(--bg-soft)' : undefined,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            <td style={{ padding: '8px 6px', color: 'var(--text-muted)', cursor: 'grab', textAlign: 'center', fontSize: 12 }}>⠿</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600, fontSize: 13 }}>{cat}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <input
                                type="number" min={0} step={0.01} placeholder="0.00"
                                value={spend || ''}
                                onChange={(e) => upsertCategoryBudget(cat, monthId, 'spend', parseFloat(e.target.value) || 0)}
                                style={{ width: 90, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--bg)', color: 'var(--red)', fontWeight: 600, fontSize: 13 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <input
                                type="number" min={0} step={0.01} placeholder="0.00"
                                value={revenue || ''}
                                onChange={(e) => upsertCategoryBudget(cat, monthId, 'revenue', parseFloat(e.target.value) || 0)}
                                style={{ width: 90, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--bg)', color: 'var(--green)', fontWeight: 600, fontSize: 13 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                              <input
                                type="number" min={0} step={1} placeholder="0"
                                value={leads || ''}
                                onChange={(e) => upsertCategoryBudget(cat, monthId, 'leads', parseInt(e.target.value) || 0)}
                                style={{ width: 70, textAlign: 'right', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', background: 'var(--bg)', color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>
                              {cpl !== null ? fmt(cpl) : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', color: catRoas !== null && catRoas >= 1 ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600, fontSize: 13 }}>
                              {catRoas !== null ? `${catRoas.toFixed(2)}x` : '—'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, fontSize: 13, color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                              {spend > 0 || revenue > 0 ? fmt(profit) : '—'}
                            </td>
                            <td
                              draggable={false}
                              onDragStart={(e) => e.stopPropagation()}
                              style={{ padding: '8px 6px', textAlign: 'center' }}
                            >
                              {(spend > 0 || revenue > 0 || leads > 0) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); deleteCategoryBudget(cat, monthId) }}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  title="Clear data for this category"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: '2px 4px', borderRadius: 4 }}
                                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--red)')}
                                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                                >✕</button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td></td>
                        <td style={{ padding: '8px 10px', fontWeight: 700 }}>Total</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--red)' }}>{totalSpend > 0 ? fmt(totalSpend) : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{totalRevenue > 0 ? fmt(totalRevenue) : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{totalLeads > 0 ? totalLeads : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>{totalLeads > 0 && totalSpend > 0 ? fmt(totalSpend / totalLeads) : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{roas !== null ? `${roas.toFixed(2)}x` : '—'}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: totalRevenue - totalSpend >= 0 ? 'var(--green)' : 'var(--red)' }}>
                          {totalSpend > 0 || totalRevenue > 0 ? fmt(totalRevenue - totalSpend) : '—'}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            })}
            <button
              className="btn ghost small"
              onClick={() => {
                const prev = catMonths[0]
                const [y, m] = prev.split('-').map(Number)
                const next = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
                if (!catMonths.includes(next)) {
                  setData((d) => updateActiveWorkspace(d, (w) => ({
                    ...w,
                    adCategoryBudgets: [...(w.adCategoryBudgets ?? []), { id: uuid(), productCategory: productCategories[0], monthId: next, spend: 0, revenue: 0 }],
                  })))
                }
              }}
            >
              + Add Previous Month
            </button>
          </div>
        )}
      </div>

      {/* ── Accounts management ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>Ad Accounts</h2>
          <p>Name each ad account and give it a color to separate spend across NOOMS, PulseAI, etc.</p>
          <button className="btn secondary small" onClick={addAccount}>+ Add Account</button>
        </div>
        {adAccounts.length === 0 ? (
          <div className="empty-state">No accounts yet — add one to start grouping campaigns by account.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {adAccounts.map((acc) => (
              <div key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--bg-elevated)', border: `2px solid ${acc.color}22` }}>
                <input
                  type="color"
                  value={acc.color}
                  onChange={(e) => updateAccount(acc.id, { color: e.target.value })}
                  style={{ width: 32, height: 32, border: 'none', background: 'none', cursor: 'pointer', borderRadius: 6, padding: 2 }}
                  title="Pick account color"
                />
                <input
                  type="text"
                  className="table-input"
                  value={acc.name}
                  onChange={(e) => updateAccount(acc.id, { name: e.target.value })}
                  style={{ flex: 1, fontWeight: 600 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {fmt(spendByAccount.get(acc.id) ?? 0)} spend
                </span>
                <button className="btn secondary small" onClick={() => addCampaign(acc.id)}>+ Campaign</button>
                <button className="btn ghost small" onClick={() => removeAccount(acc.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Campaigns grouped by account ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>Campaigns</h2>
          <p>Grouped by account, ranked by spend. Assign campaigns to accounts using the Account column.</p>
          <button className="btn secondary small" onClick={() => addCampaign()}>+ Add Campaign</button>
        </div>
        {campaigns.length === 0 ? (
          <div className="empty-state">No campaigns yet — sync from Meta or add one manually.</div>
        ) : (
          <>
            {/* Render each account group */}
            {[...adAccounts.map((a) => ({ id: a.id, label: a.name, color: a.color })), { id: '__none__', label: 'Unassigned', color: 'var(--text-muted)' }]
              .filter(({ id }) => groupedCampaigns.has(id))
              .map(({ id, label, color }) => {
                const group = groupedCampaigns.get(id)!
                return (
                  <div key={id} style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${color}44` }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, fontSize: 13 }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                        {group.length} campaign{group.length !== 1 ? 's' : ''} · {formatCurrency(group.reduce((s, c) => s + c.spend, 0), ws.currency)}
                      </span>
                    </div>
                    <div className="scroll-x">
                      <table style={{ width: '100%' }}>
                        <thead>
                          <tr>
                            <th>Campaign</th>
                            <th>Account</th>
                            <th>Platform</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Spend</th>
                            <th style={{ textAlign: 'right' }}>Revenue</th>
                            <th style={{ textAlign: 'right' }}>ROAS</th>
                            <th style={{ textAlign: 'right' }}>Conv.</th>
                            <th style={{ textAlign: 'right' }}>CPA</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.map((s) => (
                            <tr key={s.campaign.id}>
                              <td>
                                <input type="text" className="table-input" value={s.campaign.name}
                                  onChange={(e) => updateCampaign(s.campaign.id, { name: e.target.value })} style={{ minWidth: 160 }} />
                              </td>
                              <td>
                                <select className="table-input" value={s.campaign.accountId ?? ''}
                                  onChange={(e) => updateCampaign(s.campaign.id, { accountId: e.target.value || undefined })}>
                                  <option value="">— Unassigned —</option>
                                  {adAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input type="text" className="table-input" value={s.campaign.platform}
                                  onChange={(e) => updateCampaign(s.campaign.id, { platform: e.target.value })} />
                              </td>
                              <td>
                                <select className="table-input" value={s.campaign.status}
                                  onChange={(e) => updateCampaign(s.campaign.id, { status: e.target.value as AdCampaignStatus })}>
                                  <option value="active">Active</option>
                                  <option value="paused">Paused</option>
                                  <option value="ended">Ended</option>
                                </select>
                              </td>
                              <td className="amount negative">
                                <InlineSpend
                                  campaignId={s.campaign.id}
                                  entries={entries}
                                  currency={curr}
                                  onUpdate={(campaignId, spend) => {
                                    setData((prev) =>
                                      updateActiveWorkspace(prev, (w) => {
                                        const month = `${currentMonth()}-01`
                                        const existing = (w.adSpendEntries ?? []).find(
                                          (e) => e.campaignId === campaignId && e.date.startsWith(currentMonth())
                                        )
                                        let entries: AdSpendEntry[]
                                        if (existing) {
                                          entries = (w.adSpendEntries ?? []).map((e) =>
                                            e.id === existing.id ? { ...e, spend } : e
                                          )
                                        } else {
                                          entries = [
                                            ...(w.adSpendEntries ?? []),
                                            { id: uuid(), campaignId, date: month, spend, revenue: 0, conversions: 0, clicks: 0 },
                                          ]
                                        }
                                        return reconcileAdSpendTransactions({ ...w, adSpendEntries: entries })
                                      })
                                    )
                                  }}
                                />
                              </td>
                              <td className="amount positive">{fmt(s.revenue)}</td>
                              <td className="amount">{s.roas !== null ? `${s.roas.toFixed(2)}x` : '—'}</td>
                              <td className="amount">{s.conversions || '—'}</td>
                              <td className="amount">{s.cpa !== null ? fmt(s.cpa) : '—'}</td>
                              <td className="actions">
                                <button className="btn ghost small" onClick={() => removeCampaign(s.campaign.id)}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
          </>
        )}
      </div>

      {/* ── Spend Log ── */}
      <div className="panel">
        <div className="panel-header">
          <h2>Spend Log</h2>
          <p>One row per campaign per month. Edit spend, revenue and conversions here.</p>
          <button className="btn secondary small" onClick={() => addEntry()} disabled={campaigns.length === 0}>+ Add Entry</button>
        </div>
        {sortedEntries.length === 0 ? (
          <div className="empty-state">No spend logged yet — sync from Meta or add manually.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Account</th>
                  <th>Campaign</th>
                  <th style={{ textAlign: 'right' }}>Spend</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Conv.</th>
                  <th style={{ textAlign: 'right' }}>Clicks</th>
                  <th style={{ textAlign: 'right' }}>ROAS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((e) => {
                  const campaign = campaigns.find((c) => c.id === e.campaignId)
                  const acc = campaign?.accountId ? accountById.get(campaign.accountId) : undefined
                  const roas = e.spend > 0 ? e.revenue / e.spend : null
                  return (
                    <tr key={e.id}>
                      <td>
                        <input type="month" className="table-input" value={toMonthKey(e.date)}
                          onChange={(ev) => updateEntry(e.id, { date: `${ev.target.value}-01` })} />
                      </td>
                      <td>
                        {acc ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 20, background: `${acc.color}22`, color: acc.color, fontWeight: 600, fontSize: 12 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: acc.color, display: 'inline-block' }} />
                            {acc.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td>
                        <select className="table-input" value={e.campaignId}
                          onChange={(ev) => updateEntry(e.id, { campaignId: ev.target.value })}>
                          {campaigns.map((c) => {
                            const cAcc = c.accountId ? accountById.get(c.accountId) : undefined
                            return (
                              <option key={c.id} value={c.id}>
                                {cAcc ? `[${cAcc.name}] ` : ''}{c.name}
                              </option>
                            )
                          })}
                        </select>
                      </td>
                      <td className="amount negative">
                        <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 90 }}
                          value={e.spend} onChange={(ev) => updateEntry(e.id, { spend: parseFloat(ev.target.value) || 0 })} />
                      </td>
                      <td className="amount positive">
                        <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 90 }}
                          value={e.revenue} onChange={(ev) => updateEntry(e.id, { revenue: parseFloat(ev.target.value) || 0 })} />
                      </td>
                      <td className="amount">
                        <input type="number" step="1" className="table-input amount-input" style={{ maxWidth: 70 }}
                          value={e.conversions} onChange={(ev) => updateEntry(e.id, { conversions: parseInt(ev.target.value) || 0 })} />
                      </td>
                      <td className="amount">
                        <input type="number" step="1" className="table-input amount-input" style={{ maxWidth: 70 }}
                          value={e.clicks ?? 0} onChange={(ev) => updateEntry(e.id, { clicks: parseInt(ev.target.value) || 0 })} />
                      </td>
                      <td className="amount">{roas !== null ? `${roas.toFixed(2)}x` : '—'}</td>
                      <td className="actions">
                        <button className="btn ghost small" onClick={() => removeEntry(e.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

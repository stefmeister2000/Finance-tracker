import { v4 as uuid } from 'uuid'
import type { AppData, FundAllocation, Shareholder, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { useCurrency } from '../CurrencyContext'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const ALLOCATION_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#a855f7', '#0ea5e9', '#ec4899']

export default function FundingPage({ ws, setData }: Props) {
  const { fmt } = useCurrency()
  const raised = ws.investorFunds ?? 0
  const allocations = ws.fundAllocations ?? []

  const totalPlanned = allocations.reduce((s, a) => s + a.planned, 0)
  const totalSpent = allocations.reduce((s, a) => s + (a.spent ?? 0), 0)
  const unallocated = raised - totalPlanned
  const remaining = raised - totalSpent

  // Monthly burn from the Fixed Costs page → rough runway on the raised capital.
  const monthlyBurn = (ws.fixedCosts ?? []).reduce((s, f) => s + f.monthlyCost, 0)
  const runwayMonths = monthlyBurn > 0 ? remaining / monthlyBurn : undefined

  function setRaised(v: number) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, investorFunds: v })))
  }

  function addAllocation() {
    const a: FundAllocation = { id: uuid(), category: 'New bucket', planned: 0, spent: 0 }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, fundAllocations: [...(w.fundAllocations ?? []), a] })))
  }

  function updateAllocation(id: string, updates: Partial<FundAllocation>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fundAllocations: (w.fundAllocations ?? []).map((a) => (a.id === id ? { ...a, ...updates } : a)),
      })),
    )
  }

  function removeAllocation(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, fundAllocations: (w.fundAllocations ?? []).filter((a) => a.id !== id) })),
    )
  }

  const shareholders = ws.shareholders ?? []
  const totalPercent = shareholders.reduce((s, h) => s + h.percent, 0)
  const totalInvested = shareholders.reduce((s, h) => s + h.amountInvested, 0)
  // Post-money valuation implied by the priced (external) investors: amount ÷ their equity %.
  const priced = shareholders.filter((h) => h.amountInvested > 0 && h.percent > 0)
  const impliedValuation = priced.length > 0
    ? Math.max(...priced.map((h) => h.amountInvested / (h.percent / 100)))
    : 0

  function addShareholder() {
    const h: Shareholder = { id: uuid(), name: '', percent: 0, amountInvested: 0 }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, shareholders: [...(w.shareholders ?? []), h] })))
  }
  function updateShareholder(id: string, updates: Partial<Shareholder>) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w, shareholders: (w.shareholders ?? []).map((h) => (h.id === id ? { ...h, ...updates } : h)),
    })))
  }
  function removeShareholder(id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, shareholders: (w.shareholders ?? []).filter((h) => h.id !== id) })))
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Funding &amp; Use of Funds</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Plan and track how you'll spend investor money — allocate the raise into buckets and watch what's left.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Raised Capital</h2>
          <p>Total investor money you have to deploy.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-muted)' }}>{ws.currency}</span>
          <input
            type="number"
            min={0}
            step={100}
            placeholder="0.00"
            value={raised || ''}
            onChange={(e) => setRaised(parseFloat(e.target.value) || 0)}
            style={{ fontSize: 30, fontWeight: 700, width: 220, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none', borderBottom: '2px solid var(--border)' }}
          />
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Cap Table — Shareholders</h2>
          <p>Who owns what, and what each investor paid for their stake. Founders can be 0 invested.</p>
          <button className="btn secondary small" onClick={addShareholder}>+ Add Shareholder</button>
        </div>
        {shareholders.length === 0 ? (
          <div className="empty-state">No shareholders yet — add founders and investors with their ownership %.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Shareholder</th>
                  <th style={{ textAlign: 'right' }}>% owned</th>
                  <th style={{ textAlign: 'right' }}>Amount paid</th>
                  <th style={{ textAlign: 'right' }}>Implied valuation</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shareholders.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <input type="text" className="table-input" value={h.name} placeholder="Name" style={{ minWidth: 140 }}
                        onChange={(e) => updateShareholder(h.id, { name: e.target.value })} />
                    </td>
                    <td className="amount">
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min={0} max={100} step={0.1} className="table-input amount-input" style={{ maxWidth: 70 }}
                          value={h.percent || ''} placeholder="0"
                          onChange={(e) => updateShareholder(h.id, { percent: parseFloat(e.target.value) || 0 })} />
                        <span style={{ color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </td>
                    <td className="amount">
                      <input type="number" min={0} step={0.01} className="table-input amount-input" style={{ maxWidth: 110 }}
                        value={h.amountInvested || ''} placeholder="0.00"
                        onChange={(e) => updateShareholder(h.id, { amountInvested: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td className="amount" style={{ color: 'var(--text-muted)' }}>
                      {h.amountInvested > 0 && h.percent > 0 ? fmt(h.amountInvested / (h.percent / 100)) : '—'}
                    </td>
                    <td>
                      <input type="text" className="table-input" value={h.notes ?? ''} placeholder="Role, share class…" style={{ minWidth: 130 }}
                        onChange={(e) => updateShareholder(h.id, { notes: e.target.value })} />
                    </td>
                    <td className="actions">
                      <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${h.name || 'this shareholder'}"?`)) removeShareholder(h.id) }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="amount"><strong style={{ color: Math.abs(totalPercent - 100) > 0.01 ? 'var(--red)' : undefined }}>{totalPercent.toFixed(1)}%</strong></td>
                  <td className="amount"><strong>{fmt(totalInvested)}</strong></td>
                  <td className="amount"><strong>{impliedValuation > 0 ? fmt(impliedValuation) : '—'}</strong></td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {shareholders.length > 0 && Math.abs(totalPercent - 100) > 0.01 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
            ⚠ Ownership adds up to {totalPercent.toFixed(1)}%, not 100%.
          </div>
        )}
        {impliedValuation > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            Implied post-money valuation: <strong>{fmt(impliedValuation)}</strong> (from the priciest priced stake).
          </div>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Raised</div>
          <div className="value">{fmt(raised)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Allocated</div>
          <div className="value">{fmt(totalPlanned)}</div>
          <div className="sub">{raised > 0 ? `${((totalPlanned / raised) * 100).toFixed(0)}% of raise` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Unallocated</div>
          <div className={`value ${unallocated < 0 ? 'negative' : ''}`}>{fmt(unallocated)}</div>
          <div className="sub">{unallocated < 0 ? 'over-allocated' : 'still to plan'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Spent so far</div>
          <div className="value negative">{fmt(totalSpent)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Remaining</div>
          <div className={`value ${remaining < 0 ? 'negative' : 'positive'}`}>{fmt(remaining)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Runway on remaining</div>
          <div className="value">{runwayMonths !== undefined ? `${runwayMonths.toFixed(1)} mo` : '—'}</div>
          <div className="sub">{monthlyBurn > 0 ? `÷ ${fmt(monthlyBurn)}/mo burn` : 'set Fixed Costs'}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Use of Funds</h2>
          <p>Break the raise into buckets. "Planned" is what you earmark; "Spent" is what's gone so far.</p>
          <button className="btn secondary small" onClick={addAllocation}>+ Add Allocation</button>
        </div>

        {allocations.length === 0 ? (
          <div className="empty-state">No allocations yet — add buckets like Marketing, Hiring, Inventory, Product.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Bucket</th>
                  <th style={{ textAlign: 'right' }}>Planned</th>
                  <th style={{ textAlign: 'right' }}>% of raise</th>
                  <th style={{ textAlign: 'right' }}>Spent</th>
                  <th style={{ textAlign: 'right' }}>Left</th>
                  <th style={{ minWidth: 120 }}>Progress</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {allocations.map((a, i) => {
                  const spent = a.spent ?? 0
                  const left = a.planned - spent
                  const pctOfRaise = raised > 0 ? (a.planned / raised) * 100 : 0
                  const pctSpent = a.planned > 0 ? Math.min(100, (spent / a.planned) * 100) : 0
                  const color = ALLOCATION_COLORS[i % ALLOCATION_COLORS.length]
                  return (
                    <tr key={a.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                          <input type="text" className="table-input" value={a.category} placeholder="Bucket" style={{ minWidth: 120 }}
                            onChange={(e) => updateAllocation(a.id, { category: e.target.value })} />
                        </div>
                      </td>
                      <td className="amount">
                        <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 110 }} value={a.planned || ''} placeholder="0.00"
                          onChange={(e) => updateAllocation(a.id, { planned: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className="amount" style={{ color: 'var(--text-muted)' }}>{pctOfRaise.toFixed(0)}%</td>
                      <td className="amount">
                        <input type="number" step="0.01" className="table-input amount-input" style={{ maxWidth: 100 }} value={a.spent || ''} placeholder="0.00"
                          onChange={(e) => updateAllocation(a.id, { spent: parseFloat(e.target.value) || 0 })} />
                      </td>
                      <td className={`amount ${left < 0 ? 'negative' : 'positive'}`}>{fmt(left)}</td>
                      <td>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--border)', overflow: 'hidden' }} title={`${pctSpent.toFixed(0)}% spent`}>
                          <div style={{ height: '100%', width: `${pctSpent}%`, background: left < 0 ? '#ef4444' : color, borderRadius: 4 }} />
                        </div>
                      </td>
                      <td>
                        <input type="text" className="table-input" value={a.notes ?? ''} placeholder="Detail…" style={{ minWidth: 140 }}
                          onChange={(e) => updateAllocation(a.id, { notes: e.target.value })} />
                      </td>
                      <td className="actions">
                        <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${a.category || 'this bucket'}"?`)) removeAllocation(a.id) }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="amount"><strong>{fmt(totalPlanned)}</strong></td>
                  <td className="amount" style={{ color: 'var(--text-muted)' }}>{raised > 0 ? `${((totalPlanned / raised) * 100).toFixed(0)}%` : '—'}</td>
                  <td className="amount"><strong>{fmt(totalSpent)}</strong></td>
                  <td className="amount"><strong>{fmt(totalPlanned - totalSpent)}</strong></td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        {unallocated < 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
            ⚠ You've planned {fmt(-unallocated)} more than you raised.
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, Influencer, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { formatCurrency } from '../utils'
import { useCurrency } from '../CurrencyContext'
import { DEFAULT_VAT, migrateCostItems, netPrice, totalCosts } from './BusinessToolsPage'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Snapchat', 'X / Twitter', 'Affiliate site', 'Other']

export default function InfluencersPage({ ws, setData }: Props) {
  const { toDisplay: displayAmt, curr: displayCurr } = useCurrency()
  const influencers = ws.influencers ?? []
  const products = (ws.products ?? []).filter((p) => p.sellingPrice > 0)
  const vatRate = ws.vatRate ?? DEFAULT_VAT
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function addInfluencer() {
    const inf: Influencer = { id: uuid(), name: 'New Partner', platform: 'Instagram', commissionPct: 10 }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, influencers: [...(w.influencers ?? []), inf] })))
    setExpandedId(inf.id)
  }

  function updateInfluencer(id: string, updates: Partial<Influencer>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        influencers: (w.influencers ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function removeInfluencer(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, influencers: (w.influencers ?? []).filter((i) => i.id !== id) })),
    )
  }

  function toggleProductLink(inf: Influencer, productId: string) {
    const current = inf.productIds ?? []
    const next = current.includes(productId) ? current.filter((x) => x !== productId) : [...current, productId]
    updateInfluencer(inf.id, { productIds: next })
  }

  function linkedProducts(inf: Influencer) {
    const ids = inf.productIds ?? []
    return ids.length === 0 ? products : products.filter((p) => ids.includes(p.id))
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Influencers &amp; Affiliates</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Track commission partners and see exactly what each deal does to your product margins.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Partners</h2>
          <p>Commission is calculated on net (ex-VAT) revenue including extra charges. Assign specific products or leave empty for all.</p>
          <button className="btn secondary small" onClick={addInfluencer}>+ Add Partner</button>
        </div>

        {influencers.length === 0 && (
          <div className="empty-state">No partners yet — add an influencer or affiliate to model their commission.</div>
        )}

        <div style={{ display: 'grid', gap: 14 }}>
          {influencers.map((inf) => {
            const linked = linkedProducts(inf)
            const expanded = expandedId === inf.id
            return (
              <div key={inf.id} style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', borderBottom: expanded ? '1px solid var(--border)' : 'none' }}>
                  <input
                    type="text"
                    className="table-input"
                    value={inf.name}
                    onChange={(e) => updateInfluencer(inf.id, { name: e.target.value })}
                    style={{ fontWeight: 700, fontSize: 15, width: 180 }}
                    placeholder="Partner name"
                  />
                  <select
                    className="table-input"
                    value={inf.platform}
                    onChange={(e) => updateInfluencer(inf.id, { platform: e.target.value })}
                    style={{ width: 130 }}
                  >
                    {PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
                  </select>
                  <input
                    type="text"
                    className="table-input"
                    value={inf.handle ?? ''}
                    onChange={(e) => updateInfluencer(inf.id, { handle: e.target.value })}
                    style={{ width: 140 }}
                    placeholder="@handle"
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="table-input"
                      value={inf.commissionPct || ''}
                      onChange={(e) => updateInfluencer(inf.id, { commissionPct: parseFloat(e.target.value) || 0 })}
                      style={{ width: 70, fontWeight: 700 }}
                      placeholder="0"
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>% commission</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>+ {ws.currency}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className="table-input"
                      value={inf.fixedPerSale || ''}
                      onChange={(e) => updateInfluencer(inf.id, { fixedPerSale: parseFloat(e.target.value) || 0 })}
                      style={{ width: 80 }}
                      placeholder="0.00"
                    />
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>/ sale</span>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="btn ghost small" onClick={() => setExpandedId(expanded ? null : inf.id)}>
                      {expanded ? '▲ Hide impact' : `▼ Margin impact (${linked.length})`}
                    </button>
                    <button className="btn ghost small" onClick={() => { if (confirm(`Remove "${inf.name}"?`)) removeInfluencer(inf.id) }} title="Remove partner">✕</button>
                  </div>
                </div>

                {expanded && (
                  <div style={{ padding: '12px 16px' }}>
                    {/* Product assignment */}
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                      Products promoted {((inf.productIds ?? []).length === 0) && '(none selected = all products)'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                      {products.map((p) => {
                        const on = (inf.productIds ?? []).includes(p.id)
                        return (
                          <button
                            key={p.id}
                            className="btn small"
                            onClick={() => toggleProductLink(inf, p.id)}
                            style={{
                              border: on ? '2px solid var(--accent)' : '1px solid var(--border)',
                              background: on ? 'var(--accent-soft)' : 'var(--bg)',
                              color: on ? 'var(--accent)' : 'var(--text)',
                              fontWeight: on ? 700 : 400,
                            }}
                          >
                            {p.name}
                          </button>
                        )
                      })}
                      {products.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No priced products yet.</span>}
                    </div>

                    {/* Margin impact table */}
                    {linked.length > 0 && (
                      <div className="scroll-x">
                        <table style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '8px 12px' }}>Product</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px' }}>Net price (ex-VAT)</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px' }}>Commission / sale</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px' }}>Profit before</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px' }}>Profit after</th>
                              <th style={{ textAlign: 'right', padding: '8px 12px' }}>Margin before → after</th>
                            </tr>
                          </thead>
                          <tbody>
                            {linked.map((p) => {
                              // Commission applies to the product's net (ex-VAT) sale price — matching the
                              // Economics page — not to pass-through shipping/extra charges.
                              const net = netPrice(p, vatRate)
                              const cost = totalCosts({ ...p, costItems: p.costItems ?? migrateCostItems(p) })
                              const profitBefore = net - cost
                              const marginBefore = net > 0 ? (profitBefore / net) * 100 : 0
                              const commission = net * (inf.commissionPct / 100) + (inf.fixedPerSale ?? 0)
                              const profitAfter = profitBefore - commission
                              const marginAfter = net > 0 ? (profitAfter / net) * 100 : 0
                              return (
                                <tr key={p.id}>
                                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.name}</td>
                                  <td className="amount" style={{ padding: '8px 12px' }}>{formatCurrency(displayAmt(net), displayCurr)}</td>
                                  <td className="amount negative" style={{ padding: '8px 12px' }}>−{formatCurrency(displayAmt(commission), displayCurr)}</td>
                                  <td className={`amount ${profitBefore >= 0 ? 'positive' : 'negative'}`} style={{ padding: '8px 12px' }}>{formatCurrency(displayAmt(profitBefore), displayCurr)}</td>
                                  <td className={`amount ${profitAfter >= 0 ? 'positive' : 'negative'}`} style={{ padding: '8px 12px', fontWeight: 700 }}>{formatCurrency(displayAmt(profitAfter), displayCurr)}</td>
                                  <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{marginBefore.toFixed(1)}%</span>
                                    {' → '}
                                    <span style={{ fontWeight: 700, color: marginAfter >= 20 ? 'var(--green)' : marginAfter >= 0 ? 'var(--text)' : 'var(--red)' }}>
                                      {marginAfter.toFixed(1)}%
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="field" style={{ marginTop: 14, maxWidth: 480 }}>
                      <label>Notes</label>
                      <input
                        type="text"
                        value={inf.notes ?? ''}
                        onChange={(e) => updateInfluencer(inf.id, { notes: e.target.value })}
                        placeholder="e.g. deal terms, discount code, payout schedule…"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

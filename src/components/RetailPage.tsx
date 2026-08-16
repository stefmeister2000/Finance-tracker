import { v4 as uuid } from 'uuid'
import type { AppData, Product, RetailPartner, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { useCurrency } from '../CurrencyContext'
import { DEFAULT_VAT, migrateCostItems, netPrice } from './BusinessToolsPage'

// Costs that only apply when shipping to end customers (not when selling wholesale to a retailer).
const LOGISTICS_RE = /deliver|shipping|logistic|courier|postage|transport|freight|fulfil|shipment|distribution|packaging/i

/** The cost to make/buy the product — excludes customer logistics (delivery, shipping, fulfilment),
 *  since a retailer handles their own logistics. This is the relevant cost for a wholesale sale. */
function goodsCost(p: Product): number {
  const items = p.costItems ?? migrateCostItems(p)
  return items.filter((c) => !LOGISTICS_RE.test(c.label)).reduce((s, c) => s + c.amount, 0)
}

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const STATUS_COLORS: Record<NonNullable<RetailPartner['status']>, string> = {
  active: '#22c55e',
  prospect: '#f59e0b',
  paused: '#94a3b8',
}

export default function RetailPage({ ws, setData }: Props) {
  const { fmt } = useCurrency()
  const partners = ws.retailPartners ?? []
  const products = (ws.products ?? []).filter((p) => p.sellingPrice > 0)
  const vatRate = ws.vatRate ?? DEFAULT_VAT

  function addPartner() {
    const p: RetailPartner = { id: uuid(), name: 'New Retailer', purchaseTerms: '', marginPct: 30, status: 'prospect' }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, retailPartners: [...(w.retailPartners ?? []), p] })))
  }

  function updatePartner(id: string, updates: Partial<RetailPartner>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        retailPartners: (w.retailPartners ?? []).map((r) => (r.id === id ? { ...r, ...updates } : r)),
      })),
    )
  }

  function removePartner(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, retailPartners: (w.retailPartners ?? []).filter((r) => r.id !== id) })),
    )
  }

  // Average product cost + net price across priced products, for the wholesale illustration.
  const avgNet = products.length > 0 ? products.reduce((s, p) => s + netPrice(p, vatRate), 0) / products.length : 0
  const avgCost = products.length > 0 ? products.reduce((s, p) => s + goodsCost(p), 0) / products.length : 0

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Retail &amp; Wholesale</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Shops and partners that stock your products — their purchase terms and the margin they take.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Retail Partners</h2>
          <p>Add a retailer, their purchase terms (Inkoop), and the margin they keep. Wholesale price = your price minus their margin.</p>
          <button className="btn secondary small" onClick={addPartner}>+ Add Retailer</button>
        </div>

        {partners.length === 0 ? (
          <div className="empty-state">No retail partners yet — click Add Retailer to start.</div>
        ) : (
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Retail</th>
                  <th>Inkoop (purchase terms)</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  <th>Products</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {partners.map((r) => {
                  const linkedCount = (r.productIds ?? []).length
                  return (
                    <tr key={r.id}>
                      <td>
                        <input
                          type="text"
                          className="table-input"
                          value={r.name}
                          onChange={(e) => updatePartner(r.id, { name: e.target.value })}
                          style={{ fontWeight: 600, minWidth: 130 }}
                          placeholder="Retailer name"
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="table-input"
                          value={r.purchaseTerms ?? ''}
                          onChange={(e) => updatePartner(r.id, { purchaseTerms: e.target.value })}
                          style={{ minWidth: 140 }}
                          placeholder="e.g. 30-50 SKU"
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className="table-input amount-input"
                            value={r.marginPct ?? ''}
                            onChange={(e) => updatePartner(r.id, { marginPct: parseFloat(e.target.value) || 0 })}
                            style={{ maxWidth: 60 }}
                            placeholder="0"
                          />
                          <span style={{ color: 'var(--text-muted)' }}>%</span>
                        </div>
                      </td>
                      <td>
                        <select
                          className="table-input"
                          value=""
                          onChange={(e) => {
                            const pid = e.target.value
                            if (!pid) return
                            const cur = r.productIds ?? []
                            updatePartner(r.id, { productIds: cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid] })
                            e.target.value = ''
                          }}
                          style={{ minWidth: 120 }}
                          title="Toggle which products this retailer stocks"
                        >
                          <option value="">{linkedCount === 0 ? 'All products' : `${linkedCount} selected…`}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {(r.productIds ?? []).includes(p.id) ? '✓ ' : ''}{p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="table-input"
                          value={r.status ?? 'prospect'}
                          onChange={(e) => updatePartner(r.id, { status: e.target.value as RetailPartner['status'] })}
                          style={{ color: STATUS_COLORS[r.status ?? 'prospect'], fontWeight: 600 }}
                        >
                          <option value="active">Active</option>
                          <option value="prospect">Prospect</option>
                          <option value="paused">Paused</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="table-input"
                          value={r.notes ?? ''}
                          onChange={(e) => updatePartner(r.id, { notes: e.target.value })}
                          style={{ minWidth: 140 }}
                          placeholder="Contact, order cadence…"
                        />
                      </td>
                      <td className="actions">
                        <button className="btn ghost small" onClick={() => { if (confirm(`Remove "${r.name}"?`)) removePartner(r.id) }}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {partners.length > 0 && products.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Wholesale Economics</h2>
            <p>What each retailer's margin does to your per-product profit. Wholesale price = net price × (1 − their margin).</p>
          </div>
          <div className="scroll-x">
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Retailer</th>
                  <th style={{ textAlign: 'right' }}>Their margin</th>
                  <th style={{ textAlign: 'right' }}>Your wholesale price*</th>
                  <th style={{ textAlign: 'right' }}>Your goods cost*</th>
                  <th style={{ textAlign: 'right' }}>Your profit / unit*</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((r) => {
                  const m = (r.marginPct ?? 0) / 100
                  const linked = (r.productIds ?? []).length > 0 ? products.filter((p) => (r.productIds ?? []).includes(p.id)) : products
                  const net = linked.reduce((s, p) => s + netPrice(p, vatRate), 0) / (linked.length || 1)
                  const cost = linked.reduce((s, p) => s + goodsCost(p), 0) / (linked.length || 1)
                  const wholesale = net * (1 - m)
                  const profit = wholesale - cost
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td className="amount">{(r.marginPct ?? 0)}%</td>
                      <td className="amount">{fmt(wholesale)}</td>
                      <td className="amount negative">{fmt(cost)}</td>
                      <td className={`amount ${profit >= 0 ? 'positive' : 'negative'}`} style={{ fontWeight: 700 }}>{fmt(profit)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            * Averaged across the retailer's linked products (or all products if none are linked). <strong>Goods cost only</strong> — customer logistics (delivery, shipping, fulfilment, packaging) are excluded, since the retailer handles their own logistics. For reference, your average net price is {fmt(avgNet)} and average goods cost {fmt(avgCost)}.
          </p>
        </div>
      )}
    </div>
  )
}

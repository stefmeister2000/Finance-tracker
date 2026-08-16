import { v4 as uuid } from 'uuid'
import type { AppData, InventoryPurchase, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { useCurrency } from '../CurrencyContext'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const lineTotal = (p: InventoryPurchase) => p.quantity * p.unitCost

export default function InventoryPage({ ws, setData }: Props) {
  const { fmt } = useCurrency()
  const purchases = ws.inventoryPurchases ?? []

  const totalCost = purchases.reduce((s, p) => s + lineTotal(p), 0)
  const totalUnits = purchases.reduce((s, p) => s + p.quantity, 0)
  const onOrderValue = purchases.filter((p) => !p.received).reduce((s, p) => s + lineTotal(p), 0)
  const unpaidValue = purchases.filter((p) => !p.paid).reduce((s, p) => s + lineTotal(p), 0)
  const stockOnHandValue = purchases.filter((p) => p.received).reduce((s, p) => s + lineTotal(p), 0)
  const stockOnHandUnits = purchases.filter((p) => p.received).reduce((s, p) => s + p.quantity, 0)

  function addPurchase() {
    const p: InventoryPurchase = { id: uuid(), item: '', supplier: '', quantity: 0, unitCost: 0, orderDate: '', arrivalDate: '', received: false, paid: false }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, inventoryPurchases: [...(w.inventoryPurchases ?? []), p] })))
  }
  function updatePurchase(id: string, updates: Partial<InventoryPurchase>) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w, inventoryPurchases: (w.inventoryPurchases ?? []).map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })))
  }
  function removePurchase(id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, inventoryPurchases: (w.inventoryPurchases ?? []).filter((p) => p.id !== id) })))
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Inventory &amp; Supply</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
          Plan future stock purchases and track supply cost — what's on order, what's arrived, and what's still to pay.
        </p>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="label">Total Supply Cost</div><div className="value negative">{fmt(totalCost)}</div><div className="sub">{totalUnits.toLocaleString()} units</div></div>
        <div className="stat-card"><div className="label">On Order (not arrived)</div><div className="value">{fmt(onOrderValue)}</div></div>
        <div className="stat-card"><div className="label">Stock On Hand</div><div className="value positive">{fmt(stockOnHandValue)}</div><div className="sub">{stockOnHandUnits.toLocaleString()} units received</div></div>
        <div className="stat-card"><div className="label">Unpaid to Suppliers</div><div className={`value ${unpaidValue > 0 ? 'negative' : 'positive'}`}>{fmt(unpaidValue)}</div></div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Supply Purchases</h2>
          <p>Each order: what you buy, from whom, quantity × unit cost, and when it's ordered / arrives.</p>
          <button className="btn secondary small" onClick={addPurchase}>+ Add Purchase</button>
        </div>
        {purchases.length === 0 ? (
          <div className="empty-state">No purchases yet — add a supply order to plan future stock costs.</div>
        ) : (
          <div className="scroll-x">
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Supplier</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit cost</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Order date</th>
                  <th>Arrival</th>
                  <th>Received</th>
                  <th>Paid</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...purchases]
                  .sort((a, b) => (a.arrivalDate || a.orderDate || '').localeCompare(b.arrivalDate || b.orderDate || ''))
                  .map((p) => {
                    const arriving = !p.received && !!p.arrivalDate && p.arrivalDate >= today
                    const late = !p.received && !!p.arrivalDate && p.arrivalDate < today
                    return (
                      <tr key={p.id} style={late ? { background: '#f59e0b12' } : undefined}>
                        <td><input type="text" className="table-input" value={p.item} placeholder="Product / material" style={{ minWidth: 140 }}
                          onChange={(e) => updatePurchase(p.id, { item: e.target.value })} /></td>
                        <td><input type="text" className="table-input" value={p.supplier ?? ''} placeholder="Supplier" style={{ minWidth: 110 }}
                          onChange={(e) => updatePurchase(p.id, { supplier: e.target.value })} /></td>
                        <td className="amount"><input type="number" min={0} step={1} className="table-input amount-input" style={{ width: 90, maxWidth: 90 }} value={p.quantity || ''} placeholder="0"
                          onChange={(e) => updatePurchase(p.id, { quantity: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="amount"><input type="number" min={0} step={0.01} className="table-input amount-input" style={{ width: 100, maxWidth: 100 }} value={p.unitCost || ''} placeholder="0.00"
                          onChange={(e) => updatePurchase(p.id, { unitCost: parseFloat(e.target.value) || 0 })} /></td>
                        <td className="amount negative"><strong>{fmt(lineTotal(p))}</strong></td>
                        <td><input type="date" className="table-input" value={p.orderDate ?? ''}
                          onChange={(e) => updatePurchase(p.id, { orderDate: e.target.value || undefined })} /></td>
                        <td><input type="date" className="table-input" value={p.arrivalDate ?? ''}
                          style={late ? { color: '#f59e0b', fontWeight: 600 } : arriving ? { color: 'var(--accent)' } : undefined}
                          onChange={(e) => updatePurchase(p.id, { arrivalDate: e.target.value || undefined })} /></td>
                        <td>
                          <button className="btn ghost small" onClick={() => updatePurchase(p.id, { received: !p.received })}
                            style={p.received ? { color: 'var(--green)', borderColor: 'var(--green)' } : undefined}>
                            {p.received ? '✓ In stock' : 'On order'}
                          </button>
                        </td>
                        <td>
                          <button className="btn ghost small" onClick={() => updatePurchase(p.id, { paid: !p.paid })}
                            style={p.paid ? { color: 'var(--green)', borderColor: 'var(--green)' } : undefined}>
                            {p.paid ? '✓ Paid' : 'Unpaid'}
                          </button>
                        </td>
                        <td className="actions">
                          <button className="btn ghost small danger" onClick={() => { if (confirm(`Remove "${p.item || 'this purchase'}"?`)) removePurchase(p.id) }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}><strong>Total</strong></td>
                  <td className="amount negative"><strong>{fmt(totalCost)}</strong></td>
                  <td colSpan={5}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

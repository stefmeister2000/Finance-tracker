import { useEffect, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, Product, ProductCostItem, VolumeExample, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { formatCurrency } from '../utils'
import { useCurrency, DISPLAY_RATES, type DisplayCurrency } from '../CurrencyContext'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export const DEFAULT_VAT = 0.05

const COLOR_TAGS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6', '#a855f7']

export function netPrice(p: Product, vatRate = DEFAULT_VAT) {
  return p.vatIncluded ? p.sellingPrice / (1 + vatRate) : p.sellingPrice
}

export function totalCosts(p: Product): number {
  if (p.costItems && p.costItems.length > 0) {
    return p.costItems.reduce((s, c) => s + c.amount, 0)
  }
  return (p.cogs ?? 0) + (p.otherCosts ?? 0)
}

export function totalCharges(p: Product): number {
  return (p.chargeItems ?? []).reduce((s, c) => s + c.amount, 0)
}

export function productMargins(p: Product, vatRate = DEFAULT_VAT) {
  const net = netPrice(p, vatRate)
  const charges = totalCharges(p)
  const revenue = net + charges
  const cost = totalCosts(p)
  const profit = revenue - cost
  const grossMargin = revenue > 0 ? (profit / revenue) * 100 : 0
  return { net, charges, revenue, cost, profit, grossMargin }
}

export default function BusinessToolsPage({ data, ws, setData }: Props) {
  const [tab, setTab] = useState<'vat' | 'margin' | 'volume'>('margin')
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const { toDisplay: displayAmt, curr: displayCurr } = useCurrency()

  const products = ws.products ?? []

  function addProduct() {
    const p: Product = {
      id: uuid(),
      name: 'New Product',
      category: 'Other',
      sellingPrice: 0,
      vatIncluded: false,
      costItems: [],
    }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, products: [...(w.products ?? []), p] })))
  }

  function updateProduct(id: string, updates: Partial<Product>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        products: (w.products ?? []).map((p) => (p.id === id ? { ...p, ...updates } : p)),
      }))
    )
  }

  function removeProduct(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, products: (w.products ?? []).filter((p) => p.id !== id) }))
    )
    if (selectedProductId === id) setSelectedProductId(null)
  }

  function addCostItem(productId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    const newItem: ProductCostItem = { id: uuid(), label: 'COGS', amount: 0 }
    const existing = p.costItems ?? migrateCostItems(p)
    updateProduct(productId, { costItems: [...existing, newItem] })
  }

  function updateCostItem(productId: string, itemId: string, updates: Partial<ProductCostItem>) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    const items = (p.costItems ?? migrateCostItems(p)).map((c) => (c.id === itemId ? { ...c, ...updates } : c))
    updateProduct(productId, { costItems: items })
  }

  function reorderProducts(orderedIds: string[]) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, productOrder: orderedIds })))
  }

  function reorderCategories(orderedCats: string[]) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, categoryOrder: orderedCats })))
  }

  function removeCostItem(productId: string, itemId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    updateProduct(productId, { costItems: (p.costItems ?? []).filter((c) => c.id !== itemId) })
  }

  function addChargeItem(productId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    const newItem: ProductCostItem = { id: uuid(), label: 'Shipping', amount: 0 }
    updateProduct(productId, { chargeItems: [...(p.chargeItems ?? []), newItem] })
  }

  function updateChargeItem(productId: string, itemId: string, updates: Partial<ProductCostItem>) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    updateProduct(productId, { chargeItems: (p.chargeItems ?? []).map((c) => (c.id === itemId ? { ...c, ...updates } : c)) })
  }

  function removeChargeItem(productId: string, itemId: string) {
    const p = products.find((x) => x.id === productId)
    if (!p) return
    updateProduct(productId, { chargeItems: (p.chargeItems ?? []).filter((c) => c.id !== itemId) })
  }

  function duplicateProduct(id: string) {
    const p = products.find((x) => x.id === id)
    if (!p) return
    const copy: Product = { ...p, id: uuid(), name: `${p.name} (copy)` }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, products: [...(w.products ?? []), copy] })))
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? null

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Business Tools</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Calculators for tax, margins, and break-even · {displayCurr === 'EUR' ? 'Prices in EUR' : `1 EUR = ${DISPLAY_RATES[displayCurr as DisplayCurrency] ?? '?'} ${displayCurr}`}</p>
      </div>

      <div className="tabs">
        <button className={tab === 'vat' ? 'active' : ''} onClick={() => setTab('vat')}>🧾 VAT Calculator</button>
        <button className={tab === 'margin' ? 'active' : ''} onClick={() => setTab('margin')}>📊 Profit Margin</button>
        <button className={tab === 'volume' ? 'active' : ''} onClick={() => setTab('volume')}>🎯 Economics</button>
      </div>

      {tab === 'vat' && <VatCalculator ws={ws} setData={setData} />}
      {tab === 'margin' && (
        <MarginCalculator
          ws={ws}
          setData={setData}
          products={products}
          selectedProductId={selectedProductId}
          displayAmt={displayAmt}
          displayCurr={displayCurr}
          onAdd={addProduct}
          onUpdate={updateProduct}
          onRemove={removeProduct}
          onAddCost={addCostItem}
          onUpdateCost={updateCostItem}
          onRemoveCost={removeCostItem}
          onAddCharge={addChargeItem}
          onUpdateCharge={updateChargeItem}
          onRemoveCharge={removeChargeItem}
          onDuplicate={duplicateProduct}
          onSelect={setSelectedProductId}
          onGoToVolume={() => setTab('volume')}
          onReorder={reorderProducts}
          onReorderCategories={reorderCategories}
        />
      )}
      {tab === 'volume' && (
        <VolumeCalculator
          ws={ws}
          setData={setData}
          products={products}
          selectedProduct={selectedProduct}
          displayAmt={displayAmt}
          displayCurr={displayCurr}
          onSelectProduct={setSelectedProductId}
        />
      )}
    </div>
  )
}

// Migrate old cogs/otherCosts flat fields into costItems array
export function migrateCostItems(p: Product): ProductCostItem[] {
  const items: ProductCostItem[] = []
  if ((p.cogs ?? 0) > 0) items.push({ id: uuid(), label: 'Medication / COGS', amount: p.cogs! })
  if ((p.otherCosts ?? 0) > 0) items.push({ id: uuid(), label: 'Other costs', amount: p.otherCosts! })
  return items
}

// ─── VAT Calculator ───────────────────────────────────────────────────────────
function VatCalculator({ ws, setData }: { ws: WorkspaceData; setData: React.Dispatch<React.SetStateAction<AppData>> }) {
  const [mode, setMode] = useState<'ex' | 'inc'>('ex')
  const [amount, setAmount] = useState('')
  const [monthlyRevenue, setMonthlyRevenue] = useState('')
  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('')

  const vatRate = ws.vatRate ?? DEFAULT_VAT
  const vatPct = +(vatRate * 100).toFixed(4)
  const vatPctLabel = Number.isInteger(vatPct) ? `${vatPct}%` : `${vatPct}%`
  const val = parseFloat(amount) || 0
  const exVat = mode === 'ex' ? val : val / (1 + vatRate)
  const vatAmount = exVat * vatRate
  const incVat = exVat + vatAmount
  const monthly = parseFloat(monthlyRevenue) || 0
  const monthlyVat = monthly * vatRate

  const countries = ws.vatCountries ?? []
  const vatProducts = (ws.products ?? []).filter((p) => p.sellingPrice > 0)

  function setRate(rate: number) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, vatRate: rate })))
  }

  function addCountry() {
    const name = newName.trim()
    const rate = parseFloat(newRate)
    if (!name || isNaN(rate) || rate < 0 || rate > 100) return
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w,
      vatCountries: [...(w.vatCountries ?? []), { name, rate: rate / 100 }],
      vatRate: rate / 100,
    })))
    setNewName('')
    setNewRate('')
  }

  function removeCountry(idx: number) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w,
      vatCountries: (w.vatCountries ?? []).filter((_, i) => i !== idx),
    })))
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <h2>VAT Countries</h2>
          <p>Add countries with their VAT rate. Click one to make it the active rate for calculations.</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: countries.length ? 16 : 0 }}>
          {countries.map((c, i) => {
            const pct = +(c.rate * 100).toFixed(4)
            const isActive = Math.abs(c.rate - vatRate) < 0.00001
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, border: isActive ? '2px solid var(--accent)' : '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: isActive ? 'var(--accent)1a' : 'var(--bg-elevated)' }}>
                <button
                  style={{ padding: '6px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--accent)' : 'var(--text)', fontSize: 14 }}
                  onClick={() => setRate(c.rate)}
                >
                  {c.name} · {pct}%
                </button>
                <button
                  style={{ padding: '6px 10px', background: 'transparent', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
                  onClick={() => removeCountry(i)}
                  title="Remove"
                >✕</button>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="table-input"
            placeholder="Country name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCountry() }}
            style={{ width: 160 }}
          />
          <input
            type="number"
            className="table-input"
            placeholder="Rate %"
            min={0}
            max={100}
            step={0.1}
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addCountry() }}
            style={{ width: 90 }}
          />
          <button className="btn secondary small" onClick={addCountry}>+ Add</button>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Active rate: <strong>{vatPctLabel}</strong></span>
          {countries.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>
              e.g. "Belgium" 21% · "Netherlands" 21% · "UAE" 5%
            </span>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Your Product Prices per Country</h2>
          <p>What each of your products costs the customer, and what you keep, in every VAT country you added.</p>
        </div>
        {vatProducts.length === 0 ? (
          <div className="empty-state">No priced products yet — add products with a selling price in the Profit Margin tab.</div>
        ) : countries.length === 0 ? (
          <div className="empty-state">Add at least one VAT country above to see the price breakdown per country.</div>
        ) : (
          <div className="scroll-x">
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ padding: '10px 14px' }}>Product</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px' }}>Your price{vatProducts.some((p) => p.vatIncluded) ? '' : ' (ex-VAT)'}</th>
                  {countries.map((c, i) => (
                    <th key={i} style={{ textAlign: 'right', padding: '10px 14px' }}>{c.name} ({+(c.rate * 100).toFixed(2)}%)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vatProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                      {p.highlighted && <span style={{ color: '#f59e0b', marginRight: 4 }}>★</span>}
                      {p.name}
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{p.vatIncluded ? 'inc. VAT' : 'ex. VAT'}</span>
                    </td>
                    <td className="amount" style={{ padding: '10px 14px' }}>{formatCurrency(p.sellingPrice, ws.currency)}</td>
                    {countries.map((c, i) => {
                      const exVatP = p.vatIncluded ? p.sellingPrice / (1 + c.rate) : p.sellingPrice
                      const totalP = p.vatIncluded ? p.sellingPrice : p.sellingPrice * (1 + c.rate)
                      return (
                        <td key={i} style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(totalP, ws.currency)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>you keep {formatCurrency(exVatP, ws.currency)}</div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <label>Quick check: any {mode === 'ex' ? 'ex-VAT' : 'inc-VAT'} price</label>
            <input type="number" min={0} step={0.01} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className={`btn ${mode === 'ex' ? 'secondary' : 'ghost'} small`} onClick={() => setMode('ex')}>ex-VAT</button>
          <button className={`btn ${mode === 'inc' ? 'secondary' : 'ghost'} small`} onClick={() => setMode('inc')}>inc-VAT</button>
          {val > 0 && (
            <span style={{ fontSize: 13, paddingBottom: 8 }}>
              → Ex-VAT <strong>{formatCurrency(exVat, ws.currency)}</strong> · VAT ({vatPct}%) <strong style={{ color: 'var(--red)' }}>{formatCurrency(vatAmount, ws.currency)}</strong> · Total <strong>{formatCurrency(incVat, ws.currency)}</strong>
            </span>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Quarterly VAT Liability Estimator</h2>
          <p>Enter your average monthly revenue to estimate how much VAT you owe per quarter.</p>
        </div>
        <div style={{ maxWidth: 300 }}>
          <div className="field">
            <label>Monthly Revenue (inc-VAT)</label>
            <input type="number" min={0} step={0.01} placeholder="0.00" value={monthlyRevenue} onChange={(e) => setMonthlyRevenue(e.target.value)} />
          </div>
        </div>
        {monthly > 0 && (
          <div className="stat-grid" style={{ marginTop: 16 }}>
            <div className="stat-card"><div className="label">VAT per Month</div><div className="value negative">{formatCurrency(monthlyVat, ws.currency)}</div></div>
            <div className="stat-card"><div className="label">VAT per Quarter</div><div className="value negative">{formatCurrency(monthlyVat * 3, ws.currency)}</div><div className="sub">due 28 days after quarter end</div></div>
            <div className="stat-card"><div className="label">VAT per Year</div><div className="value negative">{formatCurrency(monthlyVat * 12, ws.currency)}</div></div>
            <div className="stat-card"><div className="label">Revenue (ex-VAT)</div><div className="value positive">{formatCurrency(monthly / (1 + vatRate), ws.currency)}</div><div className="sub">per month</div></div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── DraftCombo: clears on focus so datalist shows all options ───────────────
let _draftComboId = 0
function DraftCombo({ value, suggestions, onChange, style, placeholder }: {
  value: string; suggestions: string[]; onChange: (v: string) => void
  style?: React.CSSProperties; placeholder?: string
}) {
  const [id] = useState(() => `draft-combo-${++_draftComboId}`)
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  return (
    <>
      <input
        list={id}
        className="table-input"
        value={editing ? draft : value}
        placeholder={editing ? (placeholder ?? 'Type or pick…') : undefined}
        onFocus={() => { setEditing(true); setDraft('') }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false)
          const v = draft.trim()
          if (v) onChange(v)
          else setDraft(value)
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        style={style}
      />
      <datalist id={id}>
        {suggestions.map((c) => <option key={c} value={c} />)}
      </datalist>
    </>
  )
}
// Alias kept for category use (commits only on blur/Enter to avoid re-grouping mid-type)
function CategoryCombo(props: Parameters<typeof DraftCombo>[0]) { return <DraftCombo {...props} style={{ fontSize: 12, marginBottom: 8, ...props.style }} placeholder="Type or pick a category…" /> }

// ─── Margin Calculator ────────────────────────────────────────────────────────
interface MarginProps {
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  products: Product[]
  selectedProductId: string | null
  displayAmt: (eur: number) => number
  displayCurr: string
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<Product>) => void
  onRemove: (id: string) => void
  onAddCost: (productId: string) => void
  onUpdateCost: (productId: string, itemId: string, updates: Partial<ProductCostItem>) => void
  onRemoveCost: (productId: string, itemId: string) => void
  onAddCharge: (productId: string) => void
  onUpdateCharge: (productId: string, itemId: string, updates: Partial<ProductCostItem>) => void
  onRemoveCharge: (productId: string, itemId: string) => void
  onSelect: (id: string | null) => void
  onGoToVolume: () => void
  onDuplicate: (id: string) => void
  onReorder: (orderedIds: string[]) => void
  onReorderCategories: (orderedCats: string[]) => void
}

function MarginCalculator({ ws, setData, products, selectedProductId, displayAmt, displayCurr, onAdd, onUpdate, onRemove, onAddCost, onUpdateCost, onRemoveCost, onAddCharge, onUpdateCharge, onRemoveCharge, onDuplicate, onSelect, onGoToVolume, onReorder, onReorderCategories }: MarginProps) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragCat, setDragCat] = useState<string | null>(null)
  const [dragOverCat, setDragOverCat] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  function buildProductsExportText(list: Product[], title: string): string {
    const lines: string[] = []
    lines.push(`# ${title}`)
    lines.push(`Generated ${new Date().toLocaleString()}`)
    lines.push('')

    for (const p of list) {
      const costItems = p.costItems ?? migrateCostItems(p)
      const m = productMargins({ ...p, costItems })
      lines.push(`## ${p.name}${p.highlighted ? ' ★' : ''}`)
      lines.push(`- Category: ${p.category || 'Other'}`)
      lines.push(`- Selling price: ${formatCurrency(p.sellingPrice, ws.currency)}/month${p.vatIncluded ? ' (incl. VAT)' : ' (excl. VAT)'}`)
      lines.push(`- Net price (ex-VAT): ${formatCurrency(m.net, ws.currency)}`)
      if (costItems.length > 0) {
        lines.push('- Cost breakdown:')
        for (const item of costItems) {
          lines.push(`  - ${item.label}: ${formatCurrency(item.amount, ws.currency)}`)
        }
      }
      lines.push(`- Total costs: ${formatCurrency(m.cost, ws.currency)}`)
      lines.push(`- Net profit: ${formatCurrency(m.profit, ws.currency)}`)
      lines.push(`- Gross margin: ${m.grossMargin.toFixed(1)}%`)
      lines.push('')
    }

    lines.push(`Total products: ${list.length}`)
    const avgMargin = list.length > 0
      ? list.reduce((s, p) => s + productMargins({ ...p, costItems: p.costItems ?? migrateCostItems(p) }).grossMargin, 0) / list.length
      : 0
    lines.push(`Average gross margin: ${avgMargin.toFixed(1)}%`)
    lines.push('')
    lines.push('Question for AI: based on these numbers, which products are strongest/weakest economically, and what would you change to improve margins or pricing?')
    return lines.join('\n')
  }

  async function copyProductsExport(list: Product[], title: string) {
    const text = buildProductsExportText(list, title)
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(`Copied "${title}" to clipboard ✓`)
    } catch {
      setCopyStatus('Could not copy — try the download button instead')
    }
    setTimeout(() => setCopyStatus(null), 3000)
  }

  function downloadProductsExport(list: Product[], title: string) {
    const text = buildProductsExportText(list, title)
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Apply stored order from ws.productOrder
  const order = ws.productOrder ?? []
  const orderedProducts = [...products].sort((a, b) => {
    const ai = order.indexOf(a.id)
    const bi = order.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const ids = orderedProducts.map((p) => p.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    onReorder(ids)
    setDragId(null)
    setDragOverId(null)
  }

  const grouped = new Map<string, Product[]>()
  for (const p of orderedProducts) {
    const cat = p.category || 'Other'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(p)
  }
  // Highlighted products float to the top of their category, otherwise keep the existing (drag) order.
  for (const [cat, list] of grouped) {
    grouped.set(cat, [...list].sort((a, b) => (b.highlighted ? 1 : 0) - (a.highlighted ? 1 : 0)))
  }
  // Apply stored category order, append any new categories at the end
  const catOrder = ws.categoryOrder ?? []
  const allCats = Array.from(grouped.keys())
  const allGroups = [
    ...catOrder.filter((c) => grouped.has(c)),
    ...allCats.filter((c) => !catOrder.includes(c)).sort(),
  ].map((cat) => [cat, grouped.get(cat)!] as [string, Product[]])

  const hiddenCats = new Set(ws.hiddenProductCategories ?? [])
  const groups = allGroups.filter(([cat]) => !hiddenCats.has(cat))
  const hiddenGroups = allGroups.filter(([cat]) => hiddenCats.has(cat))
  const visibleProducts = groups.flatMap(([, groupProducts]) => groupProducts)

  function toggleCategoryHidden(cat: string, hide: boolean) {
    setData((prev) => updateActiveWorkspace(prev, (w) => {
      const current = new Set(w.hiddenProductCategories ?? [])
      if (hide) current.add(cat)
      else current.delete(cat)
      return { ...w, hiddenProductCategories: Array.from(current) }
    }))
  }

  function handleCatDrop(targetCat: string) {
    // Product card dropped onto a category header → reassign category
    if (dragId) {
      const p = products.find((x) => x.id === dragId)
      if (p && p.category !== targetCat) {
        onUpdate(dragId, { category: targetCat })
      }
      setDragId(null); setDragOverId(null); setDragOverCat(null)
      return
    }
    if (!dragCat || dragCat === targetCat) { setDragCat(null); setDragOverCat(null); return }
    const cats = groups.map(([c]) => c)
    const from = cats.indexOf(dragCat)
    const to = cats.indexOf(targetCat)
    cats.splice(from, 1)
    cats.splice(to, 0, dragCat)
    onReorderCategories(cats)
    setDragCat(null)
    setDragOverCat(null)
  }

  const vatRate = ws.vatRate ?? DEFAULT_VAT

  function renderProductCard(p: Product) {
    const costItems = p.costItems ?? migrateCostItems(p)
    const m = productMargins({ ...p, costItems }, vatRate)
    const isDragging = dragId === p.id
    const isDragOver = dragOverId === p.id
    return (
      <div
        key={p.id}
        draggable
        onDragStart={(e) => { if (dragCat) { e.preventDefault(); return }; setDragId(p.id) }}
        onDragEnd={() => { setDragId(null); setDragOverId(null) }}
        onDragOver={(e) => { e.preventDefault(); if (dragCat) return; setDragOverId(p.id) }}
        onDrop={(e) => { if (dragCat) return; e.stopPropagation(); handleDrop(p.id) }}
        style={{
          border: isDragOver
            ? '2px dashed var(--accent)'
            : p.highlighted ? '2px solid #f59e0b' : p.colorTag ? `2px solid ${p.colorTag}` : '1px solid var(--border)',
          borderRadius: 12,
          background: p.highlighted ? '#f59e0b0c' : p.colorTag ? `${p.colorTag}0c` : 'var(--bg-elevated)',
          boxShadow: p.highlighted ? '0 0 0 1px #f59e0b33' : undefined,
          overflow: 'hidden',
          opacity: isDragging ? 0.4 : 1,
          cursor: 'grab',
          position: 'relative',
          transition: 'opacity 0.15s, border-color 0.15s',
        }}
      >
        {p.highlighted && (
          <div style={{ position: 'absolute', top: 0, right: 0, background: '#f59e0b', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: '0 0 0 8px' }}>
            ★ PRIORITY
          </div>
        )}
        {/* Card header */}
        <div style={{ padding: '14px 16px 10px', display: 'flex', gap: 10, alignItems: 'flex-start', borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              type="text"
              className="table-input"
              value={p.name}
              onChange={(e) => onUpdate(p.id, { name: e.target.value })}
              style={{ fontWeight: 700, fontSize: 15, width: '100%', marginBottom: 6 }}
              placeholder="Product name"
            />
            <CategoryCombo
              value={p.category}
              suggestions={Array.from(new Set(products.map((x) => x.category).filter(Boolean)))}
              onChange={(v) => onUpdate(p.id, { category: v })}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {COLOR_TAGS.map((c) => (
                <button
                  key={c}
                  onClick={() => onUpdate(p.id, { colorTag: p.colorTag === c ? undefined : c })}
                  title={p.colorTag === c ? 'Remove color tag' : 'Tag this product with this color'}
                  style={{
                    width: 16, height: 16, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: p.colorTag === c ? '2px solid var(--text)' : '1px solid var(--border)',
                    padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn ghost small"
              onClick={() => onUpdate(p.id, { highlighted: !p.highlighted })}
              title={p.highlighted ? 'Remove highlight' : 'Highlight as priority product'}
              style={p.highlighted ? { color: '#f59e0b', borderColor: '#f59e0b' } : undefined}
            >
              {p.highlighted ? '★' : '☆'}
            </button>
            <button className="btn ghost small" onClick={() => onDuplicate(p.id)} title="Duplicate product">⧉</button>
            <button className="btn ghost small" onClick={() => onRemove(p.id)} title="Remove product">✕</button>
          </div>
        </div>

        {/* Selling price */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>
              Selling Price / month
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-muted)' }}>{ws.currency}</span>
              <input
                type="number"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={p.sellingPrice || ''}
                onChange={(e) => onUpdate(p.id, { sellingPrice: parseFloat(e.target.value) || 0 })}
                style={{ fontSize: 28, fontWeight: 700, width: 140, border: 'none', background: 'transparent', padding: 0, color: 'var(--text)', outline: 'none', borderBottom: '2px solid var(--border)' }}
              />
              <label style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={p.vatIncluded} onChange={(e) => onUpdate(p.id, { vatIncluded: e.target.checked })} />
                inc. VAT
              </label>
            </div>
            {displayCurr !== ws.currency && p.sellingPrice > 0 && (
              <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 4 }}>
                ≈ {displayCurr} {displayAmt(p.sellingPrice).toFixed(2)}
              </div>
            )}
            {/* VAT country breakdown */}
            {p.sellingPrice > 0 && (ws.vatCountries ?? []).length > 0 && (
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(ws.vatCountries ?? []).map((c, i) => {
                  const pct = +(c.rate * 100).toFixed(4)
                  const exVat = p.vatIncluded ? p.sellingPrice / (1 + c.rate) : p.sellingPrice
                  const total = p.vatIncluded ? p.sellingPrice : p.sellingPrice * (1 + c.rate)
                  const vatAmt = total - exVat
                  return (
                    <div key={i} style={{ fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>{c.name} · {pct}% VAT</span>
                      {p.vatIncluded ? (
                        <>
                          <span>Ex-VAT: <strong>{formatCurrency(displayAmt(exVat), displayCurr)}</strong></span>
                          <span style={{ color: 'var(--red)' }}>VAT: −{formatCurrency(displayAmt(vatAmt), displayCurr)}</span>
                        </>
                      ) : (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>+ VAT: {formatCurrency(displayAmt(vatAmt), displayCurr)}</span>
                          <span>Customer pays: <strong>{formatCurrency(displayAmt(total), displayCurr)}</strong></span>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          {p.sellingPrice > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net (ex-VAT)</div>
              <div style={{ fontWeight: 700 }}>{formatCurrency(displayAmt(m.net), displayCurr)}</div>
            </div>
          )}
        </div>

        {/* Cost items */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
            Cost Breakdown
          </div>
          {costItems.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No costs added yet.</div>
          )}
          {(() => {
            const costSuggestions = Array.from(new Set(
              products.flatMap((x) => (x.costItems ?? []).map((c) => c.label)).filter(Boolean),
            ))
            return costItems.map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <DraftCombo
                value={item.label}
                suggestions={costSuggestions}
                onChange={(v) => onUpdateCost(p.id, item.id, { label: v })}
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Cost label"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', height: 36 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{ws.currency}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={item.amount || ''}
                  onChange={(e) => onUpdateCost(p.id, item.id, { amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: 80, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, outline: 'none', padding: 0 }}
                />
              </div>
              {displayCurr !== ws.currency && item.amount > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>≈ {displayAmt(item.amount).toFixed(0)} {displayCurr}</span>
              )}
              <button className="btn ghost small" onClick={() => onRemoveCost(p.id, item.id)} style={{ flexShrink: 0 }}>✕</button>
            </div>
          ))})()}
          <button className="btn ghost small" onClick={() => onAddCost(p.id)} style={{ marginTop: 2 }}>
            + Add cost
          </button>
        </div>

        {/* Extra charges (revenue items like shipping) */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: '#22c55e08' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--green)' }}>
              Extra Charges (added to revenue)
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>e.g. shipping fee billed to customer</div>
          </div>
          <datalist id={`charge-labels-${p.id}`}>
            {Array.from(new Set(['Shipping', ...products.flatMap((x) => (x.chargeItems ?? []).map((c) => c.label)).filter(Boolean)])).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
          {(p.chargeItems ?? []).map((item) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                list={`charge-labels-${p.id}`}
                className="table-input"
                value={item.label}
                onChange={(e) => onUpdateCharge(p.id, item.id, { label: e.target.value })}
                style={{ flex: 1, minWidth: 0 }}
                placeholder="Charge label"
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0 10px', height: 36 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>{ws.currency}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0.00"
                  value={item.amount || ''}
                  onChange={(e) => onUpdateCharge(p.id, item.id, { amount: parseFloat(e.target.value) || 0 })}
                  style={{ width: 80, border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600, outline: 'none', padding: 0, color: 'var(--green)' }}
                />
              </div>
              {displayCurr !== ws.currency && item.amount > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>≈ {displayAmt(item.amount).toFixed(0)} {displayCurr}</span>
              )}
              <button className="btn ghost small" onClick={() => onRemoveCharge(p.id, item.id)} style={{ flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <button className="btn ghost small" onClick={() => onAddCharge(p.id)} style={{ marginTop: 2, color: 'var(--green)' }}>
            + Add charge
          </button>
          {(p.chargeItems ?? []).length > 0 && m.charges > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              +{formatCurrency(displayAmt(m.charges), displayCurr)} added to revenue
            </div>
          )}
        </div>

        {/* Margin summary */}
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: p.sellingPrice > 0 && m.net > 0 ? 10 : 0 }}>
            {m.charges > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total revenue</div>
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>{formatCurrency(displayAmt(m.revenue), displayCurr)}</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total costs</div>
              <div style={{ fontWeight: 700, color: 'var(--red)' }}>{formatCurrency(displayAmt(m.cost), displayCurr)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net profit</div>
              <div style={{ fontWeight: 700, color: m.profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatCurrency(displayAmt(m.profit), displayCurr)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Margin</div>
              <div style={{ fontWeight: 700, color: m.grossMargin >= 50 ? 'var(--green)' : m.grossMargin >= 20 ? 'var(--text)' : 'var(--red)' }}>
                {p.sellingPrice > 0 ? `${m.grossMargin.toFixed(1)}%` : '—'}
              </div>
            </div>
            <button
              className="btn ghost small"
              onClick={() => { onSelect(p.id); onGoToVolume() }}
              style={{ marginLeft: 'auto', alignSelf: 'center' }}
              title="Analyze this product in Economics"
            >
              → Economics
            </button>
          </div>
          {/* Margin bar */}
          {p.sellingPrice > 0 && m.net > 0 && (
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              {m.cost > 0 && (
                <div style={{ flex: m.cost, background: '#ef4444', minWidth: 4 }} title={`Costs: ${formatCurrency(m.cost, ws.currency)}`} />
              )}
              {m.profit > 0 && (
                <div style={{ flex: m.profit, background: '#22c55e', minWidth: 4 }} title={`Profit: ${formatCurrency(m.profit, ws.currency)}`} />
              )}
              {m.profit < 0 && m.cost > m.net && (
                <div style={{ width: '100%', background: '#ef4444', borderRadius: 4 }} />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const highlightedProducts = orderedProducts.filter((p) => p.highlighted)

  return (
    <div>
      {highlightedProducts.length > 0 && (
        <div className="panel" style={{ border: '2px solid #f59e0b', background: '#f59e0b08' }}>
          <div className="panel-header">
            <h2>★ Highlighted Products</h2>
            <p>Your priority products, pinned here for quick access.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
            {highlightedProducts.map((p) => renderProductCard(p))}
          </div>
        </div>
      )}
      <div className="panel">
        <div className="panel-header">
          <h2>Products</h2>
          <p>Add cost line items per product — medication, doctor fee, ad spend allocation, delivery, etc.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={onAdd}>+ Add Product</button>
            {visibleProducts.length > 0 && (
              <>
                <button className="btn ghost small" onClick={() => copyProductsExport(visibleProducts, 'All Products Economics')}>📋 Export all for AI</button>
                <button className="btn ghost small" onClick={() => downloadProductsExport(visibleProducts, 'All Products Economics')}>⬇ Download all .md</button>
              </>
            )}
          </div>
        </div>
        {copyStatus && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{copyStatus}</div>}
        {products.length === 0 && <div className="empty-state">No products yet — click Add Product to get started.</div>}

        {groups.map(([category, groupProducts]) => (
          <div
            key={category}
            style={{ marginBottom: 32, opacity: dragCat === category ? 0.4 : 1, transition: 'opacity 0.15s' }}
            onDragOver={(e) => { e.preventDefault(); setDragOverCat(category) }}
            onDrop={() => handleCatDrop(category)}
          >
            <div
              draggable
              onDragStart={() => setDragCat(category)}
              onDragEnd={() => { setDragCat(null); setDragOverCat(null) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 8,
                borderBottom: dragOverCat === category && (dragCat !== category || dragId !== null)
                  ? '2px dashed var(--accent)'
                  : '2px solid var(--accent)22',
                cursor: dragId ? 'copy' : 'grab', userSelect: 'none',
                background: dragOverCat === category && dragId ? 'var(--accent-soft)' : undefined,
                borderRadius: dragOverCat === category && dragId ? 6 : undefined,
                padding: dragOverCat === category && dragId ? '4px 8px' : undefined,
              }}
            >
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>⠿</span>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} />
              <span style={{ fontWeight: 700, fontSize: 14 }}>{category}</span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
                {groupProducts.length} product{groupProducts.length !== 1 ? 's' : ''}
              </span>
              <button
                className="btn ghost small"
                onClick={(e) => { e.stopPropagation(); copyProductsExport(groupProducts, `${category} Economics`) }}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
                onDragStart={(e) => e.stopPropagation()}
                title="Copy this category's economics for AI"
              >
                📋 Export
              </button>
              <button
                className="btn ghost small"
                onClick={(e) => { e.stopPropagation(); toggleCategoryHidden(category, true) }}
                onMouseDown={(e) => e.stopPropagation()}
                draggable={false}
                onDragStart={(e) => e.stopPropagation()}
                title="Hide this category for focus"
              >
                🙈 Hide
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
              {groupProducts.map((p) => renderProductCard(p))}
            </div>
          </div>
        ))}

        {hiddenGroups.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px dashed var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Hidden categories ({hiddenGroups.length}) — hidden for focus, not deleted:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {hiddenGroups.map(([category, groupProducts]) => (
                <button
                  key={category}
                  className="btn ghost small"
                  onClick={() => toggleCategoryHidden(category, false)}
                  title="Show this category again"
                >
                  👁 {category} ({groupProducts.length})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Volume & Break-even ──────────────────────────────────────────────────────
interface VolumeProps {
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  products: Product[]
  selectedProduct: Product | null
  displayAmt: (eur: number) => number
  displayCurr: string
  onSelectProduct: (id: string | null) => void
}

const DEFAULT_VOLUME_STEPS = [1, 5, 10, 25, 50, 100]

function volumeStepsFor(breakEvenUnits: number | null, targetUnits: number | null): number[] {
  if (breakEvenUnits) {
    return [
      Math.max(1, Math.round(breakEvenUnits * 0.5)),
      Math.round(breakEvenUnits * 0.75),
      breakEvenUnits,
      Math.round(breakEvenUnits * 1.5),
      Math.round(breakEvenUnits * 2),
      Math.round(breakEvenUnits * 3),
    ]
  }
  if (targetUnits) {
    return [
      Math.max(1, Math.round(targetUnits * 0.5)),
      Math.round(targetUnits * 0.75),
      targetUnits,
      Math.round(targetUnits * 1.5),
      Math.round(targetUnits * 2),
    ]
  }
  return DEFAULT_VOLUME_STEPS
}

function VolumeCalculator({ ws, setData, products, selectedProduct, displayAmt, displayCurr, onSelectProduct }: VolumeProps) {
  const wsTotalFixed = (ws.fixedCosts ?? []).reduce((s, f) => s + f.monthlyCost, 0)
  const [fixedCosts, setFixedCosts] = useState(wsTotalFixed > 0 ? String(wsTotalFixed.toFixed(2)) : '')
  const [adSpend, setAdSpend] = useState('')
  const [targetProfit, setTargetProfit] = useState('')
  const [compareId, setCompareId] = useState<string | null>(null)
  const [cogsOverrides, setCogsOverrides] = useState<Record<string, string>>({})
  const [dailyUnits, setDailyUnits] = useState<Record<string, string>>({})
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  const fixed = parseFloat(fixedCosts) || 0
  const adSpendVal = parseFloat(adSpend) || 0
  const target = parseFloat(targetProfit) || 0
  const overhead = fixed + adSpendVal

  const hiddenCats = new Set(ws.hiddenProductCategories ?? [])
  const validProducts = products.filter((x) => x.sellingPrice > 0 && !hiddenCats.has(x.category || 'Other'))
  const pickerGroups = new Map<string, Product[]>()
  for (const prod of validProducts) {
    const cat = prod.category || 'Other'
    if (!pickerGroups.has(cat)) pickerGroups.set(cat, [])
    pickerGroups.get(cat)!.push(prod)
  }
  const bestMarginId = validProducts.length > 0
    ? validProducts.reduce((best, prod) => productMargins(prod).grossMargin > productMargins(best).grossMargin ? prod : best).id
    : null

  function toggleProduct(id: string) {
    if (selectedProduct?.id === id) {
      onSelectProduct(compareId)
      setCompareId(null)
    } else if (compareId === id) {
      setCompareId(null)
    } else if (!selectedProduct) {
      onSelectProduct(id)
    } else {
      setCompareId(id)
    }
  }

  const compareProduct = compareId ? products.find((x) => x.id === compareId) ?? null : null
  const slots = [selectedProduct, compareProduct].filter((x): x is Product => !!x)

  function blockFor(p: Product) {
    const costItems = p.costItems ?? []
    const baseCogs = costItems.find((c) => /cogs/i.test(c.label))?.amount ?? 0
    const doctorFee = costItems.find((c) => c.label === 'Doctor fee')?.amount ?? 0
    const otherCosts = totalCosts(p) - baseCogs
    const overrideStr = cogsOverrides[p.id]
    const cogs = overrideStr !== undefined && overrideStr !== '' ? parseFloat(overrideStr) || 0 : baseCogs
    const varCost = otherCosts + cogs
    const net = netPrice(p)
    const contributionMargin = net - varCost
    const contributionMarginPct = net > 0 ? (contributionMargin / net) * 100 : 0
    const breakEvenUnits = contributionMargin > 0 && overhead > 0 ? Math.ceil(overhead / contributionMargin) : null
    const breakEvenRevenue = breakEvenUnits !== null ? breakEvenUnits * net : null
    const targetUnits = contributionMargin > 0 && target > 0 ? Math.ceil((overhead + target) / contributionMargin) : null
    const targetRevenue = targetUnits !== null ? targetUnits * net : null
    const volumes = volumeStepsFor(breakEvenUnits, targetUnits)
    return { p, baseCogs, doctorFee, otherCosts, cogs, varCost, net, contributionMargin, contributionMarginPct, breakEvenUnits, breakEvenRevenue, targetUnits, targetRevenue, volumes }
  }

  function renderBlock(b: ReturnType<typeof blockFor>) {
    const { p, baseCogs, doctorFee, otherCosts, cogs, varCost, net, contributionMargin, contributionMarginPct, breakEvenUnits, breakEvenRevenue, targetUnits, targetRevenue, volumes } = b
    return (
      <div key={p.id} style={{ minWidth: 0 }}>
        <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 13, marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong>{p.name}</strong>
          <span>Net price: <strong>{formatCurrency(displayAmt(net), displayCurr)}</strong></span>
          <span>Contribution margin: <strong className={contributionMargin >= 0 ? 'positive' : 'negative'}>{formatCurrency(displayAmt(contributionMargin), displayCurr)} ({contributionMarginPct.toFixed(1)}%)</strong></span>
        </div>

        <div className="field" style={{ maxWidth: 280, marginBottom: 14 }}>
          <label>Cost of Goods per unit ({ws.currency})</label>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder={baseCogs.toFixed(2)}
            value={cogsOverrides[p.id] ?? ''}
            onChange={(e) => setCogsOverrides((prev) => ({ ...prev, [p.id]: e.target.value }))}
          />
          <div style={{ fontSize: 12, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline' }}>
            <span style={{ color: 'var(--text-muted)' }}>Real cost today: <strong>{formatCurrency(displayAmt(baseCogs), displayCurr)}</strong>/unit</span>
            {cogs !== baseCogs && (
              <span style={{ fontWeight: 700, color: cogs < baseCogs ? 'var(--green)' : 'var(--red)' }}>
                {cogs < baseCogs ? '▼ Save' : '▲ +'} {formatCurrency(displayAmt(Math.abs(cogs - baseCogs)), displayCurr)}/unit
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {otherCosts > 0 && `Plus ${formatCurrency(displayAmt(otherCosts), displayCurr)} in other costs (doctor fee, platform fee, etc.) — always unaffected by this field. `}
            Change the number above to test "what if I get bulk/volume pricing" — it never touches the real product data.
          </div>
        </div>

        {net > 0 && (() => {
          const dailyStr = dailyUnits[p.id] ?? ''
          const daily = parseFloat(dailyStr) || 0
          const monthlyUnits = daily * 30
          const monthlyRevenue = monthlyUnits * net
          const monthlyVarCost = monthlyUnits * varCost
          const monthlyCogs = monthlyUnits * cogs
          const monthlyDoctorFee = monthlyUnits * doctorFee
          const monthlyOtherCosts = monthlyVarCost - monthlyCogs - monthlyDoctorFee
          const monthlyProfit = monthlyRevenue - monthlyVarCost - fixed - adSpendVal
          const monthlyMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0

          function saveExample() {
            const example: VolumeExample = {
              id: uuid(),
              label: `${p.name} — ${daily}/day`,
              productId: p.id,
              productName: p.name,
              dailyUnits: daily,
              fixedCosts: fixed,
              adSpend: adSpendVal,
              targetProfit: target,
              cogsOverride: cogsOverrides[p.id] !== undefined && cogsOverrides[p.id] !== '' ? parseFloat(cogsOverrides[p.id]) : undefined,
              createdAt: new Date().toISOString(),
            }
            setData((prev) => updateActiveWorkspace(prev, (w) => ({
              ...w,
              volumeExamples: [...(w.volumeExamples ?? []), example],
            })))
          }

          return (
            <div style={{ padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  Daily Sales → Monthly Projection
                </div>
                {daily > 0 && (
                  <button className="btn ghost small" onClick={saveExample} title="Save this scenario for later">
                    💾 Save as example
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: daily > 0 ? 14 : 0 }}>
                <div className="field" style={{ maxWidth: 160, marginBottom: 0 }}>
                  <label>Units sold per day</label>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="0"
                    value={dailyStr}
                    onChange={(e) => setDailyUnits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', paddingBottom: 10 }}>or</span>
                <div className="field" style={{ maxWidth: 160, marginBottom: 0 }}>
                  <label>Units sold per month</label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="0"
                    value={daily > 0 ? +(daily * 30).toFixed(1) : ''}
                    onChange={(e) => {
                      const mv = parseFloat(e.target.value)
                      setDailyUnits((prev) => ({ ...prev, [p.id]: mv > 0 ? String(+(mv / 30).toFixed(4)) : '' }))
                    }}
                  />
                </div>
              </div>
              {daily > 0 && (
                <>
                  <div className="stat-grid">
                    <div className="stat-card">
                      <div className="label">Monthly Units</div>
                      <div className="value">{monthlyUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      <div className="sub">{daily}/day × 30 days</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Monthly Revenue</div>
                      <div className="value">{formatCurrency(displayAmt(monthlyRevenue), displayCurr)}</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Monthly Net Profit</div>
                      <div className={`value ${monthlyProfit >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(displayAmt(monthlyProfit), displayCurr)}</div>
                      <div className="sub">after variable + fixed + ad spend</div>
                    </div>
                    <div className="stat-card">
                      <div className="label">Net Margin</div>
                      <div className={`value ${monthlyMargin >= 0 ? 'positive' : 'negative'}`}>{monthlyMargin.toFixed(1)}%</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Monthly cost breakdown</div>
                  <div className="stat-grid">
                    {monthlyCogs > 0 && (
                      <div className="stat-card">
                        <div className="label">📦 COGS (medication)</div>
                        <div className="value negative">{formatCurrency(displayAmt(monthlyCogs), displayCurr)}</div>
                        <div className="sub">{formatCurrency(displayAmt(cogs), displayCurr)}/unit × {monthlyUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      </div>
                    )}
                    {monthlyDoctorFee > 0 && (
                      <div className="stat-card">
                        <div className="label">🩺 Doctor Fee</div>
                        <div className="value negative">{formatCurrency(displayAmt(monthlyDoctorFee), displayCurr)}</div>
                        <div className="sub">{formatCurrency(displayAmt(doctorFee), displayCurr)}/unit × {monthlyUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      </div>
                    )}
                    {monthlyOtherCosts > 0 && (
                      <div className="stat-card">
                        <div className="label">Other Costs</div>
                        <div className="value negative">{formatCurrency(displayAmt(monthlyOtherCosts), displayCurr)}</div>
                        <div className="sub">platform fee, delivery, etc.</div>
                      </div>
                    )}
                    {fixed > 0 && (
                      <div className="stat-card">
                        <div className="label">Fixed Costs</div>
                        <div className="value negative">{formatCurrency(displayAmt(fixed), displayCurr)}</div>
                      </div>
                    )}
                    {adSpendVal > 0 && (
                      <div className="stat-card">
                        <div className="label">Ad Spend</div>
                        <div className="value negative">{formatCurrency(displayAmt(adSpendVal), displayCurr)}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {net <= 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Set a selling price for this product to see break-even analysis.</div>
        ) : contributionMargin <= 0 ? (
          <div style={{ padding: '10px 14px', background: '#ef444420', borderRadius: 8, fontSize: 13, color: 'var(--red)' }}>
            ⚠️ Variable cost ({formatCurrency(displayAmt(varCost), displayCurr)}) exceeds selling price ({formatCurrency(displayAmt(net), displayCurr)}) — you lose money on every unit sold.
          </div>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat-card"><div className="label">Contribution Margin</div><div className="value positive">{formatCurrency(displayAmt(contributionMargin), displayCurr)}</div><div className="sub">per unit ({contributionMarginPct.toFixed(1)}%)</div></div>
              {breakEvenUnits !== null && <div className="stat-card"><div className="label">Break-even</div><div className="value">{breakEvenUnits.toLocaleString()} units</div><div className="sub">{formatCurrency(displayAmt(breakEvenRevenue ?? 0), displayCurr)} revenue</div></div>}
              {targetUnits !== null && target > 0 && <div className="stat-card"><div className="label">To hit {formatCurrency(displayAmt(target), displayCurr)} profit</div><div className="value positive">{targetUnits.toLocaleString()} units</div><div className="sub">{formatCurrency(displayAmt(targetRevenue ?? 0), displayCurr)} revenue</div></div>}
              {breakEvenUnits !== null && adSpendVal > 0 && <div className="stat-card"><div className="label">Ad Spend / Unit</div><div className="value">{formatCurrency(displayAmt(adSpendVal / breakEvenUnits), displayCurr)}</div><div className="sub">at break-even</div></div>}
            </div>

            {volumes.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Profit at different volumes (subscriptions/month)
                  {overhead === 0 && ' — no fixed costs or ad spend added, showing variable costs only'}
                </div>
                <div className="scroll-x">
                  <table style={{ fontSize: 14 }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '10px 14px' }}>Units</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Revenue</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Variable costs</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Ad spend</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Fixed costs</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px' }}>Net profit</th>
                        <th style={{ textAlign: 'right', padding: '10px 14px', minWidth: 140 }}>Net margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {volumes.map((units, i) => {
                        const rev = units * net
                        const vc = units * varCost
                        const profit = rev - vc - fixed - adSpendVal
                        const margin = rev > 0 ? (profit / rev) * 100 : 0
                        const isBreakEven = units === breakEvenUnits
                        const isTarget = units === targetUnits
                        const barWidth = Math.min(100, Math.max(0, Math.abs(margin)))
                        return (
                          <tr
                            key={units}
                            style={{
                              fontWeight: isBreakEven ? 700 : 400,
                              background: isBreakEven ? 'var(--accent-soft)' : i % 2 === 1 ? 'var(--bg-soft)' : undefined,
                            }}
                          >
                            <td style={{ padding: '12px 14px' }}>{units.toLocaleString()}{isBreakEven ? ' 🎯' : ''}{isTarget && target > 0 ? ' ⭐' : ''}</td>
                            <td className="amount" style={{ padding: '12px 14px' }}>{formatCurrency(displayAmt(rev), displayCurr)}</td>
                            <td className="amount negative" style={{ padding: '12px 14px' }}>{formatCurrency(displayAmt(vc), displayCurr)}</td>
                            <td className="amount negative" style={{ padding: '12px 14px' }}>{adSpendVal > 0 ? formatCurrency(displayAmt(adSpendVal), displayCurr) : '—'}</td>
                            <td className="amount negative" style={{ padding: '12px 14px' }}>{fixed > 0 ? formatCurrency(displayAmt(fixed), displayCurr) : '—'}</td>
                            <td className={`amount ${profit >= 0 ? 'positive' : 'negative'}`} style={{ padding: '12px 14px' }}>{formatCurrency(displayAmt(profit), displayCurr)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                <div style={{ flex: 1, maxWidth: 60, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${barWidth}%`, background: margin >= 0 ? 'var(--green)' : 'var(--red)', borderRadius: 3 }} />
                                </div>
                                <span className={margin >= 0 ? 'positive' : 'negative'} style={{ fontWeight: 700, minWidth: 50, textAlign: 'right' }}>{margin.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  function buildExportText(): string {
    const lines: string[] = []
    lines.push('# Product Economics Export')
    lines.push(`Generated ${new Date().toLocaleString()}`)
    lines.push('')
    lines.push(`Shared assumptions: Monthly Fixed Costs = ${formatCurrency(fixed, ws.currency)}, Ad Spend Budget = ${formatCurrency(adSpendVal, ws.currency)}, Target Monthly Profit = ${formatCurrency(target, ws.currency)}`)
    lines.push('')

    for (const p of slots) {
      const b = blockFor(p)
      const { baseCogs, doctorFee, otherCosts, cogs, varCost, net, contributionMargin, contributionMarginPct, breakEvenUnits, breakEvenRevenue, targetUnits, targetRevenue } = b
      lines.push(`## ${p.name}`)
      lines.push(`- Category: ${p.category || 'Other'}`)
      lines.push(`- Selling price (net of VAT): ${formatCurrency(net, ws.currency)} / month`)
      lines.push(`- Medication cost per unit — without volume (real/current cost): ${formatCurrency(baseCogs, ws.currency)}`)
      lines.push(`- Medication cost per unit — bulk/at volume (override used in this scenario): ${formatCurrency(cogs, ws.currency)}${cogs !== baseCogs ? ` (${cogs < baseCogs ? 'saves' : 'costs'} ${formatCurrency(Math.abs(cogs - baseCogs), ws.currency)}/unit vs. without volume)` : ' (same as without volume — no bulk discount modeled)'}`)
      if (doctorFee > 0) lines.push(`- Doctor fee: ${formatCurrency(doctorFee, ws.currency)}`)
      const remainingOther = otherCosts - doctorFee
      if (remainingOther > 0) lines.push(`- Other costs (platform fee, delivery, etc.): ${formatCurrency(remainingOther, ws.currency)}`)
      lines.push(`- Total variable cost per unit (using bulk/scenario cost): ${formatCurrency(varCost, ws.currency)}`)
      lines.push(`- Contribution margin: ${formatCurrency(contributionMargin, ws.currency)} (${contributionMarginPct.toFixed(1)}%)`)
      if (breakEvenUnits !== null) {
        lines.push(`- Break-even: ${breakEvenUnits} units/month (${formatCurrency(breakEvenRevenue ?? 0, ws.currency)} revenue)`)
      }
      if (targetUnits !== null && target > 0) {
        lines.push(`- Units needed for ${formatCurrency(target, ws.currency)} target profit: ${targetUnits} units (${formatCurrency(targetRevenue ?? 0, ws.currency)} revenue)`)
      }
      const dailyStr = dailyUnits[p.id] ?? ''
      const daily = parseFloat(dailyStr) || 0
      if (daily > 0) {
        const monthlyUnits = daily * 30
        const monthlyRevenue = monthlyUnits * net
        const monthlyVarCost = monthlyUnits * varCost
        const monthlyProfit = monthlyRevenue - monthlyVarCost - fixed - adSpendVal
        const monthlyMargin = monthlyRevenue > 0 ? (monthlyProfit / monthlyRevenue) * 100 : 0
        lines.push(`- Projection at ${daily} units/day (${monthlyUnits.toFixed(0)} units/month): revenue ${formatCurrency(monthlyRevenue, ws.currency)}, net profit ${formatCurrency(monthlyProfit, ws.currency)} (${monthlyMargin.toFixed(1)}% margin)`)
      }

      // Latest real ad spend logged for this product's category, with the date it was recorded.
      const categoryBudgets = (ws.adCategoryBudgets ?? []).filter((bgt) => bgt.productCategory === p.category)
      if (categoryBudgets.length > 0) {
        const latest = categoryBudgets.slice().sort((a, c) => c.monthId.localeCompare(a.monthId))[0]
        lines.push(`- Latest logged ad spend for "${p.category}" (${latest.monthId}): ${formatCurrency(latest.spend, ws.currency)} spend, ${formatCurrency(latest.revenue, ws.currency)} revenue${latest.leads ? `, ${latest.leads} leads` : ''}`)
      }
      lines.push('')
    }

    lines.push('Question for AI: based on these numbers, how good is this product economically, and what would you change to improve margin or break-even volume?')
    return lines.join('\n')
  }

  async function copyExport() {
    const text = buildExportText()
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('Copied to clipboard ✓')
    } catch {
      setCopyStatus('Could not copy — try the download button instead')
    }
    setTimeout(() => setCopyStatus(null), 3000)
  }

  function downloadExport() {
    const text = buildExportText()
    const blob = new Blob([text], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `product-economics-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="panel">
        <div className="panel-header">
          <h2>Volume &amp; Break-even Calculator</h2>
          <p>Select up to two products to compare side by side, set your fixed costs, ad spend and profit target, and see exactly how many subscriptions you need to sell.</p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Select a product {selectedProduct && !compareProduct ? '(click another to compare)' : ''}
          </div>
          {validProducts.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No products with a price yet — go to Profit Margin tab to add products.</div>
          ) : (
            Array.from(pickerGroups.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([cat, catProducts]) => (
              <div key={cat} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{cat}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {catProducts.map((prod) => {
                    const m = productMargins(prod)
                    const isPrimary = selectedProduct?.id === prod.id
                    const isCompare = compareId === prod.id
                    const isSelected = isPrimary || isCompare
                    const isBestMargin = prod.id === bestMarginId
                    return (
                      <button
                        key={prod.id}
                        onClick={() => toggleProduct(prod.id)}
                        style={{
                          padding: '8px 14px', borderRadius: 8, position: 'relative',
                          border: isPrimary
                            ? '2px solid var(--accent)'
                            : isCompare
                              ? '2px solid #14b8a6'
                              : isBestMargin ? '2px solid var(--green)' : prod.colorTag ? `2px solid ${prod.colorTag}` : '1px solid var(--border)',
                          background: isPrimary ? 'var(--accent-soft)' : isCompare ? '#14b8a622' : isBestMargin ? 'var(--green-soft, #22c55e18)' : prod.colorTag ? `${prod.colorTag}14` : 'var(--bg-elevated)',
                          cursor: 'pointer', fontSize: 13, textAlign: 'left',
                        }}
                      >
                        {isBestMargin && (
                          <span style={{ position: 'absolute', top: -8, right: -6, fontSize: 11, background: 'var(--green)', color: '#fff', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>
                            🏆 best
                          </span>
                        )}
                        <div style={{ fontWeight: 600 }}>
                          {prod.highlighted && <span style={{ color: '#f59e0b', marginRight: 4 }}>★</span>}
                          {prod.name}
                          {isSelected && <span style={{ marginLeft: 6, fontSize: 11, color: isPrimary ? 'var(--accent)' : '#14b8a6' }}>{isPrimary ? 'A' : 'B'}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: isBestMargin ? 'var(--green)' : 'var(--text-muted)', marginTop: 2, fontWeight: isBestMargin ? 600 : 400 }}>
                          {formatCurrency(displayAmt(netPrice(prod)), displayCurr)}/mo · {m.grossMargin.toFixed(0)}% margin
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, maxWidth: 800 }}>
          <div className="field">
            <label>Monthly Fixed Costs ({ws.currency})</label>
            <input type="number" min={0} step={0.01} placeholder="0.00" value={fixedCosts} onChange={(e) => setFixedCosts(e.target.value)} />
          </div>
          <div className="field">
            <label>Ad Spend Budget ({ws.currency})</label>
            <input type="number" min={0} step={0.01} placeholder="0.00" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} />
          </div>
          <div className="field">
            <label>Target Monthly Profit</label>
            <input type="number" min={0} step={0.01} placeholder="0.00" value={targetProfit} onChange={(e) => setTargetProfit(e.target.value)} />
          </div>
        </div>

        {slots.length > 0 ? (
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 32 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn secondary small" onClick={copyExport}>📋 Copy economics for AI</button>
              <button className="btn ghost small" onClick={downloadExport}>⬇ Download .md</button>
              {copyStatus && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{copyStatus}</span>}
            </div>
            {slots.map((p, i) => (
              <div key={p.id} style={i > 0 ? { paddingTop: 24, borderTop: '1px solid var(--border)' } : undefined}>
                {renderBlock(blockFor(p))}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Select a product above to see break-even analysis. Click a second product to compare them underneath.
          </div>
        )}
      </div>

      {/* ── Saved Examples ──────────────────────────────────────────────── */}
      <div className="panel">
        <div className="panel-header">
          <h2>💡 Saved Examples</h2>
          <p>Scenarios you've saved from the calculator above, for revisiting ideas later.</p>
        </div>
        {(ws.volumeExamples ?? []).length === 0 ? (
          <div className="empty-state">No saved examples yet — set up a scenario above and click "Save as example".</div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {(ws.volumeExamples ?? []).slice().reverse().map((ex) => (
              <div
                key={ex.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '12px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ex.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    Fixed: {formatCurrency(displayAmt(ex.fixedCosts), displayCurr)}
                    {ex.adSpend > 0 && ` · Ad spend: ${formatCurrency(displayAmt(ex.adSpend), displayCurr)}`}
                    {ex.targetProfit > 0 && ` · Target: ${formatCurrency(displayAmt(ex.targetProfit), displayCurr)}`}
                    {ex.cogsOverride !== undefined && ` · COGS override: ${formatCurrency(displayAmt(ex.cogsOverride), displayCurr)}`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    Saved {new Date(ex.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <button
                  className="btn secondary small"
                  onClick={() => {
                    onSelectProduct(ex.productId)
                    setCompareId(null)
                    setFixedCosts(ex.fixedCosts ? String(ex.fixedCosts) : '')
                    setAdSpend(ex.adSpend ? String(ex.adSpend) : '')
                    setTargetProfit(ex.targetProfit ? String(ex.targetProfit) : '')
                    setDailyUnits((prev) => ({ ...prev, [ex.productId]: String(ex.dailyUnits) }))
                    if (ex.cogsOverride !== undefined) {
                      setCogsOverrides((prev) => ({ ...prev, [ex.productId]: String(ex.cogsOverride) }))
                    }
                  }}
                >
                  ↻ Load
                </button>
                <button
                  className="btn ghost small danger"
                  onClick={() => setData((prev) => updateActiveWorkspace(prev, (w) => ({
                    ...w,
                    volumeExamples: (w.volumeExamples ?? []).filter((e) => e.id !== ex.id),
                  })))}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

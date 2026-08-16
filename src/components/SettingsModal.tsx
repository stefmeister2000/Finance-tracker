import { useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, EntryType } from '../types'
import { activeWorkspace, defaultData, updateActiveWorkspace } from '../storage'
import { useCurrency, DISPLAY_RATES, type DisplayCurrency } from '../CurrencyContext'
import { EXPORTS, exportOne, exportFullPlan, copyOne, copyFullPlan, exportBvPlan, copyBvPlan } from '../export'

interface Props {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  onClose: () => void
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD']

export default function SettingsModal({ data, setData, onClose }: Props) {
  const [tab, setTab] = useState<'general' | 'cards' | 'categories' | 'bizcats' | 'data'>('general')
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function flashCopy(ok: boolean, what: string) {
    setCopyStatus(ok ? `Copied ${what} — paste into your sheet` : 'Could not copy — use download instead')
    setTimeout(() => setCopyStatus(null), 3000)
  }
  const ws = activeWorkspace(data)
  const { displayCurrency, setDisplayCurrency } = useCurrency()

  // Distinct free-text categories used by products (margins) and startup costs in THIS workspace.
  const productCats = Array.from(new Set((ws.products ?? []).map((p) => p.category || 'Other'))).sort()
  const startupCats = Array.from(new Set((ws.startupCosts ?? []).map((c) => c.category || 'Other'))).sort()

  function renameProductCategory(oldName: string, newName: string) {
    const name = newName.trim()
    if (!name || name === oldName) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        products: (w.products ?? []).map((p) => ((p.category || 'Other') === oldName ? { ...p, category: name } : p)),
        categoryOrder: (w.categoryOrder ?? []).map((c) => (c === oldName ? name : c)),
        hiddenProductCategories: (w.hiddenProductCategories ?? []).map((c) => (c === oldName ? name : c)),
        adCategoryBudgets: (w.adCategoryBudgets ?? []).map((b) => (b.productCategory === oldName ? { ...b, productCategory: name } : b)),
      })),
    )
  }

  function deleteProductCategory(name: string) {
    if (!confirm(`Move all "${name}" products to "Other"?`)) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        products: (w.products ?? []).map((p) => ((p.category || 'Other') === name ? { ...p, category: 'Other' } : p)),
        categoryOrder: (w.categoryOrder ?? []).filter((c) => c !== name),
        hiddenProductCategories: (w.hiddenProductCategories ?? []).filter((c) => c !== name),
      })),
    )
  }

  function renameStartupCategory(oldName: string, newName: string) {
    const name = newName.trim()
    if (!name || name === oldName) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        startupCosts: (w.startupCosts ?? []).map((c) => ((c.category || 'Other') === oldName ? { ...c, category: name } : c)),
      })),
    )
  }

  function deleteStartupCategory(name: string) {
    if (!confirm(`Move all "${name}" startup costs to "Other"?`)) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        startupCosts: (w.startupCosts ?? []).map((c) => ((c.category || 'Other') === name ? { ...c, category: 'Other' } : c)),
      })),
    )
  }

  function updateCard(id: string, field: 'name' | 'color', value: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        cards: w.cards.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
      })),
    )
  }

  function addCard() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        cards: [...w.cards, { id: uuid(), name: 'New Card', color: '#6366f1' }],
      })),
    )
  }

  function removeCard(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, cards: w.cards.filter((c) => c.id !== id) })),
    )
  }

  function updateCategory(id: string, field: 'name' | 'color', value: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        categories: w.categories.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
      })),
    )
  }

  function addCategory(type: EntryType) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        categories: [...w.categories, { id: uuid(), name: 'New Category', type, color: '#64748b' }],
      })),
    )
  }

  function removeCategory(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, categories: w.categories.filter((c) => c.id !== id) })),
    )
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finance-tracker-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as AppData
        if (parsed.workspaces && parsed.workspaces.personal) {
          setData(parsed)
        } else {
          alert('Invalid file format.')
        }
      } catch {
        alert('Could not parse file.')
      }
    }
    reader.readAsText(file)
  }

  function resetAll() {
    if (confirm('This will erase all your data and restore defaults. Continue?')) {
      setData(defaultData())
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 12 }}>
          Editing settings for the <strong>{ws.name}</strong> workspace.
        </p>
        <div className="tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
            General
          </button>
          <button className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')}>
            Bank Cards
          </button>
          <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>
            Categories
          </button>
          {ws.kind === 'business' && (
            <button className={tab === 'bizcats' ? 'active' : ''} onClick={() => setTab('bizcats')}>
              Product Categories
            </button>
          )}
          <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>
            Data &amp; Backup
          </button>
        </div>

        {tab === 'general' && (
          <div>
            <div className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
              <label>Your Name</label>
              <input
                type="text"
                value={data.userName}
                onChange={(e) => setData((prev) => ({ ...prev, userName: e.target.value }))}
                placeholder="e.g. Sajibur"
              />
            </div>
            <div className="field" style={{ maxWidth: 260, marginTop: 16 }}>
              <label>Workspace Name</label>
              <input
                type="text"
                value={ws.name}
                onChange={(e) => setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, name: e.target.value })))}
              />
            </div>
            <div className="field" style={{ maxWidth: 200, marginTop: 16 }}>
              <label>Display Currency</label>
              <select
                value={displayCurrency}
                onChange={(e) => setDisplayCurrency(e.target.value as DisplayCurrency)}
              >
                {(Object.keys(DISPLAY_RATES) as DisplayCurrency[]).map((c) => (
                  <option key={c} value={c}>
                    {c}{c !== 'EUR' ? ` (1 EUR = ${DISPLAY_RATES[c]} ${c})` : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                How amounts are shown across the whole app. Data stays stored in EUR.
              </div>
            </div>
            <div className="field" style={{ maxWidth: 200, marginTop: 16 }}>
              <label>Currency ({ws.name} workspace)</label>
              <select
                value={ws.currency}
                onChange={(e) => setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, currency: e.target.value })))}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {tab === 'cards' && (
          <div>
            <div className="settings-list">
              {ws.cards.map((c) => (
                <div className="settings-row" key={c.id}>
                  <input type="color" value={c.color} onChange={(e) => updateCard(c.id, 'color', e.target.value)} />
                  <input type="text" value={c.name} onChange={(e) => updateCard(c.id, 'name', e.target.value)} />
                  <button className="btn ghost small" onClick={() => removeCard(c.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button className="btn secondary small" onClick={addCard}>
              + Add Bank Card
            </button>
          </div>
        )}

        {tab === 'categories' && (
          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Income Categories</h3>
            <div className="settings-list">
              {ws.categories
                .filter((c) => c.type === 'income')
                .map((c) => (
                  <div className="settings-row" key={c.id}>
                    <input type="color" value={c.color} onChange={(e) => updateCategory(c.id, 'color', e.target.value)} />
                    <input type="text" value={c.name} onChange={(e) => updateCategory(c.id, 'name', e.target.value)} />
                    <button className="btn ghost small" onClick={() => removeCategory(c.id)}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
            <button className="btn secondary small" onClick={() => addCategory('income')}>
              + Add Income Category
            </button>

            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 20 }}>
              Expense Categories
            </h3>
            <div className="settings-list">
              {ws.categories
                .filter((c) => c.type === 'expense')
                .map((c) => (
                  <div className="settings-row" key={c.id}>
                    <input type="color" value={c.color} onChange={(e) => updateCategory(c.id, 'color', e.target.value)} />
                    <input type="text" value={c.name} onChange={(e) => updateCategory(c.id, 'name', e.target.value)} />
                    <button className="btn ghost small" onClick={() => removeCategory(c.id)}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
            <button className="btn secondary small" onClick={() => addCategory('expense')}>
              + Add Expense Category
            </button>

            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 20 }}>
              Transfer / Ignored Categories
            </h3>
            <div className="settings-list">
              {ws.categories
                .filter((c) => c.type === 'ignore')
                .map((c) => (
                  <div className="settings-row" key={c.id}>
                    <input type="color" value={c.color} onChange={(e) => updateCategory(c.id, 'color', e.target.value)} />
                    <input type="text" value={c.name} onChange={(e) => updateCategory(c.id, 'name', e.target.value)} />
                    <button className="btn ghost small" onClick={() => removeCategory(c.id)}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
            <button className="btn secondary small" onClick={() => addCategory('ignore')}>
              + Add Transfer Category
            </button>
          </div>
        )}

        {tab === 'bizcats' && (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              These are the free-text categories used in this workspace only — they never appear in your other businesses.
              Renaming updates every item using the category; deleting moves items to "Other".
            </p>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Product / Margin Categories</h3>
            {productCats.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No products yet.</div>}
            <div className="settings-list">
              {productCats.map((cat) => (
                <div className="settings-row" key={cat}>
                  <input
                    type="text"
                    defaultValue={cat}
                    onBlur={(e) => renameProductCategory(cat, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {(ws.products ?? []).filter((p) => (p.category || 'Other') === cat).length} products
                  </span>
                  {cat !== 'Other' && (
                    <button className="btn ghost small" onClick={() => deleteProductCategory(cat)}>✕</button>
                  )}
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 20 }}>Startup Cost Categories</h3>
            {startupCats.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>No startup costs yet.</div>}
            <div className="settings-list">
              {startupCats.map((cat) => (
                <div className="settings-row" key={cat}>
                  <input
                    type="text"
                    defaultValue={cat}
                    onBlur={(e) => renameStartupCategory(cat, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {(ws.startupCosts ?? []).filter((c) => (c.category || 'Other') === cat).length} items
                  </span>
                  {cat !== 'Other' && (
                    <button className="btn ghost small" onClick={() => deleteStartupCategory(cat)}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'data' && (
          <div>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Backup</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Your data is saved automatically to this browser's storage. Export a backup regularly so you never lose
              it &mdash; the export includes both your Personal and Business workspaces.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8, marginBottom: 20 }}>
              <button className="btn secondary" onClick={exportData}>
                Export Data (JSON)
              </button>
              <button className="btn secondary" onClick={() => fileInputRef.current?.click()}>
                Import Data
              </button>
              <input ref={fileInputRef} type="file" accept="application/json" hidden onChange={importData} />
            </div>

            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Export — {ws.name}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Your finance planning for the accountant. <strong>Copy</strong> pastes straight into a spreadsheet (each value in its own cell); <strong>Download</strong> saves a CSV.
            </p>
            <div style={{ padding: '10px 12px', border: '1px solid var(--accent)', borderRadius: 8, background: 'var(--accent-soft)', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>BV financial plan (for incorporation)</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                The curated financial plan a notary/accountant needs to set up the BV — assumptions, financing &amp; shareholders, startup costs, use of funds, projected P&amp;L (Year 1 &amp; 2, base + downside) and 24-month cash flow. Operational data is left out.
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn accent small" onClick={async () => flashCopy(await copyBvPlan(ws), 'the BV financial plan')}>⧉ Copy BV plan</button>
                <button className="btn secondary small" onClick={() => exportBvPlan(ws)}>⬇ Download BV plan (CSV)</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
              <button className="btn secondary" onClick={async () => flashCopy(await copyFullPlan(ws), 'the full finance plan')}>⧉ Copy everything</button>
              <button className="btn secondary" onClick={() => exportFullPlan(ws)}>⬇ Download everything (CSV)</button>
            </div>
            {copyStatus && <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 10 }}>{copyStatus}</div>}
            <div style={{ display: 'grid', gap: 4, marginTop: 8, marginBottom: 20 }}>
              {EXPORTS.map((e) => {
                const available = e.has(ws)
                return (
                  <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: available ? 1 : 0.45 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{e.label}</span>
                    <button className="btn ghost small" disabled={!available} title="Copy to paste into a spreadsheet"
                      onClick={async () => flashCopy(await copyOne(ws, e), e.label)}>⧉ Copy</button>
                    <button className="btn ghost small" disabled={!available} title="Download as CSV"
                      onClick={() => exportOne(ws, e)}>⬇ CSV</button>
                  </div>
                )
              })}
            </div>

            <h3 style={{ fontSize: 13, color: 'var(--red)', textTransform: 'uppercase' }}>Danger Zone</h3>
            <button className="btn danger" onClick={resetAll} style={{ marginTop: 8 }}>
              Reset All Data
            </button>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

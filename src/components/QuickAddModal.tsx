import { useMemo, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { detectSubscriptions, formatCurrency } from '../utils'
import CategoryTag from './CategoryTag'

interface Props {
  ws: WorkspaceData
  monthId: string
  setData: React.Dispatch<React.SetStateAction<AppData>>
  onClose: () => void
}

interface QuickItem {
  id: string
  section: 'subscription' | 'fixedcost'
  description: string
  amount: number
  categoryId?: string
  cardId?: string
  alreadyAdded: boolean
}

export default function QuickAddModal({ ws, monthId, setData, onClose }: Props) {
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const defaultCardId = ws.cards[0]?.id ?? ''
  const defaultExpenseCatId = ws.categories.find((c) => c.type === 'expense')?.id ?? ''

  const existingDescs = useMemo(() => {
    const month = ws.months[monthId]
    return new Set((month?.transactions ?? []).map((t) => t.description.toLowerCase().trim()))
  }, [ws, monthId])

  // Build items from manual subscriptions
  const subItems: QuickItem[] = (ws.manualSubscriptions ?? []).map((s) => ({
    id: `sub-${s.id}`,
    section: 'subscription',
    description: s.description,
    amount: s.monthlyCost,
    categoryId: s.categoryId || defaultExpenseCatId,
    cardId: s.cardId || defaultCardId,
    alreadyAdded: existingDescs.has(s.description.toLowerCase().trim()),
  }))

  // Also include auto-detected subscriptions not in manualSubscriptions
  const detected = useMemo(() => detectSubscriptions(ws), [ws])
  const manualDescs = new Set((ws.manualSubscriptions ?? []).map((s) => s.description.toLowerCase()))
  const detectedItems: QuickItem[] = detected
    .filter((d) => !manualDescs.has(d.description.toLowerCase()))
    .map((d) => ({
      id: `det-${d.key}`,
      section: 'subscription',
      description: d.description,
      amount: d.monthlyEstimate,
      categoryId: d.categoryId || defaultExpenseCatId,
      cardId: d.cardId || defaultCardId,
      alreadyAdded: existingDescs.has(d.description.toLowerCase().trim()),
    }))

  // Fixed costs
  const fixedItems: QuickItem[] = (ws.fixedCosts ?? []).map((f) => {
    const cat = ws.categories.find(
      (c) => c.type === 'expense' && c.name.toLowerCase() === f.category.toLowerCase(),
    )
    return {
      id: `fc-${f.id}`,
      section: 'fixedcost',
      description: f.name,
      amount: f.monthlyCost,
      categoryId: cat?.id ?? defaultExpenseCatId,
      cardId: defaultCardId,
      alreadyAdded: existingDescs.has(f.name.toLowerCase().trim()),
    }
  })

  const allItems = [...subItems, ...detectedItems, ...fixedItems]
  const addable = allItems.filter((i) => !i.alreadyAdded)

  const [selected, setSelected] = useState<Set<string>>(
    new Set(addable.map((i) => i.id)),
  )

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === addable.length) setSelected(new Set())
    else setSelected(new Set(addable.map((i) => i.id)))
  }

  function addSelected() {
    const toAdd = allItems.filter((i) => selected.has(i.id) && !i.alreadyAdded)
    if (toAdd.length === 0) return
    const dateStr = `${monthId}-01`
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const month = w.months[monthId] ?? { id: monthId, transactions: [] }
        const newTxs = toAdd.map((item) => ({
          id: uuid(),
          date: dateStr,
          description: item.description,
          amount: item.amount,
          type: 'expense' as const,
          categoryId: item.categoryId ?? defaultExpenseCatId,
          cardId: item.cardId ?? defaultCardId,
        }))
        return {
          ...w,
          months: {
            ...w.months,
            [monthId]: { ...month, transactions: [...month.transactions, ...newTxs] },
          },
        }
      }),
    )
    onClose()
  }

  const selectedCount = selected.size

  function Section({ title, items }: { title: string; items: QuickItem[] }) {
    if (items.length === 0) return null
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 8 }}>
          {title}
        </div>
        <table style={{ width: '100%' }}>
          <tbody>
            {items.map((item) => {
              const cat = item.categoryId ? categoryById.get(item.categoryId) : undefined
              return (
                <tr
                  key={item.id}
                  style={{
                    opacity: item.alreadyAdded ? 0.45 : 1,
                    cursor: item.alreadyAdded ? 'default' : 'pointer',
                  }}
                  onClick={() => !item.alreadyAdded && toggle(item.id)}
                >
                  <td style={{ width: 32, paddingRight: 8 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      disabled={item.alreadyAdded}
                      onChange={() => toggle(item.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td style={{ flex: 1, fontSize: 14 }}>
                    {item.description}
                    {item.alreadyAdded && (
                      <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>already in month</span>
                    )}
                  </td>
                  <td style={{ paddingLeft: 12, paddingRight: 12 }}>
                    {cat ? <CategoryTag category={cat} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                  </td>
                  <td className="amount negative" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 90 }}>
                    {formatCurrency(item.amount, ws.currency)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  const totalSelected = allItems.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.amount, 0)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, width: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Quick Add to {monthId}</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '0 24px 8px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-muted)' }}>
            Select subscriptions and fixed costs to add as expense transactions for this month.
          </p>

          {allItems.length === 0 ? (
            <div className="empty-state">
              No subscriptions or fixed costs set up yet. Add them in the Subscriptions or Fixed Costs pages first.
            </div>
          ) : (
            <>
              {addable.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <button className="btn ghost small" onClick={toggleAll}>
                    {selected.size === addable.length ? 'Deselect all' : 'Select all'}
                  </button>
                  {selectedCount > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {selectedCount} selected · {formatCurrency(totalSelected, ws.currency)}
                    </span>
                  )}
                </div>
              )}
              <Section title={`Subscriptions (${[...subItems, ...detectedItems].length})`} items={[...subItems, ...detectedItems]} />
              <Section title={`Fixed Costs (${fixedItems.length})`} items={fixedItems} />
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn accent" disabled={selectedCount === 0} onClick={addSelected}>
            Add {selectedCount > 0 ? `${selectedCount} item${selectedCount > 1 ? 's' : ''}` : ''}
            {selectedCount > 0 && ` · ${formatCurrency(totalSelected, ws.currency)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

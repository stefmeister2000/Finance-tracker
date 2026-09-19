import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, ManualSubscription, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { cleanDescription, descriptionBadge, detectSubscriptions, formatCurrency, type SubscriptionInfo } from '../utils'
import { normalizeDescription } from '../categorize'
import CategoryTag from './CategoryTag'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

function DescriptionCell({ description }: { description: string }) {
  const badge = descriptionBadge(description)
  return (
    <>
      {cleanDescription(description)}
      {badge && (
        <span className="tag" style={{ marginLeft: 6, background: badge.bg, color: badge.color, fontWeight: 600 }}>
          {badge.label}
        </span>
      )}
    </>
  )
}

export default function SubscriptionsPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const subscriptions = detectSubscriptions(ws).filter((s) => s.flaggedRecurring)
  const manualSubs = ws.manualSubscriptions ?? []
  const [search, setSearch] = useState('')
  const [account, setAccount] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [newCategory, setNewCategory] = useState(ws.categories.find(c => c.type === 'expense')?.id ?? '')
  const [newCard, setNewCard] = useState(ws.cards[0]?.id ?? '')
  const flagged = new Set(ws.flaggedSubscriptions ?? [])
  const matches = (description: string, cardId: string, key: string) =>
    cleanDescription(description).toLowerCase().includes(search.trim().toLowerCase()) &&
    (!account || cardId === account) && (!reviewOnly || flagged.has(key))
  const visibleManual = manualSubs.filter(s => matches(s.description, s.cardId, `manual-${s.id}`))
  const visibleLinked = subscriptions.filter(s => matches(s.description, s.cardId, s.key))

  const monthlyTotal =
    subscriptions.filter((s) => s.flaggedRecurring).reduce((s, sub) => s + sub.monthlyEstimate, 0) +
    manualSubs.reduce((s, sub) => s + sub.monthlyCost, 0)
  const annualTotal = monthlyTotal * 12

  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const cardById = new Map(ws.cards.map((c) => [c.id, c]))

  // Build category breakdown across confirmed + manual subs
  const categoryTotals = new Map<string, number>()
  for (const sub of subscriptions.filter((s) => s.flaggedRecurring)) {
    categoryTotals.set(sub.categoryId, (categoryTotals.get(sub.categoryId) ?? 0) + sub.monthlyEstimate)
  }
  for (const sub of manualSubs) {
    categoryTotals.set(sub.categoryId, (categoryTotals.get(sub.categoryId) ?? 0) + sub.monthlyCost)
  }
  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([id, monthly]) => ({ category: categoryById.get(id), monthly }))
    .filter((e) => e.category)
    .sort((a, b) => b.monthly - a.monthly) as { category: NonNullable<ReturnType<typeof categoryById.get>>; monthly: number }[]

  function ignoreSubscription(key: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        months: Object.fromEntries(
          Object.entries(w.months).map(([id, month]) => [
            id,
            {
              ...month,
              transactions: month.transactions.map((t) => {
                const tKey = `${normalizeDescription(t.description)}|${t.cardId}`
                return tKey === key ? { ...t, ignoreSubscription: true, recurring: false } : t
              }),
            },
          ]),
        ),
      })),
    )
  }

  function setSubscriptionPrice(key: string, monthly: number | null) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const overrides = { ...(w.subscriptionOverrides ?? {}) }
        if (monthly === null) {
          delete overrides[key]
        } else {
          overrides[key] = monthly
        }
        return { ...w, subscriptionOverrides: overrides }
      }),
    )
  }

  function addManualSubscription() {
    if (!name.trim() || !cost.trim() || !Number.isFinite(Number(cost)) || Number(cost) < 0) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        manualSubscriptions: [
          ...(w.manualSubscriptions ?? []),
          {
            id: uuid(),
            description: name.trim(),
            categoryId: newCategory,
            cardId: newCard,
            monthlyCost: Number(cost),
          },
        ],
      })),
    )
    setAdding(false)
    setName('')
    setCost('')
  }

  function updateManualSubscription(id: string, updates: Partial<ManualSubscription>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        manualSubscriptions: (w.manualSubscriptions ?? []).map((s) => (s.id === id ? { ...s, ...updates } : s)),
      })),
    )
  }

  function toggleFlagSub(key: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const cur = new Set(w.flaggedSubscriptions ?? [])
        if (cur.has(key)) cur.delete(key)
        else cur.add(key)
        return { ...w, flaggedSubscriptions: Array.from(cur) }
      }),
    )
  }

  function removeManualSubscription(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        manualSubscriptions: (w.manualSubscriptions ?? []).filter((s) => s.id !== id),
      })),
    )
  }

  return (
    <div className="subscriptions-page">
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Subscriptions</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Saved subscriptions</div>
          <div className="value">{subscriptions.filter((s) => s.flaggedRecurring).length + manualSubs.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Monthly total</div>
          <div className="value negative">{fmt(monthlyTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Annual estimate</div>
          <div className="value negative">{fmt(annualTotal)}</div>
        </div>
      </div>


      <div className="panel">
        <div className="panel-header">
          <h2>Your subscriptions <span className="drive-muted">({manualSubs.length + subscriptions.length})</span></h2>
          <p>Only items you add or confirm. Click an amount to edit it.</p>
          <button className="btn primary small" onClick={() => setAdding(!adding)}>
            + Add Subscription
          </button>
        </div>
        {adding && <form className="subscription-add" onSubmit={e => { e.preventDefault(); addManualSubscription() }}>
          <label>Name<input autoFocus required value={name} placeholder="e.g. Spotify" onChange={e => setName(e.target.value)} /></label>
          <label>Monthly cost<input required type="number" min="0" step="0.01" value={cost} placeholder="0.00" onChange={e => setCost(e.target.value)} /></label>
          <label>Category<select value={newCategory} onChange={e => setNewCategory(e.target.value)}><option value="">Uncategorised</option>{ws.categories.filter(c => c.type === 'expense').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Account<select value={newCard} onChange={e => setNewCard(e.target.value)}><option value="">No account</option>{ws.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <button className="btn primary" type="submit">Save subscription</button>
          <button className="btn ghost" type="button" onClick={() => setAdding(false)}>Cancel</button>
        </form>}
        <div className="subscription-filters">
          <input aria-label="Search subscriptions" placeholder="Search subscriptions…" value={search} onChange={e => setSearch(e.target.value)} />
          <select aria-label="Filter by account" value={account} onChange={e => setAccount(e.target.value)}><option value="">All accounts</option>{ws.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className={`btn ${reviewOnly ? 'secondary' : 'ghost'} small`} aria-pressed={reviewOnly} onClick={() => setReviewOnly(!reviewOnly)}>Needs review</button>
          <span className="drive-muted">{visibleManual.length + visibleLinked.length} shown</span>
        </div>
        <UnifiedSubscriptionTable
          manualSubs={visibleManual}
          subscriptions={visibleLinked}
          categories={ws.categories.filter((c) => c.type === 'expense')}
          cards={ws.cards}
          categoryById={categoryById}
          cardById={cardById}
          currency={curr}
          onUpdateManual={updateManualSubscription}
          onRemoveManual={removeManualSubscription}
          onUnconfirm={(key) => ignoreSubscription(key)}
          onSetPrice={setSubscriptionPrice}
          flaggedKeys={new Set(ws.flaggedSubscriptions ?? [])}
          onToggleFlag={toggleFlagSub}
        />
      </div>
      {categoryBreakdown.length > 0 && (
        <details className="panel subscription-breakdown">
          <summary>Spending by category <span>View monthly and annual totals</span></summary>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Monthly</th>
                  <th style={{ textAlign: 'right' }}>Annual</th>
                  <th style={{ textAlign: 'right' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {categoryBreakdown.map(({ category, monthly }) => (
                  <tr key={category.id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: category.color + '22',
                          color: category.color,
                          fontWeight: 500,
                          fontSize: 13,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: category.color, flexShrink: 0 }} />
                        {category.name}
                      </span>
                    </td>
                    <td className="amount negative">{fmt(monthly)}</td>
                    <td className="amount negative">{fmt(monthly * 12)}</td>
                    <td className="amount" style={{ color: 'var(--text-muted)' }}>
                      {monthlyTotal > 0 ? `${((monthly / monthlyTotal) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="amount negative"><strong>{fmt(monthlyTotal)}</strong></td>
                  <td className="amount negative"><strong>{fmt(annualTotal)}</strong></td>
                  <td className="amount">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      )}

    </div>
  )
}

function UnifiedSubscriptionTable({
  manualSubs,
  subscriptions,
  categories,
  cards,
  categoryById,
  cardById,
  currency,
  onUpdateManual,
  onRemoveManual,
  onUnconfirm,
  onSetPrice,
  flaggedKeys,
  onToggleFlag,
}: {
  manualSubs: ManualSubscription[]
  subscriptions: SubscriptionInfo[]
  categories: WorkspaceData['categories']
  cards: WorkspaceData['cards']
  categoryById: Map<string, WorkspaceData['categories'][number]>
  cardById: Map<string, WorkspaceData['cards'][number]>
  currency: string
  onUpdateManual: (id: string, updates: Partial<ManualSubscription>) => void
  onRemoveManual: (id: string) => void
  onUnconfirm: (key: string) => void
  onSetPrice: (key: string, monthly: number | null) => void
  flaggedKeys: Set<string>
  onToggleFlag: (key: string) => void
}) {
  const flagBtn = (key: string) => {
    const on = flaggedKeys.has(key)
    return (
      <button className="btn ghost small" aria-pressed={on} title={on ? 'Mark as reviewed' : 'Mark for review'}
        onClick={() => onToggleFlag(key)} style={on ? { color: '#f59e0b', borderColor: '#f59e0b' } : undefined}>
        {on ? 'Review needed' : 'Review'}
      </button>
    )
  }
  const { fmt, curr } = useCurrency()
  const confirmed = subscriptions.filter((s) => s.flaggedRecurring)

  if (manualSubs.length === 0 && confirmed.length === 0) {
    return <div className="empty-state">No subscriptions to show. Add a subscription or adjust your filters.</div>
  }

  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Subscription</th>
            <th>Category</th>
            <th>Account</th>
            <th style={{ textAlign: 'right' }}>Monthly</th>
            <th style={{ textAlign: 'right' }}>Annual</th>
            <th style={{ textAlign: 'right' }}>Manage</th>
          </tr>
        </thead>
        <tbody>
          {manualSubs.map((s) => {
            const cat = categoryById.get(s.categoryId)
            const card = cardById.get(s.cardId)
            const mKey = `manual-${s.id}`
            return (
              <tr key={mKey} style={flaggedKeys.has(mKey) ? { background: '#f59e0b12' } : undefined}>
                <td>
                  <EditableText value={s.description} onChange={(value) => onUpdateManual(s.id, { description: value })} />
                </td>
                <td>
                  <EditableSelect
                    value={s.categoryId}
                    options={categories.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
                    display={cat && <CategoryTag category={cat} />}
                    onChange={(value) => onUpdateManual(s.id, { categoryId: value })}
                  />
                </td>
                <td>
                  <EditableSelect
                    value={s.cardId}
                    options={cards.map((c) => ({ value: c.id, label: c.name }))}
                    display={card?.name ?? '—'}
                    onChange={(value) => onUpdateManual(s.id, { cardId: value })}
                  />
                </td>
                <td className="amount negative">
                  <EditableAmount
                    value={s.monthlyCost}
                    currency={currency}
                    onChange={(value) => onUpdateManual(s.id, { monthlyCost: value })}
                  />
                </td>
                <td className="amount negative">{fmt(s.monthlyCost * 12)}</td>
                <td className="actions">
                  {flagBtn(mKey)}
                  <button className="btn ghost small" onClick={() => onRemoveManual(s.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}

          {confirmed.map((s) => {
            const cat = categoryById.get(s.categoryId)
            const card = cardById.get(s.cardId)
            return (
              <tr key={`confirmed-${s.key}`} style={flaggedKeys.has(s.key) ? { background: '#f59e0b12' } : undefined}>
                <td><DescriptionCell description={s.description} /></td>
                <td>{cat && <CategoryTag category={cat} />}</td>
                <td>{card?.name ?? '—'}</td>
                <td className="amount negative">
                  <EditableAmount
                    value={s.monthlyEstimate}
                    currency={currency}
                    onChange={(value) => onSetPrice(s.key, value)}
                  />
                </td>
                <td className="amount negative">{fmt(s.annualEstimate)}</td>
                <td className="actions">
                  {flagBtn(s.key)}
                  <button className="btn ghost small" onClick={() => onUnconfirm(s.key)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}


        </tbody>
      </table>
    </div>
  )
}

function EditableAmount({
  value,
  currency,
  onChange,
}: {
  value: number
  currency: string
  onChange: (value: number) => void
}) {
  const { fmt, curr } = useCurrency()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (editing) {
    return (
      <input
        type="number"
        step="0.01"
        min="0"
        autoFocus
        className="table-input amount-input"
        style={{ maxWidth: 90 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(draft)
          if (Number.isFinite(parsed) && parsed >= 0) onChange(parsed)
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
      onClick={() => {
        setDraft(value.toFixed(2))
        setEditing(true)
      }}
      title="Click to edit"
    >
      {fmt(value)}
    </button>
  )
}

function EditableText({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        className="table-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft.trim()) onChange(draft.trim())
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
      style={{ textAlign: 'left' }}
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      title="Click to edit"
    >
      {value}
    </button>
  )
}

function EditableSelect({
  value,
  options,
  display,
  onChange,
}: {
  value: string
  options: { value: string; label: string; color?: string }[]
  display: React.ReactNode
  onChange: (value: string) => void
}) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <select
        autoFocus
        className="table-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setEditing(false)
        }}
        onBlur={() => setEditing(false)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <button className="amount-edit-trigger" style={{ textAlign: 'left' }} onClick={() => setEditing(true)} title="Click to edit">
      {display}
    </button>
  )
}

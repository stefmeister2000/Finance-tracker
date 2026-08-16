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
  const subscriptions = detectSubscriptions(ws)
  const manualSubs = ws.manualSubscriptions ?? []

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

  function setRecurring(key: string, recurring: boolean) {
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
                return tKey === key ? { ...t, recurring } : t
              }),
            },
          ]),
        ),
      })),
    )
  }

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
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        manualSubscriptions: [
          ...(w.manualSubscriptions ?? []),
          {
            id: uuid(),
            description: 'New Subscription',
            categoryId: w.categories.find((c) => c.type === 'expense')?.id ?? '',
            cardId: w.cards[0]?.id ?? '',
            monthlyCost: 0,
          },
        ],
      })),
    )
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
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Subscriptions</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Active Subscriptions</div>
          <div className="value">{subscriptions.filter((s) => s.flaggedRecurring).length + manualSubs.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Estimated Monthly Cost</div>
          <div className="value negative">{fmt(monthlyTotal)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Estimated Annual Cost</div>
          <div className="value negative">{fmt(annualTotal)}</div>
        </div>
      </div>

      {categoryBreakdown.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Breakdown by Category</h2>
          </div>
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
        </div>
      )}

      <div className="panel">
        <div className="panel-header">
          <h2>Subscriptions</h2>
          <p>Your subscriptions, plus suggestions detected from your transactions — accept or dismiss each one.</p>
          <button className="btn secondary small" onClick={addManualSubscription}>
            + Add Subscription
          </button>
        </div>
        <UnifiedSubscriptionTable
          manualSubs={manualSubs}
          subscriptions={subscriptions}
          categories={ws.categories.filter((c) => c.type === 'expense')}
          cards={ws.cards}
          categoryById={categoryById}
          cardById={cardById}
          currency={curr}
          onUpdateManual={updateManualSubscription}
          onRemoveManual={removeManualSubscription}
          onConfirm={(key) => setRecurring(key, true)}
          onUnconfirm={(key) => ignoreSubscription(key)}
          onDismiss={ignoreSubscription}
          onSetPrice={setSubscriptionPrice}
          flaggedKeys={new Set(ws.flaggedSubscriptions ?? [])}
          onToggleFlag={toggleFlagSub}
        />
      </div>
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
  onConfirm,
  onUnconfirm,
  onDismiss,
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
  onConfirm: (key: string) => void
  onUnconfirm: (key: string) => void
  onDismiss: (key: string) => void
  onSetPrice: (key: string, monthly: number | null) => void
  flaggedKeys: Set<string>
  onToggleFlag: (key: string) => void
}) {
  const flagBtn = (key: string) => {
    const on = flaggedKeys.has(key)
    return (
      <button className="btn ghost small" title={on ? 'Unflag' : 'Flag to review later'}
        onClick={() => onToggleFlag(key)} style={on ? { color: '#f59e0b', borderColor: '#f59e0b' } : undefined}>
        {on ? '🚩' : '⚐'}
      </button>
    )
  }
  const { fmt, curr } = useCurrency()
  const confirmed = subscriptions.filter((s) => s.flaggedRecurring)
  const suggestions = subscriptions.filter((s) => !s.flaggedRecurring)

  if (manualSubs.length === 0 && confirmed.length === 0 && suggestions.length === 0) {
    return <div className="empty-state">Nothing here yet.</div>
  }

  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Category</th>
            <th>Account</th>
            <th style={{ textAlign: 'right' }}>Monthly</th>
            <th style={{ textAlign: 'right' }}>Annual</th>
            <th>Subscription?</th>
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
                  <span className="tag" style={{ background: 'var(--green-soft, #16a34a22)', color: 'var(--green)' }}>
                    ✓ Yes
                  </span>
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
                  <span className="tag" style={{ background: 'var(--green-soft, #16a34a22)', color: 'var(--green)' }}>
                    ✓ Yes
                  </span>
                  {flagBtn(s.key)}
                  <button className="btn ghost small" onClick={() => onUnconfirm(s.key)}>
                    Remove
                  </button>
                </td>
              </tr>
            )
          })}

          {suggestions.map((s) => {
            const cat = categoryById.get(s.categoryId)
            const card = cardById.get(s.cardId)
            return (
              <tr key={`suggestion-${s.key}`}>
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
                  <span style={{ marginRight: 6, color: 'var(--text-muted)' }}>Subscription?</span>
                  <button className="btn secondary small" onClick={() => onConfirm(s.key)}>
                    Yes
                  </button>
                  <button className="btn ghost small" onClick={() => onDismiss(s.key)}>
                    No
                  </button>
                  {flagBtn(s.key)}
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
        autoFocus
        className="table-input amount-input"
        style={{ maxWidth: 90 }}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = parseFloat(draft)
          if (!isNaN(parsed)) onChange(parsed)
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

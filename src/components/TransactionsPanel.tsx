import { useCurrency } from '../CurrencyContext'
import { useMemo, useState } from 'react'
import type { AppData, EntryType, Transaction, WorkspaceData } from '../types'
import { categoryRuleKey, normalizeDescription } from '../categorize'
import { emptyMonth, workspaceOrder } from '../storage'
import { formatCurrency } from '../utils'
import TransactionModal from './TransactionModal'
import StatementImportModal from './StatementImportModal'
import CategoryTag from './CategoryTag'
import SubscriptionScanModal from './SubscriptionScanModal'
import QuickAddModal from './QuickAddModal'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  monthId: string
}

export default function TransactionsPanel({ data, ws, setData, monthId }: Props) {
  const { fmt, curr } = useCurrency()
  const month = ws.months[monthId]
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [quickAdding, setQuickAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [cardFilter, setCardFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'ignore'>('all')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const categoryById = useMemo(() => new Map(ws.categories.map((c) => [c.id, c])), [ws.categories])

  // Every OTHER workspace this transaction can be mirrored into (all businesses + personal).
  const otherWorkspaces = useMemo(
    () =>
      workspaceOrder(data)
        .filter((id) => id !== data.activeWorkspace)
        .map((id) => ({ id, ws: data.workspaces[id] }))
        .filter((x) => x.ws),
    [data],
  )

  function isCopiedTo(t: Transaction, targetWs: WorkspaceData): boolean {
    const tag = `[copied:${ws.kind}:${t.id}]`
    return Object.values(targetWs.months).some((m) => m.transactions.some((x) => x.description.includes(tag)))
  }

  function copyToWorkspace(t: Transaction, targetWsId: string) {
    setData((prev) => {
      const targetWs = prev.workspaces[targetWsId]
      if (!targetWs) return prev
      const targetMonthId = t.date.slice(0, 7)
      const month = targetWs.months[targetMonthId] ?? emptyMonth(targetMonthId)
      const tag = `[copied:${ws.kind}:${t.id}]`
      if (month.transactions.some((x) => x.description.includes(tag))) return prev
      const sourceCat = ws.categories.find((c) => c.id === t.categoryId)
      const matchingCat = sourceCat
        ? targetWs.categories.find((c) => c.type === t.type && c.name.toLowerCase() === sourceCat.name.toLowerCase())
        : undefined
      const fallbackCat = targetWs.categories.find((c) => c.type === t.type)
      const newTx: Transaction = {
        id: crypto.randomUUID(),
        date: t.date,
        description: `${t.description} ${tag}`,
        amount: t.amount,
        type: t.type,
        categoryId: matchingCat?.id ?? fallbackCat?.id ?? '',
        cardId: targetWs.cards[0]?.id ?? '',
      }
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [targetWsId]: {
            ...targetWs,
            months: { ...targetWs.months, [targetMonthId]: { ...month, transactions: [...month.transactions, newTx] } },
          },
        },
      }
    })
  }

  function saveTransaction(t: Transaction) {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      const existing = m.transactions.find((x) => x.id === t.id)
      const transactions = existing ? m.transactions.map((x) => (x.id === t.id ? t : x)) : [...m.transactions, t]
      let months = { ...w.months, [monthId]: { ...m, transactions } }
      let categoryRules = w.categoryRules
      let typeRules = w.typeRules

      // If the TYPE changed (e.g. marking "Pocket Withdrawal" as a bank-to-bank
      // transfer → Ignored), apply the same type to every other occurrence and
      // remember it so future imports/additions get the same type automatically.
      if (existing && existing.type !== t.type) {
        ;({ months, typeRules } = propagateType(months, typeRules, t))
      }

      // If the category changed on an existing transaction, auto-apply the same
      // category to every other transaction (in any month) with a matching
      // description, so re-categorizing one occurrence updates all of them.
      // Also remember this mapping so future imports/additions with the same
      // description are categorized correctly automatically.
      if (existing && existing.categoryId !== t.categoryId && t.categoryId) {
        ;({ months, categoryRules } = propagateCategory(months, categoryRules, t))
      }

      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: { ...w, months, categoryRules, typeRules },
        },
      }
    })
  }

  /**
   * Applies `t.type` to every other transaction (in any month) with a matching
   * description, and records the mapping in `typeRules` so future imports/additions
   * with the same description get the same type automatically. When a transaction
   * becomes 'ignore', its category is cleared to keep it out of income/expense totals.
   */
  function propagateType(
    months: WorkspaceData['months'],
    typeRules: WorkspaceData['typeRules'],
    t: Transaction,
  ): { months: WorkspaceData['months']; typeRules: WorkspaceData['typeRules'] } {
    const norm = normalizeDescription(t.description)
    const updatedMonths = Object.fromEntries(
      Object.entries(months).map(([id, month]) => [
        id,
        {
          ...month,
          transactions: month.transactions.map((x) =>
            x.id !== t.id && normalizeDescription(x.description) === norm
              ? { ...x, type: t.type, categoryId: t.type === 'ignore' ? '' : x.categoryId }
              : x,
          ),
        },
      ]),
    )
    const updatedRules = { ...(typeRules ?? {}), [norm]: t.type }
    return { months: updatedMonths, typeRules: updatedRules }
  }

  /**
   * Applies `t.categoryId` to every other transaction (in any month) with a matching
   * description and type, and records the mapping in `categoryRules` so future
   * imports/additions with the same description are categorized automatically.
   */
  function propagateCategory(
    months: WorkspaceData['months'],
    categoryRules: WorkspaceData['categoryRules'],
    t: Transaction,
  ): { months: WorkspaceData['months']; categoryRules: WorkspaceData['categoryRules'] } {
    const norm = normalizeDescription(t.description)
    const updatedMonths = Object.fromEntries(
      Object.entries(months).map(([id, month]) => [
        id,
        {
          ...month,
          transactions: month.transactions.map((x) =>
            x.id !== t.id && x.type === t.type && normalizeDescription(x.description) === norm
              ? { ...x, categoryId: t.categoryId }
              : x,
          ),
        },
      ]),
    )
    const updatedRules = { ...categoryRules, [categoryRuleKey(t.description, t.type)]: t.categoryId }
    return { months: updatedMonths, categoryRules: updatedRules }
  }

  /**
   * Syncs categories for every transaction in every month: for each distinct
   * description, the most recently dated category assignment "wins" and is
   * applied to every other occurrence (and remembered in `categoryRules` for
   * future imports/additions). This lets a single recent fix bring every past
   * (and future) occurrence of that transaction in line.
   */
  function syncCategories() {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const rules: Record<string, string> = { ...(w.categoryRules ?? {}) }
      const tRules: Record<string, EntryType> = { ...(w.typeRules ?? {}) }

      const allTx: Transaction[] = []
      for (const m of Object.values(w.months)) allTx.push(...m.transactions)
      allTx.sort((a, b) => a.date.localeCompare(b.date))
      // Most recent assignment wins for both category and type rules.
      for (const t of allTx) {
        tRules[normalizeDescription(t.description)] = t.type
        if (t.categoryId) rules[categoryRuleKey(t.description, t.type)] = t.categoryId
      }

      let changed = 0
      const months = Object.fromEntries(
        Object.entries(w.months).map(([id, m]) => [
          id,
          {
            ...m,
            transactions: m.transactions.map((t) => {
              let next = t
              // Apply the learned type first (e.g. bank-to-bank → Ignored)…
              const ruleType = tRules[normalizeDescription(t.description)]
              if (ruleType && ruleType !== next.type) {
                next = { ...next, type: ruleType, categoryId: ruleType === 'ignore' ? '' : next.categoryId }
              }
              // …then the learned category for that (possibly new) type.
              const ruleCat = rules[categoryRuleKey(next.description, next.type)]
              if (next.type !== 'ignore' && ruleCat && ruleCat !== next.categoryId) {
                next = { ...next, categoryId: ruleCat }
              }
              if (next !== t) changed++
              return next
            }),
          },
        ]),
      )

      if (changed === 0) {
        alert('Everything is already in sync — nothing needed updating.')
        return prev
      }
      alert(`Synced ${changed} transaction${changed === 1 ? '' : 's'}.`)
      return {
        ...prev,
        workspaces: { ...prev.workspaces, [prev.activeWorkspace]: { ...w, months, categoryRules: rules, typeRules: tRules } },
      }
    })
  }

  function toggleRecurring(id: string) {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: {
            ...w,
            months: {
              ...w.months,
              [monthId]: {
                ...m,
                transactions: m.transactions.map((x) => (x.id === id ? { ...x, recurring: !x.recurring } : x)),
              },
            },
          },
        },
      }
    })
  }

  function toggleFlag(id: string) {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: {
            ...w,
            months: {
              ...w.months,
              [monthId]: { ...m, transactions: m.transactions.map((x) => (x.id === id ? { ...x, flagged: !x.flagged } : x)) },
            },
          },
        },
      }
    })
  }

  function deleteTransaction(id: string) {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      const tx = m.transactions.find((x) => x.id === id)
      const tagMatch = tx?.description.match(/\[(adspend|startup):([^\]]+)\]/)
      const dismissedReconcileTags = tagMatch
        ? Array.from(new Set([...(w.dismissedReconcileTags ?? []), `${tagMatch[1]}:${tagMatch[2]}`]))
        : w.dismissedReconcileTags
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: {
            ...w,
            dismissedReconcileTags,
            months: { ...w.months, [monthId]: { ...m, transactions: m.transactions.filter((x) => x.id !== id) } },
          },
        },
      }
    })
  }

  function bulkUpdate(fn: (t: Transaction) => Transaction) {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      const transactions = m.transactions.map((t) => (selected.has(t.id) ? fn(t) : t))
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: { ...w, months: { ...w.months, [monthId]: { ...m, transactions } } },
        },
      }
    })
  }

  function bulkDelete() {
    setData((prev) => {
      const w = prev.workspaces[prev.activeWorkspace]
      const m = w.months[monthId]
      const newTags: string[] = []
      for (const t of m.transactions) {
        if (!selected.has(t.id)) continue
        const tagMatch = t.description.match(/\[(adspend|startup):([^\]]+)\]/)
        if (tagMatch) newTags.push(`${tagMatch[1]}:${tagMatch[2]}`)
      }
      const dismissedReconcileTags = newTags.length > 0
        ? Array.from(new Set([...(w.dismissedReconcileTags ?? []), ...newTags]))
        : w.dismissedReconcileTags
      return {
        ...prev,
        workspaces: {
          ...prev.workspaces,
          [prev.activeWorkspace]: {
            ...w,
            dismissedReconcileTags,
            months: { ...w.months, [monthId]: { ...m, transactions: m.transactions.filter((t) => !selected.has(t.id)) } },
          },
        },
      }
    })
    setSelected(new Set())
  }

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectGroup(ids: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (checked) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }

  const filtered = month.transactions.filter((t) => {
    if (cardFilter !== 'all' && t.cardId !== cardFilter) return false
    if (categoryFilter !== 'all' && t.categoryId !== categoryFilter) return false
    if (typeFilter !== 'all' && t.type !== typeFilter) return false
    if (flaggedOnly && !t.flagged) return false
    if (search.trim() && !t.description.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  const flaggedCount = month.transactions.filter((t) => t.flagged).length

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>()
    for (const card of ws.cards) map.set(card.id, [])
    for (const t of filtered) {
      if (!map.has(t.cardId)) map.set(t.cardId, [])
      map.get(t.cardId)!.push(t)
    }
    return map
  }, [filtered, ws.cards])

  return (
    <div>
      <div className="panel-header">
        <h2>Transactions</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn secondary" onClick={syncCategories} title="Re-apply learned categories to every transaction in every month">
            Sync Categories
          </button>
          <button className="btn secondary" onClick={() => setScanning(true)} title="Look for recurring subscriptions in this workspace">
            Scan Subscriptions
          </button>
          <button className="btn secondary" onClick={() => setImporting(true)}>
            Import Statement (PDF)
          </button>
          <button className="btn secondary" onClick={() => setQuickAdding(true)} title="Add subscriptions and fixed costs as transactions for this month">
            ⚡ Quick Add
          </button>
          <button className="btn" onClick={() => setAdding(true)}>
            + Add Transaction
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 200 }}
        />
        <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}>
          <option value="all">All cards</option>
          {ws.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {ws.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
          <option value="all">Income &amp; Expenses</option>
          <option value="income">Income only</option>
          <option value="expense">Expenses only</option>
          <option value="ignore">Ignored only</option>
        </select>
        <button
          className={`btn ${flaggedOnly ? 'secondary' : 'ghost'} small`}
          onClick={() => setFlaggedOnly((v) => !v)}
          title="Show only transactions you flagged for review"
          style={flaggedOnly ? { borderColor: '#f59e0b', color: '#f59e0b' } : undefined}
        >
          🚩 Flagged{flaggedCount > 0 ? ` (${flaggedCount})` : ''}
        </button>
      </div>

      {selected.size > 0 && (
        <div className="panel bulk-bar">
          <span className="value" style={{ fontSize: 13 }}>
            {selected.size} selected
          </span>
          <select
            value=""
            onChange={(e) => {
              const categoryId = e.target.value
              if (!categoryId) return
              setData((prev) => {
                const w = prev.workspaces[prev.activeWorkspace]
                const m = w.months[monthId]
                let months = w.months
                let categoryRules = w.categoryRules
                for (const t of m.transactions) {
                  if (!selected.has(t.id) || t.categoryId === categoryId) continue
                  const updated = { ...t, categoryId }
                  months = {
                    ...months,
                    [monthId]: {
                      ...months[monthId],
                      transactions: months[monthId].transactions.map((x) => (x.id === t.id ? updated : x)),
                    },
                  }
                  ;({ months, categoryRules } = propagateCategory(months, categoryRules, updated))
                }
                return {
                  ...prev,
                  workspaces: {
                    ...prev.workspaces,
                    [prev.activeWorkspace]: { ...w, months, categoryRules },
                  },
                }
              })
            }}
          >
            <option value="" disabled>
              Set category…
            </option>
            {ws.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => {
              const type = e.target.value as Transaction['type']
              if (!type) return
              bulkUpdate((t) => ({ ...t, type }))
            }}
          >
            <option value="" disabled>
              Set type…
            </option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="ignore">Ignored</option>
          </select>
          <select
            value=""
            onChange={(e) => {
              const cardId = e.target.value
              if (!cardId) return
              bulkUpdate((t) => ({ ...t, cardId }))
            }}
          >
            <option value="" disabled>
              Move to account…
            </option>
            {ws.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button className="btn ghost small" onClick={bulkDelete}>
            Delete selected
          </button>
          <button className="btn ghost small" onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {ws.cards.map((card) => {
        const txs = (groups.get(card.id) ?? []).slice().sort((a, b) => a.date.localeCompare(b.date))
        if (cardFilter !== 'all' && cardFilter !== card.id) return null
        const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
        const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

        return (
          <div className="panel" key={card.id}>
            <div className="panel-header">
              <h2>
                <span className="dot" style={{ background: card.color, marginRight: 8 }} />
                {card.name}
              </h2>
              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <span className="positive value" style={{ fontSize: 14 }}>
                  +{fmt(income)}
                </span>
                <span className="negative value" style={{ fontSize: 14 }}>
                  -{fmt(expense)}
                </span>
                <span className="value" style={{ fontSize: 14 }}>
                  = {fmt(income - expense)}
                </span>
              </div>
            </div>
            {txs.length === 0 ? (
              <div className="empty-state">No transactions on this card yet.</div>
            ) : (
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={txs.length > 0 && txs.every((t) => selected.has(t.id))}
                          onChange={(e) => toggleSelectGroup(txs.map((t) => t.id), e.target.checked)}
                        />
                      </th>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Amount</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => {
                      const cat = categoryById.get(t.categoryId)
                      return (
                        <tr key={t.id} style={t.flagged ? { background: '#f59e0b12' } : undefined}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(t.id)}
                              onChange={(e) => toggleSelected(t.id, e.target.checked)}
                            />
                          </td>
                          <td>{t.date}</td>
                          <td>
                            {t.description.replace(/\s*\[(adspend|startup|copied):[^\]]+\]/, '').replace(/\s*\(stripe:[^)]+\)/, '')}
                            {t.recurring && (
                              <span className="tag" style={{ marginLeft: 6, background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                                ↻ recurring
                              </span>
                            )}
                            {(() => {
                              const m = t.description.match(/\[copied:(personal|business):[^\]]+\]/)
                              if (!m) return null
                              const fromBiz = m[1] === 'business'
                              return (
                                <span
                                  className="tag"
                                  style={{
                                    marginLeft: 6,
                                    background: fromBiz ? '#6366f122' : '#22c55e22',
                                    color: fromBiz ? '#6366f1' : '#22c55e',
                                    fontWeight: 600,
                                  }}
                                >
                                  {fromBiz ? '🏢 from Business' : '👤 from Personal'}
                                </span>
                              )
                            })()}
                            {t.description.includes('(stripe:') && (
                              <span className="tag" style={{ marginLeft: 6, background: '#635bff22', color: '#635bff', fontWeight: 600 }}>
                                💳 Stripe
                              </span>
                            )}
                          </td>
                          <td>
                            {cat ? (
                              <CategoryTag category={cat} />
                            ) : (
                              t.type === 'ignore' && <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td>{t.type === 'income' ? 'Income' : t.type === 'expense' ? 'Expense' : 'Ignored'}</td>
                          <td
                            className={`amount ${
                              t.type === 'income' ? 'positive' : t.type === 'expense' ? 'negative' : ''
                            }`}
                            style={t.type === 'ignore' ? { color: 'var(--text-muted)' } : undefined}
                          >
                            {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}
                            {fmt(t.amount)}
                          </td>
                          <td className="actions">
                            {t.type === 'expense' && (
                              <button
                                className="btn ghost small"
                                onClick={() => toggleRecurring(t.id)}
                                title={
                                  t.recurring
                                    ? 'Remove from subscriptions'
                                    : 'Mark as recurring so it shows up on the Subscriptions page'
                                }
                              >
                                {t.recurring ? '↺ Subscription' : '+ Subscription'}
                              </button>
                            )}
                            {t.type !== 'ignore' && otherWorkspaces.length > 0 && (
                              <select
                                className="btn ghost small"
                                value=""
                                title={`Copy this ${t.type} to another workspace for this month`}
                                onChange={(e) => {
                                  const targetId = e.target.value
                                  if (targetId) copyToWorkspace(t, targetId)
                                  e.target.value = ''
                                }}
                                style={{ cursor: 'pointer', maxWidth: 150 }}
                              >
                                <option value="">📋 Copy to…</option>
                                {otherWorkspaces.map(({ id, ws: tw }) => {
                                  const done = isCopiedTo(t, tw)
                                  const icon = tw.icon ?? (tw.kind === 'business' ? '🏢' : '👤')
                                  return (
                                    <option key={id} value={id} disabled={done}>
                                      {done ? '✓ ' : `${icon} `}{tw.name}{done ? ' (added)' : ''}
                                    </option>
                                  )
                                })}
                              </select>
                            )}
                            <button
                              className="btn ghost small"
                              onClick={() => toggleFlag(t.id)}
                              title={t.flagged ? 'Unflag' : 'Flag to review later'}
                              style={t.flagged ? { color: '#f59e0b', borderColor: '#f59e0b' } : undefined}
                            >
                              {t.flagged ? '🚩' : '⚐'}
                            </button>
                            <button className="btn ghost small" onClick={() => setEditing(t)}>
                              Edit
                            </button>
                            <button className="btn ghost small" onClick={() => deleteTransaction(t.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {(adding || editing) && (
        <TransactionModal
          ws={ws}
          monthId={monthId}
          transaction={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onSave={(t) => {
            saveTransaction(t)
            setAdding(false)
            setEditing(null)
          }}
        />
      )}

      {importing && <StatementImportModal ws={ws} setData={setData} onClose={() => setImporting(false)} />}

      {scanning && <SubscriptionScanModal ws={ws} setData={setData} onClose={() => setScanning(false)} />}

      {quickAdding && <QuickAddModal ws={ws} monthId={monthId} setData={setData} onClose={() => setQuickAdding(false)} />}
    </div>
  )
}

import type { AppData, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { normalizeDescription } from '../categorize'
import { detectSubscriptions, formatCurrency } from '../utils'
import CategoryTag from './CategoryTag'

interface Props {
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  onClose: () => void
}

export default function SubscriptionScanModal({ ws, setData, onClose }: Props) {
  const suggestions = detectSubscriptions(ws).filter((s) => !s.flaggedRecurring)
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const cardById = new Map(ws.cards.map((c) => [c.id, c]))

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h2>Scan Subscriptions</h2>
          <button className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>
        {suggestions.length === 0 ? (
          <div className="empty-state">No new subscriptions detected. Everything looks confirmed or ignored.</div>
        ) : (
          <>
            <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
              These transactions look like they might be recurring subscriptions. Confirm the ones that are real.
            </p>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th style={{ textAlign: 'right' }}>Monthly</th>
                    <th>Subscription?</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => {
                    const cat = categoryById.get(s.categoryId)
                    const card = cardById.get(s.cardId)
                    return (
                      <tr key={s.key}>
                        <td>{s.description}</td>
                        <td>{cat && <CategoryTag category={cat} />}</td>
                        <td>{card?.name ?? '—'}</td>
                        <td className="amount negative">{formatCurrency(s.monthlyEstimate, ws.currency)}</td>
                        <td className="actions">
                          <button className="btn secondary small" onClick={() => setRecurring(s.key, true)}>
                            Yes
                          </button>
                          <button className="btn ghost small" onClick={() => ignoreSubscription(s.key)}>
                            No
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

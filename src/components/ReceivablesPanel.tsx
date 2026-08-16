import { useCurrency } from '../CurrencyContext'
import { v4 as uuid } from 'uuid'
import type { AppData, Receivable, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { formatCurrency } from '../utils'

interface Props {
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  monthId: string
}

export default function ReceivablesPanel({ ws, setData, monthId }: Props) {
  const { fmt, curr } = useCurrency()
  const items = (ws.receivables ?? []).filter((r) => r.monthId === monthId)

  function update(id: string, patch: Partial<Receivable>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        receivables: (w.receivables ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
      })),
    )
  }

  function add() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        receivables: [
          ...(w.receivables ?? []),
          { id: uuid(), person: '', description: '', amount: 0, monthId, expectedDate: '', paid: false },
        ],
      })),
    )
  }

  function remove(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        receivables: (w.receivables ?? []).filter((r) => r.id !== id),
      })),
    )
  }

  function togglePaid(r: Receivable, paid: boolean) {
    update(r.id, { paid, paidDate: paid ? r.paidDate || new Date().toISOString().slice(0, 10) : undefined })
  }

  const totalOutstanding = items.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0)
  const totalPaid = items.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Owed to You</h2>
        <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
          <span className="value" style={{ fontSize: 14 }}>
            Outstanding: {fmt(totalOutstanding)}
          </span>
          <span className="positive value" style={{ fontSize: 14 }}>
            Paid back: {fmt(totalPaid)}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          Nobody owes you anything tracked for this month yet. Click + Add to track money someone owes you.
        </div>
      ) : (
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Expected Date</th>
                <th>Status</th>
                <th>Paid Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      placeholder="Name"
                      value={r.person}
                      onChange={(e) => update(r.id, { person: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      placeholder="What for"
                      value={r.description ?? ''}
                      onChange={(e) => update(r.id, { description: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      className="table-input amount-input"
                      value={r.amount}
                      onChange={(e) => update(r.id, { amount: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="table-input"
                      value={r.expectedDate ?? ''}
                      onChange={(e) => update(r.id, { expectedDate: e.target.value })}
                    />
                  </td>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={r.paid} onChange={(e) => togglePaid(r, e.target.checked)} />
                      {r.paid ? 'Paid back' : 'Outstanding'}
                    </label>
                  </td>
                  <td>
                    {r.paid ? (
                      <input
                        type="date"
                        className="table-input"
                        value={r.paidDate ?? ''}
                        onChange={(e) => update(r.id, { paidDate: e.target.value })}
                      />
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="actions">
                    <button className="btn ghost small" onClick={() => remove(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn secondary small" style={{ marginTop: 12 }} onClick={add}>
        + Add
      </button>
    </div>
  )
}

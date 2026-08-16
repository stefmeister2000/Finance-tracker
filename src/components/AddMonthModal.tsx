import { useState } from 'react'

interface Props {
  defaultMonth: string
  existing: string[]
  hasPrevious: boolean
  onClose: () => void
  onAdd: (id: string, copyFromPrev: boolean) => void
}

export default function AddMonthModal({ defaultMonth, existing, hasPrevious, onClose, onAdd }: Props) {
  const [month, setMonth] = useState(defaultMonth)
  const [copy, setCopy] = useState(true)
  const alreadyExists = existing.includes(month)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add Month</h2>
        <div className="field">
          <label>Month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
        {alreadyExists && (
          <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 8 }}>This month already exists.</p>
        )}
        {hasPrevious && !alreadyExists && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            Carry over net worth balances &amp; recurring transactions from previous month
          </label>
        )}
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={alreadyExists} onClick={() => onAdd(month, copy)}>
            Add Month
          </button>
        </div>
      </div>
    </div>
  )
}

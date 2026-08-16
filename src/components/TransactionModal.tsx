import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { guessCategoryId, guessEntryType } from '../categorize'
import type { EntryType, Transaction, WorkspaceData } from '../types'

interface Props {
  ws: WorkspaceData
  monthId: string
  transaction: Transaction | null
  onClose: () => void
  onSave: (t: Transaction) => void
}

export default function TransactionModal({ ws, monthId, transaction, onClose, onSave }: Props) {
  const [type, setType] = useState<EntryType>(transaction?.type ?? 'expense')
  const [date, setDate] = useState(transaction?.date ?? `${monthId}-01`)
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [cardId, setCardId] = useState(transaction?.cardId ?? ws.cards[0]?.id ?? '')
  const categoriesForType = ws.categories.filter((c) => c.type === type)
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? categoriesForType[0]?.id ?? '')
  const [categoryTouched, setCategoryTouched] = useState(!!transaction)
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false)

  function handleTypeChange(newType: EntryType) {
    setType(newType)
    const cats = ws.categories.filter((c) => c.type === newType)
    if (!cats.some((c) => c.id === categoryId)) {
      setCategoryId(guessCategoryId(description, newType, ws.categories, ws.categoryRules) ?? cats[0]?.id ?? '')
    }
  }

  function handleDescriptionBlur() {
    if (transaction || !description.trim()) return
    // For new transactions, apply a learned type for this description (e.g. a
    // known bank-to-bank transfer becomes Ignored automatically)…
    const learnedType = guessEntryType(description, type, ws.typeRules)
    let effectiveType = type
    if (learnedType !== type) {
      effectiveType = learnedType
      handleTypeChange(learnedType)
    }
    // …then suggest a category, unless the user already picked one themselves.
    if (!categoryTouched) {
      const guess = guessCategoryId(description, effectiveType, ws.categories, ws.categoryRules)
      if (guess) setCategoryId(guess)
    }
  }

  function handleSubmit() {
    const value = parseFloat(amount)
    if (!description.trim() || isNaN(value) || value <= 0 || !cardId) return
    if (type !== 'ignore' && !categoryId) return
    onSave({
      id: transaction?.id ?? uuid(),
      date,
      description: description.trim(),
      amount: value,
      type,
      categoryId,
      cardId,
      recurring,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{transaction ? 'Edit Transaction' : 'Add Transaction'}</h2>

        <div className="type-toggle" style={{ marginBottom: 14 }}>
          <button
            className={type === 'income' ? 'active income' : ''}
            onClick={() => handleTypeChange('income')}
          >
            Income
          </button>
          <button
            className={type === 'expense' ? 'active expense' : ''}
            onClick={() => handleTypeChange('expense')}
          >
            Expense
          </button>
          <button
            className={type === 'ignore' ? 'active ignore' : ''}
            onClick={() => handleTypeChange('ignore')}
          >
            Ignore
          </button>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Amount ({ws.currency})</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field span-2">
            <label>Description</label>
            <input
              type="text"
              placeholder="e.g. Grocery shopping"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
            />
          </div>
          <div className="field">
            <label>Bank Card / Account</label>
            <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
              {ws.cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {categoriesForType.length > 0 && (
            <div className="field">
              <label>Category</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryTouched(true)
                  setCategoryId(e.target.value)
                }}
              >
                {categoriesForType.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13 }}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
          Recurring (carry over to next month automatically)
        </label>

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" onClick={handleSubmit}>
            {transaction ? 'Save Changes' : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}

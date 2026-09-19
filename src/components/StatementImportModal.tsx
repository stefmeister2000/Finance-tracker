import { useState } from 'react'
import type { AppData, EntryType, Transaction, WorkspaceData } from '../types'
import { emptyMonth } from '../storage'
import { formatCurrency } from '../utils'
import { guessCategoryId, guessEntryType } from '../categorize'
import { readStatementPdf, type ParsedStatement, type ParsedTransaction } from '../pdfImport'

interface Props {
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  onClose: () => void
}

interface Row extends Omit<ParsedTransaction, 'type'> {
  type: EntryType
  include: boolean
  categoryId: string
  duplicate: boolean
}

/** Signature used to detect transactions that have already been imported. */
function transactionSignature(t: { date: string; description: string; amount: number; type: string; cardId: string }) {
  return `${t.date}|${t.description.trim().toLowerCase()}|${t.amount.toFixed(2)}|${t.type}|${t.cardId}`
}

function existingSignatures(ws: WorkspaceData, cardId: string): Set<string> {
  const set = new Set<string>()
  for (const month of Object.values(ws.months)) {
    for (const t of month.transactions) {
      if (t.cardId !== cardId) continue
      set.add(transactionSignature(t))
    }
  }
  return set
}

export default function StatementImportModal({ ws, setData, onClose }: Props) {
  const [statement, setStatement] = useState<ParsedStatement | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [cardId, setCardId] = useState(ws.cards[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    setStatement(null)
    try {
      const result = await readStatementPdf(file)
      setStatement(result)
      const parsed = result.transactions
      if (parsed.length === 0) {
        setError('No transactions could be found in this PDF. It may be a scanned/image-based statement.')
        setRows(null)
      } else {
        // Never default a detected KBC statement to an unrelated account.
        const matchingAccounts = ws.cards.filter((c) => /\bkbc\b/i.test(c.name))
        const targetCardId = result.bank === 'KBC'
          ? (matchingAccounts.length === 1 ? matchingAccounts[0].id : '')
          : cardId
        setCardId(targetCardId)
        const existing = existingSignatures(ws, targetCardId)
        setRows(
          parsed.map((p) => {
            const type = guessEntryType(p.description, p.type, ws.typeRules)
            const duplicate = existing.has(transactionSignature({ ...p, type, cardId: targetCardId }))
            return {
              ...p,
              type,
              include: !duplicate,
              duplicate,
              categoryId: guessCategoryId(p.description, type, ws.categories, ws.categoryRules) ?? '',
            }
          }),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read this PDF. Make sure it is a valid statement file.')
      setRows(null)
    } finally {
      setLoading(false)
    }
  }

  function updateRow(i: number, updates: Partial<Row>) {
    setRows((prev) => prev && prev.map((r, idx) => (idx === i ? { ...r, ...updates } : r)))
  }

  function changeCard(newCardId: string) {
    setCardId(newCardId)
    setRows((prev) => {
      if (!prev) return prev
      const existing = existingSignatures(ws, newCardId)
      return prev.map((r) => {
        const duplicate = existing.has(transactionSignature({ ...r, cardId: newCardId }))
        return { ...r, duplicate, include: duplicate ? false : r.include }
      })
    })
  }

  function importRows() {
    if (!rows || !cardId) return
    // Re-check against the latest data at import time, in case it changed since the file was loaded.
    const existing = existingSignatures(ws, cardId)
    const included = rows.filter((r) => r.include && !existing.has(transactionSignature({ ...r, cardId })))
    if (included.length === 0) return

    setData((prev) => {
      const w = { ...prev.workspaces[prev.activeWorkspace] }
      const months = { ...w.months }

      for (const r of included) {
        const monthId = r.date.slice(0, 7)
        const month = months[monthId] ?? emptyMonth(monthId)
        const t: Transaction = {
          id: crypto.randomUUID(),
          date: r.date,
          description: r.description,
          amount: r.amount,
          type: r.type,
          categoryId: r.categoryId || w.categories.find((c) => c.type === r.type)?.id || '',
          cardId,
        }
        months[monthId] = { ...month, transactions: [...month.transactions, t] }
      }

      w.months = months
      return { ...prev, workspaces: { ...prev.workspaces, [prev.activeWorkspace]: w } }
    })

    onClose()
  }

  const totalIncome = rows?.filter((r) => r.include && r.type === 'income').reduce((s, r) => s + r.amount, 0) ?? 0
  const totalExpense = rows?.filter((r) => r.include && r.type === 'expense').reduce((s, r) => s + r.amount, 0) ?? 0
  const duplicateCount = rows?.filter((r) => r.duplicate).length ?? 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Import Statement (PDF)</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8 }}>
          Upload a KBC Touch or Revolut PDF statement. We'll automatically detect transactions, guess categories, and
          add them to the right months.
        </p>

        {!rows && (
          <div className="field">
            <label>Statement PDF</label>
            <input type="file" accept="application/pdf" onChange={handleFile} />
          </div>
        )}

        {loading && <div className="empty-state">Reading PDF…</div>}
        {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

        {rows && (
          <>
            {statement && (
              <div className="panel" style={{ marginBottom: 14 }}>
                <strong>{statement.bank} statement totals</strong>
                <p style={{ fontSize: 13 }}>
                  {statement.transactions.length} transactions · Money in: {formatCurrency(statement.transactions.filter((t) => t.type === 'income').reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100, ws.currency)}
                  {' · '}Money out: {formatCurrency(statement.transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.round(t.amount * 100), 0) / 100, ws.currency)}
                </p>
                {statement.warning && <p role="status" style={{ fontSize: 13 }}>{statement.warning}</p>}
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Full PDF totals before duplicate exclusions and your transaction rules. Selected totals below reflect what will be imported.</p>
              </div>
            )}
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Assign all transactions to account</label>
                <select value={cardId} onChange={(e) => changeCard(e.target.value)}>
                  <option value="" disabled>Select an account</option>
                  {ws.cards.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {statement?.bank === 'KBC' && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {cardId && /\bkbc\b/i.test(ws.cards.find((c) => c.id === cardId)?.name ?? '')
                      ? 'KBC statement matched to your KBC account.'
                      : 'Choose the KBC account for this statement. If it is missing, add it in Settings first.'}
                  </p>
                )}
              </div>
              <div className="field">
                <label>Found</label>
                <div style={{ paddingTop: 8, fontSize: 13, fontWeight: 700 }}>
                  {rows.filter((r) => r.include).length} of {rows.length} transactions selected ·{' '}
                  <span className="positive">+{formatCurrency(totalIncome, ws.currency)}</span> /{' '}
                  <span className="negative">-{formatCurrency(totalExpense, ws.currency)}</span>
                  {duplicateCount > 0 && (
                    <span className="sub" style={{ marginLeft: 6, fontWeight: 600 }}>
                      ({duplicateCount} already imported, unchecked)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="scroll-x" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={r.duplicate ? { opacity: 0.5 } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(i, { include: e.target.checked })}
                        />
                      </td>
                      <td>{r.date}</td>
                      <td>
                        {r.description}
                        {r.duplicate && (
                          <span className="tag" style={{ marginLeft: 6, background: 'var(--bg-soft)', color: 'var(--text-muted)' }}>
                            already imported
                          </span>
                        )}
                      </td>
                      <td>
                        <select
                          value={r.type}
                          onChange={(e) => {
                            const type = e.target.value as EntryType
                            updateRow(i, {
                              type,
                              categoryId: guessCategoryId(r.description, type, ws.categories, ws.categoryRules) ?? '',
                            })
                          }}
                        >
                          <option value="income">Income</option>
                          <option value="expense">Expense</option>
                          <option value="ignore">Ignore (neutral)</option>
                        </select>
                      </td>
                      <td>
                        <select value={r.categoryId} onChange={(e) => updateRow(i, { categoryId: e.target.value })}>
                          {ws.categories
                            .filter((c) => c.type === r.type)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td className={`amount ${r.type === 'income' ? 'positive' : 'negative'}`}>
                        {r.type === 'income' ? '+' : '-'}
                        {formatCurrency(r.amount, ws.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          {rows && (
            <button className="btn accent" onClick={importRows} disabled={!cardId}>
              Import {rows.filter((r) => r.include).length} Transactions
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

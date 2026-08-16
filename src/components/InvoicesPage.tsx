import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, Invoice, InvoiceStatus, InvoiceType, WorkspaceData } from '../types'
import { monthLabel, updateActiveWorkspace } from '../storage'
import { formatCurrency } from '../utils'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

/** An invoice counts as overdue if explicitly marked, or unpaid with a due date in the past. */
export function isOverdue(inv: Invoice): boolean {
  if (inv.status === 'overdue') return true
  if (inv.status === 'paid') return false
  return !!inv.dueDate && inv.dueDate < new Date().toISOString().slice(0, 10)
}

function nextInvoiceNumber(invoices: Invoice[], type: InvoiceType): string {
  const year = new Date().getFullYear()
  const prefix = type === 'income' ? `INV-${year}-` : `BILL-${year}-`
  let max = 0
  for (const inv of invoices) {
    if (inv.number?.startsWith(prefix)) {
      const n = parseInt(inv.number.slice(prefix.length), 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Downloads a stored data-URL file reliably by converting it to a Blob first.
 *  (Large `data:` URLs and opening them in a tab are blocked by browsers; a Blob URL is not.) */
function downloadDataUrl(dataUrl: string, fileName: string) {
  try {
    const [meta, b64] = dataUrl.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] ?? 'application/octet-stream'
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([arr], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    // Fallback: direct data-URL download (works for small files).
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = fileName
    a.click()
  }
}

/** Opens a stored data-URL file in a new tab via a Blob URL (browsers block `data:` navigation). */
function openDataUrl(dataUrl: string) {
  try {
    const [meta, b64] = dataUrl.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] ?? 'application/octet-stream'
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([arr], { type: mime }))
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    /* ignore */
  }
}

export default function InvoicesPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  const allInvoices = ws.invoices ?? []

  // Build sorted list of months that have invoices
  const months = Array.from(new Set(allInvoices.map((i) => i.date.slice(0, 7)))).sort().reverse()

  const invoices = selectedMonth === 'all' ? allInvoices : allInvoices.filter((i) => i.date.startsWith(selectedMonth))
  const byDateDesc = (a: Invoice, b: Invoice) => b.date.localeCompare(a.date)
  const incomeInvoices = invoices.filter((i) => i.type === 'income').sort(byDateDesc)
  const expenseInvoices = invoices.filter((i) => i.type === 'expense').sort(byDateDesc)

  const totalIncome = incomeInvoices.reduce((s, i) => s + i.amount, 0)
  const totalExpenses = expenseInvoices.reduce((s, i) => s + i.amount, 0)
  const paidIncome = incomeInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
  const unpaidIncome = totalIncome - paidIncome
  const overdueCount = invoices.filter(isOverdue).length
  const outstanding = invoices
    .filter((i) => i.status !== 'paid')
    .reduce((s, i) => s + (i.type === 'income' ? i.amount : -i.amount), 0)

  function addInvoice(type: InvoiceType) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        invoices: [
          ...(w.invoices ?? []),
          {
            id: uuid(),
            type,
            number: nextInvoiceNumber(w.invoices ?? [], type),
            party: type === 'income' ? 'New Client' : 'New Vendor',
            description: '',
            amount: 0,
            date: new Date().toISOString().slice(0, 10),
            status: 'unpaid',
          },
        ],
      })),
    )
  }

  function updateInvoice(id: string, updates: Partial<Invoice>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        invoices: (w.invoices ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function removeInvoice(id: string) {
    if (!confirm('Delete this invoice? This cannot be undone from the invoice list.')) return
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        invoices: (w.invoices ?? []).filter((i) => i.id !== id),
      })),
    )
  }

  function exportCsv() {
    const rows = [
      ['Number', 'Type', 'Party', 'Description', 'Date', 'Due date', 'Amount', 'Currency', 'Status', 'Overdue'],
      ...[...invoices].sort(byDateDesc).map((i) => [
        i.number ?? '', i.type, i.party, i.description, i.date, i.dueDate ?? '',
        i.amount.toFixed(2), ws.currency, i.status, isOverdue(i) ? 'yes' : 'no',
      ]),
    ]
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices-${ws.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${selectedMonth === 'all' ? 'all' : selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Month-by-month accounting summary (always across all invoices)
  const monthlySummary = months.map((m) => {
    const list = allInvoices.filter((i) => i.date.startsWith(m))
    const inc = list.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0)
    const exp = list.filter((i) => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
    const open = list.filter((i) => i.status !== 'paid').reduce((s, i) => s + (i.type === 'income' ? i.amount : -i.amount), 0)
    return { m, inc, exp, net: inc - exp, open, count: list.length }
  })

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Invoices</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="table-input"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="all">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
          {invoices.length > 0 && (
            <button className="btn ghost small" onClick={exportCsv} title="Export the current view as CSV for your accountant">
              ⬇ Export CSV
            </button>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Income Invoices</div>
          <div className="value positive">{fmt(totalIncome)}</div>
          <div className="sub">{fmt(paidIncome)} paid · {fmt(unpaidIncome)} open</div>
        </div>
        <div className="stat-card">
          <div className="label">Expense Invoices</div>
          <div className="value negative">{fmt(totalExpenses)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net (income − expenses)</div>
          <div className={`value ${totalIncome - totalExpenses >= 0 ? 'positive' : 'negative'}`}>
            {fmt(totalIncome - totalExpenses)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Outstanding</div>
          <div className={`value ${outstanding >= 0 ? 'positive' : 'negative'}`}>
            {fmt(outstanding)}
          </div>
          <div className="sub">unpaid + overdue{overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}</div>
        </div>
      </div>

      <div className="panel panel-assets">
        <div className="panel-header">
          <h2>Income Invoices</h2>
          <p>Money owed to the business by clients.</p>
          <button className="btn secondary small" onClick={() => addInvoice('income')}>
            + Add Income Invoice
          </button>
        </div>
        <InvoiceTable
          invoices={incomeInvoices}
          partyLabel="Client"
          currency={curr}
          onUpdate={updateInvoice}
          onRemove={removeInvoice}
        />
      </div>

      <div className="panel panel-liabilities">
        <div className="panel-header">
          <h2>Expense Invoices</h2>
          <p>Money the business owes to vendors/suppliers.</p>
          <button className="btn secondary small" onClick={() => addInvoice('expense')}>
            + Add Expense Invoice
          </button>
        </div>
        <InvoiceTable
          invoices={expenseInvoices}
          partyLabel="Vendor"
          currency={curr}
          onUpdate={updateInvoice}
          onRemove={removeInvoice}
        />
      </div>

      {monthlySummary.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Monthly Summary</h2>
            <p>Invoice totals per month — your month-by-month accounting overview. Click a month to filter.</p>
          </div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Invoices</th>
                  <th style={{ textAlign: 'right' }}>Income</th>
                  <th style={{ textAlign: 'right' }}>Expenses</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                  <th style={{ textAlign: 'right' }}>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {monthlySummary.map((r) => (
                  <tr
                    key={r.m}
                    onClick={() => setSelectedMonth(selectedMonth === r.m ? 'all' : r.m)}
                    style={{ cursor: 'pointer', background: selectedMonth === r.m ? 'var(--accent-soft)' : undefined }}
                  >
                    <td style={{ fontWeight: selectedMonth === r.m ? 700 : 500 }}>{monthLabel(r.m)}</td>
                    <td className="amount">{r.count}</td>
                    <td className="amount positive">{formatCurrency(r.inc, ws.currency)}</td>
                    <td className="amount negative">{formatCurrency(r.exp, ws.currency)}</td>
                    <td className={`amount ${r.net >= 0 ? 'positive' : 'negative'}`} style={{ fontWeight: 700 }}>{formatCurrency(r.net, ws.currency)}</td>
                    <td className={`amount ${r.open >= 0 ? 'positive' : 'negative'}`}>{formatCurrency(r.open, ws.currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td className="amount"><strong>{allInvoices.length}</strong></td>
                  <td className="amount positive"><strong>{formatCurrency(monthlySummary.reduce((s, r) => s + r.inc, 0), ws.currency)}</strong></td>
                  <td className="amount negative"><strong>{formatCurrency(monthlySummary.reduce((s, r) => s + r.exp, 0), ws.currency)}</strong></td>
                  <td className="amount"><strong>{formatCurrency(monthlySummary.reduce((s, r) => s + r.net, 0), ws.currency)}</strong></td>
                  <td className="amount"><strong>{formatCurrency(monthlySummary.reduce((s, r) => s + r.open, 0), ws.currency)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export function InvoiceTable({
  invoices,
  partyLabel,
  currency,
  onUpdate,
  onRemove,
}: {
  invoices: Invoice[]
  partyLabel: string
  currency: string
  onUpdate: (id: string, updates: Partial<Invoice>) => void
  onRemove: (id: string) => void
}) {
  if (invoices.length === 0) return <div className="empty-state">No invoices yet.</div>

  return (
    <div className="scroll-x">
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>{partyLabel}</th>
            <th>Description</th>
            <th>Date</th>
            <th>Due</th>
            <th style={{ textAlign: 'right' }}>Amount</th>
            <th>Status</th>
            <th>File</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => {
            const overdue = isOverdue(inv)
            return (
            <tr key={inv.id} style={overdue ? { background: '#ef444410' } : undefined}>
              <td>
                <input
                  type="text"
                  className="table-input"
                  style={{ maxWidth: 120, fontVariantNumeric: 'tabular-nums' }}
                  value={inv.number ?? ''}
                  placeholder="INV-…"
                  onChange={(e) => onUpdate(inv.id, { number: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="table-input"
                  style={{ maxWidth: 130 }}
                  value={inv.party}
                  onChange={(e) => onUpdate(inv.id, { party: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  className="table-input"
                  style={{ maxWidth: 180 }}
                  value={inv.description}
                  onChange={(e) => onUpdate(inv.id, { description: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="date"
                  className="table-input"
                  value={inv.date}
                  onChange={(e) => onUpdate(inv.id, { date: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="date"
                  className="table-input"
                  value={inv.dueDate ?? ''}
                  onChange={(e) => onUpdate(inv.id, { dueDate: e.target.value || undefined })}
                  style={overdue ? { color: 'var(--red)', fontWeight: 600 } : undefined}
                />
              </td>
              <td className={`amount ${inv.type === 'income' ? 'positive' : 'negative'}`}>
                <input
                  type="number"
                  step="0.01"
                  className="table-input amount-input"
                  style={{ maxWidth: 100 }}
                  value={inv.amount}
                  onChange={(e) => onUpdate(inv.id, { amount: parseFloat(e.target.value) || 0 })}
                />
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <select
                    className="table-input"
                    value={inv.status}
                    onChange={(e) => onUpdate(inv.id, { status: e.target.value as InvoiceStatus })}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  {overdue && inv.status !== 'overdue' && (
                    <span title="Past due date" style={{ color: 'var(--red)', fontSize: 12, fontWeight: 700 }}>⚠</span>
                  )}
                </div>
              </td>
              <td>
                {inv.fileName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, maxWidth: 150 }}>
                    <button
                      type="button"
                      onClick={() => inv.fileData && openDataUrl(inv.fileData)}
                      title={`Open ${inv.fileName}`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1,
                        padding: '3px 8px', borderRadius: 6, background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                        color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden',
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>📎</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv.fileName}</span>
                    </button>
                    <button
                      className="btn ghost small"
                      title="Download file"
                      style={{ flexShrink: 0 }}
                      onClick={() => inv.fileData && downloadDataUrl(inv.fileData, inv.fileName!)}
                    >
                      ⬇
                    </button>
                    <button
                      className="btn ghost small"
                      title="Remove file"
                      style={{ flexShrink: 0 }}
                      onClick={() => onUpdate(inv.id, { fileName: undefined, fileData: undefined })}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="btn ghost small" style={{ cursor: 'pointer' }}>
                    Upload
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          onUpdate(inv.id, { fileName: file.name, fileData: reader.result as string })
                        }
                        reader.readAsDataURL(file)
                      }}
                    />
                  </label>
                )}
              </td>
              <td className="actions">
                <button className="btn ghost small" onClick={() => onRemove(inv.id)}>
                  ✕
                </button>
              </td>
            </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>
              <strong>Total</strong>
            </td>
            <td className={`amount ${invoices[0]?.type === 'income' ? 'positive' : 'negative'}`}>
              <strong>{formatCurrency(invoices.reduce((s, i) => s + i.amount, 0), currency)}</strong>
            </td>
            <td colSpan={3}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

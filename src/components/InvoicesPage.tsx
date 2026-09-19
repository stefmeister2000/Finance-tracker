import NewFolder from './NewFolder'
import { invoiceFolders, invoiceFolder, deleteInvoiceFolder } from '../folders'
import { downloadDataUrl, openDataUrl } from '../fileDownloads'
import { useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AccountingDocument, AppData, Invoice, InvoiceStatus, InvoiceType, WorkspaceData } from '../types'
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

export default function InvoicesPage({ data, ws, setData }: Props) {
  const uploadInput = useRef<HTMLInputElement>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState<string | null>(null)
  const [folder, setFolder] = useState<AccountingDocument['folder'] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [fileView, setFileView] = useState<'list' | 'cards'>('cards')
  const documents = ws.accountingDocuments ?? []
  const invoices = ws.invoices ?? []
  const folders = month ? invoiceFolders(ws, month) : []
  const activeFolder = folders.find((f) => f.id === folder)
  const folderInvoices = invoices.filter((i) => i.date.slice(0, 7) === month && invoiceFolder(i) === folder)
  const files = documents.filter((d) => d.month === month && d.folder === folder).sort((a, b) => a.name.localeCompare(b.name))
  const visibleFiles = files.filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
  const count = (m: string, f?: AccountingDocument['folder']) =>
    documents.filter((d) => d.month === m && (!f || d.folder === f)).length +
    invoices.filter((i) => i.date.slice(0, 7) === m && (!f || invoiceFolder(i) === f)).length

  function updateInvoice(id: string, updates: Partial<Invoice>) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, invoices: (w.invoices ?? []).map((i) => i.id === id ? { ...i, ...updates } : i) })))
  }
  function removeInvoice(id: string) {
    if (confirm('Delete this invoice and its attachment?')) setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, invoices: (w.invoices ?? []).filter((i) => i.id !== id) })))
  }
  async function upload(list: FileList | null) {
    if (!list?.length || !month || !folder || busy) return
    const destination = { month, folder }
    const workspaceId = data.activeWorkspace
    setBusy(true)
    setError('')
    try {
      const selected = Array.from(list)
      if (selected.some((f) => f.size > 10 * 1024 * 1024)) throw new Error('Please choose files smaller than 10 MB each.')
      if (selected.reduce((sum, f) => sum + f.size, 0) > 30 * 1024 * 1024) throw new Error('Please upload up to 30 MB at a time.')
      const added = await Promise.all(selected.map(async (file): Promise<AccountingDocument> => ({
        id: uuid(), ...destination, name: file.name, size: file.size, uploadedAt: new Date().toISOString(),
        data: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error(`Could not read ${file.name}. Please try again.`))
          reader.readAsDataURL(file)
        }),
      })))
      setData((prev) => {
        const workspace = prev.workspaces[workspaceId]
        if (!workspace) return prev
        return { ...prev, workspaces: { ...prev.workspaces, [workspaceId]: { ...workspace, accountingDocuments: [...(workspace.accountingDocuments ?? []), ...added] } } }
      })
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <div className="invoice-drive">
      <div className="page-header">
        <div><h2 style={{ margin: 0 }}>Invoices & files</h2><p className="drive-muted">All your accounting documents, organised by month.</p></div>
        <button className="btn ghost small" title="Restore this page in Settings → General" onClick={() => setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, hideInvoices: true })))}>Hide page</button>
      </div>
      <nav className="drive-path" aria-label="Folder path">
        <button className="btn ghost small" onClick={() => { setMonth(null); setFolder(null); setError(''); setSearch(''); setSearch('') }}>{ws.name} / {year}</button>
        {month && <><span>/</span><button className="btn ghost small" onClick={() => { setFolder(null); setError(''); setSearch('') }}>{monthLabel(month)}</button></>}
        {activeFolder && <><span>/</span><strong>{activeFolder.name}</strong></>}
      </nav>
      {month && <div className="folder-management">
        <NewFolder key={month} names={folders.map(f => f.name)} disabled={busy} onAdd={(name) => {
          const added = { id: uuid(), name, icon: '📁', hint: 'Uploaded documents' }
          setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, invoiceFolders: { ...w.invoiceFolders, [month]: [...invoiceFolders(w, month), added] } })))
          setFolder(added.id); setSearch('')
        }} />
        {folder && folder !== 'unfiled' && <button className="btn ghost small danger" disabled={busy} onClick={() => {
          if (!confirm(`Delete “${activeFolder?.name}” from ${monthLabel(month)}? Its files and invoice records will be moved to Unfiled. No files will be deleted.`)) return
          setData((prev) => updateActiveWorkspace(prev, (w) => deleteInvoiceFolder(w, month, folder)))
          setFolder(null); setSearch('')
        }}>Delete folder</button>}
      </div>}
      {!month ? <>
        <div className="drive-toolbar"><h3>Monthly folders</h3><label>Year <input aria-label="Folder year" type="number" min="2000" max="2100" value={year} onChange={(e) => { const y = Number(e.target.value); if (y >= 2000 && y <= 2100) setYear(y) }} /></label></div>
        <div className="drive-grid">
          {Array.from({ length: 12 }, (_, index) => {
            const m = `${year}-${String(index + 1).padStart(2, '0')}`
            return <button className="drive-folder" key={m} onClick={() => setMonth(m)}>
              <span className="drive-icon">📁</span><strong>{new Date(year, index, 1).toLocaleString('en', { month: 'long' })}</strong>
              <span className="drive-muted">{count(m)} items · {invoiceFolders(ws, m).length} folders</span>
            </button>
          })}
        </div>
      </> : !folder ? <>
        <h3>{monthLabel(month)}</h3>
        <div className="drive-grid">
          {folders.map((f) => <button className="drive-folder" key={f.id} onClick={() => { setFolder(f.id); setSearch('') }}>
            <span className="drive-icon">{f.icon}</span><strong>{f.name}</strong><span className="drive-muted">{f.hint}</span><span className="drive-muted">{count(month, f.id)} items</span>
          </button>)}
        </div>
      </> : <>
        <div className="drive-upload-bar" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files) }}>
          <span className="drive-upload-icon" aria-hidden="true">↑</span><div className="drive-upload-copy"><strong>{monthLabel(month)} / {activeFolder?.name}</strong><p className="drive-muted">Drop files here, or choose files to upload.</p></div>
          <button className="btn accent" disabled={busy} onClick={() => uploadInput.current?.click()}>{busy ? 'Uploading…' : '+ Upload files'}</button>
          <input ref={uploadInput} aria-label="Upload accounting files" type="file" multiple disabled={busy} style={{ display: 'none' }} onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />

        </div>
        {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="panel">
          <div className="drive-list-toolbar"><div className="view-switch" aria-label="Invoice file view"><button className={fileView === 'cards' ? 'active' : ''} aria-pressed={fileView === 'cards'} onClick={() => setFileView('cards')}>Cards</button><button className={fileView === 'list' ? 'active' : ''} aria-pressed={fileView === 'list'} onClick={() => setFileView('list')}>List</button></div><div><h3>Files <span className="drive-count">{files.length + folderInvoices.length}</span></h3><p className="drive-muted">{activeFolder?.name} · {monthLabel(month)}</p></div><input type="search" aria-label="Search uploaded files" placeholder="Search uploaded files…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          {!files.length && !folderInvoices.length && <div className="empty-state">This folder is ready for your {monthLabel(month)} files.</div>}
          {search && !visibleFiles.length && <p className="empty-state">No uploaded files match “{search}”.</p>}
          <div className={`drive-files ${fileView === 'cards' ? 'invoice-file-cards' : ''}`}>
            {visibleFiles.map((file) => <div className="drive-file" key={file.id}>
              <span>📄</span><div className="drive-file-name"><button className="btn ghost small" onClick={() => openDataUrl(file.data)}>{file.name}</button><div className="drive-muted">{Math.max(1, Math.round(file.size / 1024))} KB · Uploaded {new Date(file.uploadedAt).toLocaleDateString()}</div></div>
              <button className="btn ghost small" onClick={() => downloadDataUrl(file.data, file.name)}>Download</button>
              <button className="btn ghost small danger" aria-label={`Delete ${file.name}`} onClick={() => { if (confirm(`Delete ${file.name}?`)) setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, accountingDocuments: (w.accountingDocuments ?? []).filter((d) => d.id !== file.id) }))) }}>✕</button>
            </div>)}
            {folderInvoices.map((invoice) => <div className="drive-file" key={invoice.id}>
              <span>🧾</span><div className="drive-file-name"><strong>{invoice.fileName || invoice.number || invoice.party}</strong><div className="drive-muted">{invoice.party} · {invoice.date} · {formatCurrency(invoice.amount, ws.currency)} · {invoice.status}</div></div>
              {invoice.fileData && <><button className="btn ghost small" onClick={() => openDataUrl(invoice.fileData!)}>Open</button><button className="btn ghost small" onClick={() => downloadDataUrl(invoice.fileData!, invoice.fileName || 'invoice.pdf')}>Download</button></>}
            </div>)}
          </div>
        </div>
        <p className="drive-muted drive-storage-note">File storage only · Use Import Statement to add bank transactions.</p>
        {(folder === 'sales' || folder === 'b2b' || folderInvoices.length > 0) && <details className="panel"><summary style={{ cursor: 'pointer', fontWeight: 600 }}>Invoice details & payment tracking</summary>
          <p className="drive-muted">Manage amounts, due dates and payment status for this month.</p>
          <button className="btn secondary small" onClick={() => {
            const type = folder === 'sales' ? 'income' : 'expense'
            setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, invoices: [...(w.invoices ?? []), { id: uuid(), type, accountingFolder: folder, number: nextInvoiceNumber(w.invoices ?? [], type), party: '', description: '', amount: 0, date: `${month}-01`, status: 'unpaid' }] })))
          }}>+ Add invoice record</button>
          <InvoiceTable invoices={folderInvoices} partyLabel={folder === 'sales' ? 'Client' : 'Vendor'} currency={ws.currency} onUpdate={updateInvoice} onRemove={removeInvoice} />
        </details>}
      </>}
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

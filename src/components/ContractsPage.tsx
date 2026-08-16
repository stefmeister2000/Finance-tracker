import { useEffect, useRef, useState } from 'react'
import type { AppData, Contract, ContractStatus, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

const CONTRACT_TYPES = ['Client', 'Supplier', 'Employment', 'NDA', 'Service Agreement', 'Lease', 'Partnership', 'Other']
const STATUS_COLORS: Record<ContractStatus, string> = {
  active: '#22c55e',
  pending: '#f59e0b',
  expired: '#94a3b8',
  terminated: '#ef4444',
}

const EMPTY: Omit<Contract, 'id'> = {
  title: '',
  party: '',
  type: 'Client',
  signedDate: '',
  expiryDate: '',
  status: 'active',
  notes: '',
  signed: false,
  bodyText: '',
  signatureDataUrl: undefined,
  signedByName: '',
  signedAt: undefined,
}

/** A contract counts as signed if flagged explicitly (uploads) or signed in-app (written contracts). */
function isSigned(c: Pick<Contract, 'signed' | 'signedAt' | 'signatureDataUrl' | 'signedByName'>): boolean {
  return c.signed ?? !!(c.signedAt || c.signatureDataUrl || c.signedByName?.trim())
}

function defaultTemplate(title: string, party: string, ownerName: string, date: string): string {
  return `AGREEMENT: ${title || '[Contract Title]'}

This agreement is made on ${date || '[Date]'} between:

${ownerName || '[Your Name / Company]'} ("Party A")
and
${party || '[Other Party]'} ("Party B")

1. PURPOSE
Describe the purpose and scope of this agreement here.

2. TERMS
Outline the key terms, deliverables, and obligations of each party.

3. PAYMENT
Specify payment amounts, schedule, and method, if applicable.

4. DURATION
State the start date, end date, or renewal conditions.

5. CONFIDENTIALITY
Both parties agree to keep shared information confidential.

6. SIGNATURES
By signing below, both parties agree to the terms outlined above.`
}

/** A simple canvas-based signature pad supporting mouse and touch input. */
function SignaturePad({ value, onChange }: { value?: string; onChange: (dataUrl: string | undefined) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (value) {
      const img = new Image()
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0) }
      img.src = value
    }
  }, [])

  function getPoint(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY
    if (clientX === undefined || clientY === undefined) return null
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) }
  }

  function start(e: React.MouseEvent | React.TouchEvent) {
    drawing.current = true
    lastPoint.current = getPoint(e)
  }

  function move(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const point = getPoint(e)
    if (!ctx || !point || !lastPoint.current) return
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPoint.current = point
  }

  function end() {
    if (!drawing.current) return
    drawing.current = false
    lastPoint.current = null
    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    onChange(undefined)
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={400}
        height={140}
        style={{ width: '100%', maxWidth: 400, height: 140, border: '1px solid var(--border)', borderRadius: 8, background: '#fff', cursor: 'crosshair', touchAction: 'none' }}
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />
      <button className="btn ghost small" style={{ marginTop: 6 }} onClick={clear}>Clear signature</button>
    </div>
  )
}

function printContract(c: Contract) {
  const win = window.open('', '_blank')
  if (!win) return
  const signatureBlock = c.signatureDataUrl
    ? `<img src="${c.signatureDataUrl}" style="height:60px;display:block;margin-bottom:4px" />`
    : c.signedByName
      ? `<div style="font-family:'Brush Script MT',cursive;font-size:28px;margin-bottom:4px">${c.signedByName}</div>`
      : ''
  win.document.write(`
    <html><head><title>${c.title}</title>
    <style>
      body { font-family: Georgia, serif; max-width: 680px; margin: 40px auto; line-height: 1.6; color: #1a1a1a; white-space: pre-wrap; }
      h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 8px; }
      .sig-row { margin-top: 50px; border-top: 1px solid #999; padding-top: 14px; font-size: 13px; color: #555; }
    </style></head>
    <body>
      <h1>${c.title}</h1>
      <div>${(c.bodyText ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
      <div class="sig-row">
        ${signatureBlock}
        <div>${c.signedByName ?? ''}${c.signedAt ? ` — signed ${new Date(c.signedAt).toLocaleString()}` : ''}</div>
      </div>
    </body></html>
  `)
  win.document.close()
  win.focus()
  win.print()
}

export default function ContractsPage({ data, ws, setData }: Props) {
  const contracts = ws.contracts ?? []
  const [form, setForm] = useState<Omit<Contract, 'id'>>(EMPTY)
  const [editId, setEditId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [filterStatus, setFilterStatus] = useState<ContractStatus | 'all'>('all')
  const [viewId, setViewId] = useState<string | null>(null)
  const [mode, setMode] = useState<'upload' | 'write'>('upload')
  const [titleError, setTitleError] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = contracts
    .filter((c) => {
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (filterType !== 'All' && c.type !== filterType) return false
      const q = search.toLowerCase()
      return !q || c.title.toLowerCase().includes(q) || c.party.toLowerCase().includes(q) || c.notes?.toLowerCase().includes(q)
    })
    .sort((a, b) => (b.signedDate || '').localeCompare(a.signedDate || ''))


  function save() {
    if (!form.title.trim()) {
      setTitleError(true)
      return
    }
    setTitleError(false)
    // In-app signature always counts as signed, regardless of the upload toggle.
    const payload = { ...form, signed: form.signed || !!(form.signedAt || form.signatureDataUrl || form.signedByName?.trim()) }
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const list = w.contracts ?? []
        if (editId) {
          return { ...w, contracts: list.map((c) => c.id === editId ? { ...payload, id: editId } : c) }
        }
        return { ...w, contracts: [...list, { ...payload, id: crypto.randomUUID() }] }
      })
    )
    setForm(EMPTY)
    setEditId(null)
  }

  function startEdit(c: Contract) {
    setForm({
      title: c.title, party: c.party, type: c.type, signedDate: c.signedDate, expiryDate: c.expiryDate ?? '',
      status: c.status, notes: c.notes ?? '', signed: isSigned(c), fileName: c.fileName, fileData: c.fileData,
      bodyText: c.bodyText ?? '', signatureDataUrl: c.signatureDataUrl, signedByName: c.signedByName ?? '', signedAt: c.signedAt,
    })
    setMode(c.bodyText ? 'write' : 'upload')
    setEditId(c.id)
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  function remove(id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, contracts: (w.contracts ?? []).filter((c) => c.id !== id) })))
    if (editId === id) { setForm(EMPTY); setEditId(null) }
    if (viewId === id) setViewId(null)
  }

  function cancel() { setForm(EMPTY); setEditId(null); setMode('upload') }

  function insertTemplate() {
    const today = new Date().toISOString().slice(0, 10)
    setForm((f) => ({
      ...f,
      bodyText: defaultTemplate(f.title, f.party, data.userName ?? '', f.signedDate || today),
    }))
  }

  function signNow() {
    const today = new Date().toISOString().slice(0, 10)
    setForm((f) => ({
      ...f,
      signedByName: f.signedByName || data.userName || '',
      signedDate: f.signedDate || today,
      signedAt: new Date().toISOString(),
    }))
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 15 * 1024 * 1024) {
      alert('This file is larger than 15 MB. Please compress the PDF first — very large files slow down saving.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      // Auto-fill the title from the filename if the user hasn't typed one yet,
      // so uploading a file is enough to save a contract.
      const derivedTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim()
      setForm((f) => ({
        ...f,
        fileName: file.name,
        fileData: ev.target?.result as string,
        title: f.title.trim() ? f.title : derivedTitle,
      }))
    }
    reader.readAsDataURL(file)
  }

  function removeFile() {
    setForm((f) => ({ ...f, fileName: undefined, fileData: undefined }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateStatus(id: string, status: ContractStatus) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w, contracts: (w.contracts ?? []).map((c) => c.id === id ? { ...c, status } : c),
      }))
    )
  }

  const counts = { active: 0, pending: 0, expired: 0, terminated: 0 }
  for (const c of contracts) counts[c.status]++

  const isExpiringSoon = (c: Contract) => {
    if (!c.expiryDate || c.status !== 'active') return false
    const days = (new Date(c.expiryDate).getTime() - Date.now()) / 86400000
    return days >= 0 && days <= 30
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Contracts</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
          Store, track and manage all your business contracts and agreements.
        </p>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Contracts</div>
          <div className="value">{contracts.length}</div>
        </div>
        {(Object.entries(counts) as [ContractStatus, number][]).map(([status, count]) => (
          <div key={status} className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS[status]}` }}>
            <div className="label" style={{ textTransform: 'capitalize' }}>{status}</div>
            <div className="value" style={{ color: STATUS_COLORS[status] }}>{count}</div>
          </div>
        ))}
        {contracts.filter(isExpiringSoon).length > 0 && (
          <div className="stat-card" style={{ borderLeft: '4px solid #f59e0b', background: '#f59e0b11' }}>
            <div className="label">⚠ Expiring Soon</div>
            <div className="value" style={{ color: '#f59e0b' }}>{contracts.filter(isExpiringSoon).length}</div>
            <div className="sub">within 30 days</div>
          </div>
        )}
      </div>

      {/* Add / Edit form */}
      <div className="panel" ref={formRef}>
        <div className="panel-header">
          <h2>{editId ? 'Edit Contract' : 'Add Contract'}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Contract Title</label>
            <input type="text" className="table-input" placeholder="e.g. Doctor Service Agreement" value={form.title} onChange={(e) => { setForm({ ...form, title: e.target.value }); if (titleError) setTitleError(false) }} style={titleError ? { borderColor: 'var(--red)' } : undefined} />
          </div>
          <div className="field">
            <label>Other Party (optional)</label>
            <input type="text" className="table-input" placeholder="Company or person name" value={form.party} onChange={(e) => setForm({ ...form, party: e.target.value })} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ContractStatus })}>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
          <div className="field">
            <label>Signed Date</label>
            <input type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} />
          </div>
          <div className="field">
            <label>Expiry Date (optional)</label>
            <input type="date" value={form.expiryDate ?? ''} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Notes</label>
            <input type="text" className="table-input" placeholder="Key terms, renewal conditions, etc." value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Contract Document</label>
            <div className="tabs" style={{ marginBottom: 10 }}>
              <button className={mode === 'upload' ? 'active' : ''} onClick={() => setMode('upload')}>📎 Upload File</button>
              <button className={mode === 'write' ? 'active' : ''} onClick={() => setMode('write')}>✍️ Write &amp; Sign</button>
            </div>

            {mode === 'upload' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {form.fileName ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <span style={{ fontSize: 20 }}>📎</span>
                    <span style={{ flex: 1, fontSize: 13 }}>{form.fileName}</span>
                    <button className="btn ghost small" onClick={removeFile}>Remove</button>
                  </div>
                ) : (
                  <div
                    style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '16px 20px', textAlign: 'center', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    📂 Click to upload or drag a file here
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt" style={{ display: 'none' }} onChange={handleFile} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className={`btn small ${form.signed ? 'secondary' : 'ghost'}`}
                    onClick={() => setForm({ ...form, signed: true })}
                    style={form.signed ? { borderColor: '#22c55e', color: '#22c55e', fontWeight: 700 } : undefined}
                  >
                    ✍️ Signed
                  </button>
                  <button
                    className={`btn small ${!form.signed ? 'secondary' : 'ghost'}`}
                    onClick={() => setForm({ ...form, signed: false })}
                    style={!form.signed ? { borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 700 } : undefined}
                  >
                    📝 Not signed yet
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Write the contract text below, then sign it digitally.</span>
                  <button className="btn ghost small" onClick={insertTemplate}>Insert template</button>
                </div>
                <textarea
                  className="table-input"
                  placeholder="Write or paste the contract content here…"
                  value={form.bodyText ?? ''}
                  onChange={(e) => setForm({ ...form, bodyText: e.target.value })}
                  rows={10}
                  style={{ fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'start' }}>
                  <div className="field">
                    <label>Draw signature</label>
                    <SignaturePad value={form.signatureDataUrl} onChange={(d) => setForm({ ...form, signatureDataUrl: d })} />
                  </div>
                  <div className="field">
                    <label>Signed by (typed name)</label>
                    <input
                      type="text" className="table-input" placeholder="Full name"
                      value={form.signedByName ?? ''}
                      onChange={(e) => setForm({ ...form, signedByName: e.target.value })}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <button className="btn secondary small" onClick={signNow}>✍️ Sign now (auto-fill name + date)</button>
                    </div>
                    {form.signedAt && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                        Signed {new Date(form.signedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <button className="btn accent" onClick={save}>
            {editId ? 'Save Changes' : '+ Add Contract'}
          </button>
          {editId && <button className="btn ghost" onClick={cancel}>Cancel</button>}
          {titleError && (
            <span style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600 }}>
              ⚠ Enter a Contract Title to save.
            </span>
          )}
        </div>
      </div>

      {/* Filters */}
      {contracts.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text" className="table-input" placeholder="Search contracts…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: 200, flex: 1, maxWidth: 320 }}
          />
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as ContractStatus | 'all')} style={{ minWidth: 120 }}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ minWidth: 140 }}>
            <option value="All">All types</option>
            {CONTRACT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Contract list */}
      {filtered.length === 0 ? (
        <div className="panel">
          <div className="empty-state">{contracts.length === 0 ? 'No contracts yet — add your first one above.' : 'No contracts match your filters.'}</div>
        </div>
      ) : (
        <div>
          {[
            { label: '📝 Awaiting Signature', color: '#f59e0b', list: filtered.filter((c) => !isSigned(c)) },
            { label: '✍️ Signed', color: '#22c55e', list: filtered.filter((c) => isSigned(c)) },
          ].filter((g) => g.list.length > 0).map((g) => (
            <div key={g.label} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${g.color}33` }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: g.color }}>{g.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.list.length} contract{g.list.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
          {g.list.map((c) => {
            const expiring = isExpiringSoon(c)
            const daysLeft = c.expiryDate ? Math.round((new Date(c.expiryDate).getTime() - Date.now()) / 86400000) : null
            const pastExpiry = c.status === 'active' && daysLeft !== null && daysLeft < 0
            return (
              <div key={c.id} style={{
                background: 'var(--bg-elevated)',
                border: expiring ? '1px solid #f59e0b' : '1px solid var(--border)',
                borderLeft: `4px solid ${STATUS_COLORS[c.status]}`,
                borderRadius: 10,
                padding: '14px 16px',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{c.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{c.party} · {c.type}</div>
                  {c.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{c.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                  {c.signedDate && <div style={{ fontSize: 12 }}><span style={{ color: 'var(--text-muted)' }}>Signed </span>{c.signedDate}</div>}
                  {c.expiryDate && (
                    <div style={{ fontSize: 12, color: pastExpiry ? '#ef4444' : expiring ? '#f59e0b' : 'var(--text-muted)', fontWeight: pastExpiry ? 700 : 400 }}>
                      {pastExpiry ? `⚠ Expired ${Math.abs(daysLeft!)}d ago — still marked active` : expiring ? `⚠ Expires in ${daysLeft}d` : `Expires ${c.expiryDate}`}
                    </div>
                  )}
                  <select
                    value={c.status}
                    onChange={(e) => updateStatus(c.id, e.target.value as ContractStatus)}
                    style={{ fontSize: 12, padding: '3px 6px', borderRadius: 6, border: `1px solid ${STATUS_COLORS[c.status]}`, color: STATUS_COLORS[c.status], background: `${STATUS_COLORS[c.status]}18`, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="terminated">Terminated</option>
                  </select>
                  {(c.fileData || c.bodyText) && (
                    <button
                      className="btn ghost small"
                      onClick={() => setViewId(viewId === c.id ? null : c.id)}
                    >
                      {c.bodyText ? '✍️' : '📎'} {viewId === c.id ? 'Hide' : 'View'}
                    </button>
                  )}
                  {c.bodyText && (
                    <button className="btn ghost small" onClick={() => printContract(c)}>🖨 Print / Save as PDF</button>
                  )}
                  {c.fileData && (
                    <a href={c.fileData} download={c.fileName ?? `${c.title}.pdf`} className="btn ghost small" title={`Download ${c.fileName ?? 'file'}`}>
                      ⬇ Download
                    </a>
                  )}
                  <button className="btn ghost small" onClick={() => startEdit(c)}>Edit</button>
                  <button className="btn ghost small danger" onClick={() => remove(c.id)}>Delete</button>
                </div>
                {viewId === c.id && c.bodyText && (
                  <div style={{ width: '100%', marginTop: 12, background: '#fff', color: '#1a1a1a', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' }}>
                    <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.bodyText}</div>
                    <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #ddd' }}>
                      {c.signatureDataUrl && <img src={c.signatureDataUrl} alt="Signature" style={{ height: 60, display: 'block', marginBottom: 4 }} />}
                      {!c.signatureDataUrl && c.signedByName && (
                        <div style={{ fontFamily: "'Brush Script MT', cursive", fontSize: 26, marginBottom: 4 }}>{c.signedByName}</div>
                      )}
                      <div style={{ fontSize: 12, color: '#666' }}>
                        {c.signedByName}{c.signedAt && ` — signed ${new Date(c.signedAt).toLocaleString()}`}
                      </div>
                    </div>
                  </div>
                )}
                {viewId === c.id && !c.bodyText && c.fileData && (
                  <div style={{ width: '100%', marginTop: 12 }}>
                    {c.fileData.startsWith('data:image') ? (
                      <img src={c.fileData} alt={c.fileName} style={{ maxWidth: '100%', borderRadius: 8 }} />
                    ) : c.fileData.startsWith('data:application/pdf') ? (
                      <iframe src={c.fileData} title={c.fileName} style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }} />
                    ) : (
                      <a href={c.fileData} download={c.fileName} className="btn secondary small">⬇ Download {c.fileName}</a>
                    )}
                  </div>
                )}
              </div>
            )
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

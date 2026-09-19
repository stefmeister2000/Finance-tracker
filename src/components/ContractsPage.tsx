import NewFolder from './NewFolder'
import { contractFolders, deleteContractFolder } from '../folders'
import { useRef, useState } from 'react'
import type { AppData, Contract, ContractStatus, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { downloadDataUrl, openDataUrl } from '../fileDownloads'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export default function ContractsPage({ data, ws, setData }: Props) {
  const contracts = ws.contracts ?? []
  const [folder, setFolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState<'table' | 'cards'>('table')
  const [status, setStatus] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [viewId, setViewId] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const folders = contractFolders(ws)
  const folderFiles = contracts.filter((c) => !folder || (c.type || 'Other') === folder)
  const visibleFiles = folderFiles.filter((c) => status === 'all' || c.status === status).filter((c) => `${c.fileName ?? ''} ${c.title} ${c.party}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => (a.fileName || a.title).localeCompare(b.fileName || b.title))
  const viewed = contracts.find((c) => c.id === viewId)

  async function upload(files: FileList | null) {
    if (!files?.length || !folder || busy) return
    const workspaceId = data.activeWorkspace
    const type = folder
    setBusy(true)
    setError('')
    try {
      const list = Array.from(files)
      if (list.some((f) => f.size > 15 * 1024 * 1024) || list.reduce((sum, f) => sum + f.size, 0) > 30 * 1024 * 1024) throw new Error('Choose files up to 15 MB each and 30 MB per upload.')
      const added = await Promise.all(list.map(async (file): Promise<Contract> => ({
        id: crypto.randomUUID(), type, status: 'pending', signed: false, signedDate: '', party: '',
        title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name,
        fileData: await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
          reader.readAsDataURL(file)
        }),
      })))
      setData((prev) => {
        const w = prev.workspaces[workspaceId]
        return w ? { ...prev, workspaces: { ...prev.workspaces, [workspaceId]: { ...w, contracts: [...(w.contracts ?? []), ...added] } } } : prev
      })
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed. Please try again.') }
    finally { setBusy(false) }
  }

  function update(id: string, patch: Partial<Pick<Contract, 'title' | 'party' | 'type' | 'status' | 'signed'>>) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, contracts: (w.contracts ?? []).map((c) => c.id === id ? { ...c, ...patch } : c) })))
  }
  const signed = (c: Contract) => c.signed ?? !!(c.signedAt || c.signatureDataUrl || c.signedByName?.trim())
  const open = (c: Contract) => c.fileData ? openDataUrl(c.fileData) : setViewId(c.id)
  const actions = (c: Contract) => <div className="file-actions"><button className="btn secondary small" onClick={() => open(c)}>Open</button>{c.fileData && <button className="btn ghost small" onClick={() => downloadDataUrl(c.fileData!, c.fileName || `${c.title}.pdf`)}>Download</button>}<button className="btn ghost small danger" aria-label={`Delete ${c.title}`} onClick={() => remove(c)}>Delete</button></div>
  const statusControl = (c: Contract) => <select className={`contract-status status-${c.status}`} aria-label={`Status for ${c.title}`} value={c.status} onChange={(e) => update(c.id, { status: e.target.value as ContractStatus })}><option value="pending">Pending</option><option value="active">Active</option><option value="expired">Expired</option><option value="terminated">Terminated</option></select>

  function remove(contract: Contract) {
    if (!confirm(`Delete ${contract.fileName || contract.title}?`)) return
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, contracts: (w.contracts ?? []).filter((c) => c.id !== contract.id) })))
  }

  return <div className="invoice-drive">
    <div className="page-header"><div><h2 style={{ margin: 0 }}>Contracts</h2><p className="drive-muted">Upload to a folder. Edit file details in the table, or browse cards.</p></div><span className="drive-count">{contracts.length} files</span></div>
    <nav className="drive-path" aria-label="Contract folder path"><button className="btn ghost small" onClick={() => { setFolder(null); setSearch(''); setError('') }}>{ws.name} / Contracts</button>{folder && <><span>/</span><strong>{folder}</strong></>}</nav>
    <div className="folder-management">
      <NewFolder names={folders} disabled={busy} onAdd={(name) => { setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, contractFolders: Array.from(new Set([...contractFolders(w), name])) }))); setFolder(name); setSearch(''); setStatus('all') }} />
      {folder && folder !== 'Unfiled' && <button className="btn ghost small danger" disabled={busy} onClick={() => {
        if (!confirm(`Delete the folder “${folder}”? Its contracts will be moved to Unfiled. No files will be deleted.`)) return
        setData((prev) => updateActiveWorkspace(prev, (w) => deleteContractFolder(w, folder)))
        setFolder(null)
      }}>Delete folder</button>}
    </div>
    {!folder && <div className="drive-grid contract-folders">
      {folders.map((name) => <button className="drive-folder" key={name} onClick={() => { setFolder(name); setSearch('') }}><span className="drive-icon">📁</span><strong>{name}</strong><span className="drive-muted">{contracts.filter((c) => (c.type || 'Other') === name).length} files</span></button>)}
    </div>}
    {folder && <>
      <div className="drive-upload-bar" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files) }}>
        <span className="drive-upload-icon" aria-hidden="true">↑</span><div className="drive-upload-copy"><strong>Contracts / {folder}</strong><p className="drive-muted">Drop files here, or choose files to upload.</p></div>
        <button className="btn accent" disabled={busy} onClick={() => input.current?.click()}>{busy ? 'Uploading…' : '+ Upload contracts'}</button>
        <input ref={input} type="file" multiple hidden disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
      </div>
      {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    </>}
      <div className="panel contract-library">
        <div className="drive-list-toolbar"><div><h3>{folder || 'All contracts'} <span className="drive-count">{visibleFiles.length}</span></h3><p className="drive-muted">{layout === 'table' ? 'Edit names, folders and status in place. Changes save automatically.' : 'Browse your uploaded agreements.'}</p></div><div className="view-switch" aria-label="Contract layout"><button aria-pressed={layout === 'table'} className={layout === 'table' ? 'active' : ''} onClick={() => setLayout('table')}>☷ Table</button><button aria-pressed={layout === 'cards'} className={layout === 'cards' ? 'active' : ''} onClick={() => setLayout('cards')}>▦ Cards</button></div></div>
        <div className="library-filters"><input type="search" aria-label="Search contracts" placeholder="Search name, file or company…" value={search} onChange={(e) => setSearch(e.target.value)} /><select aria-label="Filter contract status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="active">Active</option><option value="expired">Expired</option><option value="terminated">Terminated</option></select></div>
        {!visibleFiles.length && <div className="empty-state">{search || status !== 'all' ? 'No contracts match these filters.' : 'Choose a folder and upload your first contract.'}</div>}
        {visibleFiles.length > 0 && (layout === 'table' ? <div className="scroll-x"><table className="contracts-table"><thead><tr><th>Contract / file</th><th>Company or person</th><th>Folder</th><th>Status</th><th>Signed</th><th>Actions</th></tr></thead><tbody>
          {visibleFiles.map((c) => <tr key={c.id}>
            <td><input className="table-input contract-name" aria-label={`Contract name: ${c.title}`} value={c.title} onChange={(e) => update(c.id, { title: e.target.value })} /><div className="contract-filename" title={c.fileName}>{c.fileName || 'Saved document'}</div></td>
            <td><input className="table-input" aria-label={`Company or person for ${c.title}`} placeholder="Add company or person" value={c.party} onChange={(e) => update(c.id, { party: e.target.value })} /></td>
            <td><select className="table-input" aria-label={`Folder for ${c.title}`} value={c.type || 'Other'} onChange={(e) => update(c.id, { type: e.target.value })}>{folders.map((name) => <option key={name}>{name}</option>)}</select></td>
            <td>{statusControl(c)}</td><td><label className="signed-control"><input type="checkbox" checked={signed(c)} aria-label={`Signed status for ${c.title}`} onChange={(e) => update(c.id, { signed: e.target.checked })} />{signed(c) ? 'Signed' : 'Unsigned'}</label></td><td>{actions(c)}</td>
          </tr>)}
        </tbody></table></div> : <div className="contract-card-grid">{visibleFiles.map((c) => <article className="contract-file-card" key={c.id}><div className="contract-card-top"><span aria-hidden="true">📄</span>{statusControl(c)}</div><h3>{c.title || c.fileName}</h3><p>{c.party || 'No company added'} · {c.type || 'Other'}</p><div className="contract-filename" title={c.fileName}>{c.fileName || 'Saved document'}</div><span className={`signature-badge ${signed(c) ? 'is-signed' : ''}`}>{signed(c) ? '✓ Signed' : 'Unsigned'}</span>{actions(c)}</article>)}</div>)}
      </div>
    {viewed && <div className="modal-backdrop" onClick={() => setViewId(null)}><div className="modal wide" onClick={(e) => e.stopPropagation()}><h2>{viewed.title}</h2><div style={{ whiteSpace: 'pre-wrap', maxHeight: '55vh', overflowY: 'auto' }}>{viewed.bodyText || 'No file is attached to this existing record.'}{viewed.signatureDataUrl && <img src={viewed.signatureDataUrl} alt="Saved signature" style={{ display: 'block', maxHeight: 100 }} />}{viewed.signedByName && <p>{viewed.signedByName}</p>}</div><div className="modal-actions"><button className="btn secondary" onClick={() => setViewId(null)}>Close</button></div></div></div>}
  </div>
}

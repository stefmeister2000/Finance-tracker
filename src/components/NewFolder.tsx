import { useState } from 'react'

export default function NewFolder({ names, onAdd, disabled = false }: { names: string[]; onAdd: (name: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const duplicate = names.some(n => n.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) || name.trim().toLowerCase() === 'unfiled'
  return open ? <form className="new-folder-form" onSubmit={(e) => { e.preventDefault(); if (!name.trim() || duplicate || disabled) return; onAdd(name.trim()); setName(''); setOpen(false) }}>
    <input autoFocus aria-label="New folder name" placeholder="Folder name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
    <button className="btn accent small" disabled={!name.trim() || duplicate || disabled}>Create folder</button>
    <button type="button" className="btn ghost small" onClick={() => { setOpen(false); setName('') }}>Cancel</button>
    {duplicate && <span role="status" className="drive-muted">That folder name already exists or is reserved.</span>}
  </form> : <button className="btn secondary small" disabled={disabled} onClick={() => setOpen(true)}>+ New folder</button>
}

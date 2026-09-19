import { useRef, useState } from 'react'
import type { AppData, Workspace, WorkspaceData } from '../types'
import type { View } from '../App'
import { monthLabel, shiftMonth, sortedMonthIds, currentMonthId, workspaceOrder } from '../storage'
import AddMonthModal from './AddMonthModal'

function HideIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.8 4.3A11 11 0 0112 4c6 0 10 8 10 8a18 18 0 01-3.1 4M6.2 6.2A19 19 0 002 12s4 8 10 8a10 10 0 005.8-1.8" /></svg>
}

function SidebarLabel({ label, month = false }: { label: string; month?: boolean }) {
  const split = label.indexOf(' ')
  return <><span className="sidebar-item-icon" aria-hidden="true">{month ? '🗓️' : label.slice(0, split)}</span><span className="sidebar-item-label">{month ? label : label.slice(split + 1)}</span></>
}

const WORKSPACE_ICONS = [
  '🏢', '🏥', '💊', '🌿', '💼', '🛒', '🎯', '🚀', '💡', '🎨',
  '🏪', '🏬', '🏦', '🧬', '🌐', '⚡', '🔬', '🛡️', '🎓', '🌟',
  '👤', '💰', '📱', '🤝', '🧪', '✈️', '🏋️', '💻', '🍃', '🔑',
]

interface Props {
  data: AppData
  ws: WorkspaceData
  view: View
  setView: (v: View) => void
  onSetSidebarHidden: (id: string, hidden: boolean) => void
  onAddMonth: (id: string, copyFromPrev: boolean) => void
  onOpenSettings: () => void
  onSetWorkspace: (w: Workspace) => void
  onAddBusiness: (name: string) => void
  onRemoveWorkspace: (id: string) => void
  onRenameWorkspace: (id: string, name: string) => void
  onReorderWorkspaces: (newOrder: string[]) => void
  onSetWorkspaceIcon: (id: string, icon: string) => void
  onSetWorkspaceHidden: (id: string, hidden: boolean) => void
  lastSaved: Date | null
  saveFailed?: boolean
}

export default function Sidebar({
  data,
  ws,
  view,
  setView,
  onSetSidebarHidden,
  onAddMonth,
  onOpenSettings,
  onSetWorkspace,
  onAddBusiness,
  onRemoveWorkspace,
  onRenameWorkspace,
  onReorderWorkspaces,
  onSetWorkspaceIcon,
  onSetWorkspaceHidden,
  lastSaved,
  saveFailed,
}: Props) {
  const [customizing, setCustomizing] = useState(false)
  const isNavHidden = (id: string) => (ws.hiddenSidebarItems ?? []).includes(id) || (id === 'invoices' && !!ws.hideInvoices) || (id === 'contracts' && !!ws.hideContracts)
  const navItems: { id: string; label: string; section: string; view: View }[] = [
    { id: 'overview', label: '📊 Overview', section: 'General', view: { type: 'overview' } },
    ...(ws.kind === 'personal' ? [{ id: 'networth', label: '🏦 Net Worth', section: 'General', view: { type: 'networth' as const } }] : []),
    ...(ws.kind === 'business' ? [
      { id: 'invoices', label: '🧾 Invoices', section: 'Finance', view: { type: 'invoices' as const } },
      { id: 'contracts', label: '📄 Contracts', section: 'Finance', view: { type: 'contracts' as const } },
    ] : []),
    { id: 'subscriptions', label: '🔁 Subscriptions', section: 'Finance', view: { type: 'subscriptions' } },
    { id: 'budget', label: '💸 Fixed Costs', section: 'Finance', view: { type: 'budget' } },
    ...(ws.kind === 'business' ? ([
      ['adspend', '📣 Ad Spend', 'Marketing'], ['influencers', '🤝 Influencers', 'Marketing'],
      ['model', '📐 Financial Model', 'Business'], ['funding', '💰 Funding', 'Business'],
      ['retail', '🏪 Retail', 'Business'], ['inventory', '📦 Inventory', 'Business'],
      ['startup', '🚀 Startup Costs', 'Business'], ['tools', '🔧 Business Tools', 'Business'],
    ] as const).map(([id, label, section]) => ({ id, label, section, view: { type: id } })) : []),
    ...sortedMonthIds(ws.months).slice().reverse().map((id) => ({ id: `month:${id}`, label: monthLabel(id), section: 'Months', view: { type: 'month' as const, id } })),
  ]
  const [addOpen, setAddOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const dragId = useRef<string | null>(null)
  const ids = sortedMonthIds(ws.months).reverse()
  const hidden = new Set(data.hiddenWorkspaces ?? [])
  const order = workspaceOrder(data).filter((id) => !hidden.has(id))
  const hiddenOrder = workspaceOrder(data).filter((id) => hidden.has(id))
  const [showHidden, setShowHidden] = useState(false)

  function startRename(id: string, name: string) {
    setRenamingId(id)
    setRenameDraft(name)
  }

  function commitRename(id: string) {
    if (renameDraft.trim()) onRenameWorkspace(id, renameDraft.trim())
    setRenamingId(null)
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    dragId.current = id
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragId.current && dragId.current !== id) setDragOverId(id)
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const sourceId = dragId.current
    if (!sourceId || sourceId === targetId) {
      setDragOverId(null)
      return
    }
    const newOrder = [...order]
    const fromIdx = newOrder.indexOf(sourceId)
    const toIdx = newOrder.indexOf(targetId)
    newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, sourceId)
    onReorderWorkspaces(newOrder)
    setDragOverId(null)
    dragId.current = null
  }

  function handleDragEnd() {
    setDragOverId(null)
    dragId.current = null
  }

  return (
    <div className="sidebar">
      <div className="sidebar-title">
        <span className="logo">💰</span>
        <span>Finance Tracker</span>
      </div>

      <div className="workspace-list">
        {order.map((id) => {
          const w = data.workspaces[id]
          const active = data.activeWorkspace === id
          const icon = w.icon ?? (w.kind === 'personal' ? '👤' : '🏢')

          if (renamingId === id) {
            return (
              <input
                key={id}
                autoFocus
                className="workspace-rename-input"
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRename(id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(id)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
              />
            )
          }

          return (
            <div
              key={id}
              className={`workspace-item-wrap ${dragOverId === id ? 'drag-over' : ''}`}
              draggable
              onDragStart={(e) => handleDragStart(e, id)}
              onDragOver={(e) => handleDragOver(e, id)}
              onDrop={(e) => handleDrop(e, id)}
              onDragEnd={handleDragEnd}
            >
              <button
                className={`workspace-item ${active ? 'active' : ''}`}
                onClick={() => onSetWorkspace(id)}
                onDoubleClick={() => startRename(id, w.name)}
                title="Double-click to rename"
              >
                <span
                  className="workspace-icon"
                  title="Click to change icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIconPickerFor(iconPickerFor === id ? null : id)
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {icon}
                </span>
                <span className="workspace-name">{w.name}</span>
                {w.kind === 'business' && (
                  <span
                    role="button"
                    title="Hide this business from the sidebar"
                    className="workspace-remove"
                    style={{ marginLeft: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSetWorkspaceHidden(id, true)
                    }}
                  >
                    <HideIcon />
                  </span>
                )}
                {w.kind === 'business' && active && (
                  <span
                    role="button"
                    title="Remove business"
                    className="workspace-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Remove "${w.name}" and all its data?`)) onRemoveWorkspace(id)
                    }}
                  >
                    ✕
                  </span>
                )}
              </button>
              {iconPickerFor === id && (
                <div className="icon-picker-popover">
                  {WORKSPACE_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      className={`icon-picker-btn ${icon === emoji ? 'selected' : ''}`}
                      onClick={() => {
                        onSetWorkspaceIcon(id, emoji)
                        setIconPickerFor(null)
                      }}
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <button className="workspace-item workspace-add" onClick={() => onAddBusiness('New Business')}>
          <span className="workspace-icon">+</span>
          <span className="workspace-name">New Business</span>
        </button>
        {hiddenOrder.length > 0 && (
          <>
            <button
              className="workspace-item workspace-add"
              style={{ fontSize: 12 }}
              onClick={() => setShowHidden((v) => !v)}
            >
              <span className="workspace-icon"><HideIcon /></span>
              <span className="workspace-name">{showHidden ? 'Hide' : 'Show'} hidden ({hiddenOrder.length})</span>
            </button>
            {showHidden && hiddenOrder.map((id) => {
              const w = data.workspaces[id]
              const icon = w.icon ?? (w.kind === 'personal' ? '👤' : '🏢')
              return (
                <div key={id} className="workspace-item-wrap">
                  <button className="workspace-item" style={{ opacity: 0.7 }} onClick={() => { onSetWorkspaceHidden(id, false); onSetWorkspace(id) }}>
                    <span className="workspace-icon">{icon}</span>
                    <span className="workspace-name">{w.name}</span>
                    <span role="button" title="Unhide" className="workspace-remove" style={{ marginLeft: 'auto' }}
                      onClick={(e) => { e.stopPropagation(); onSetWorkspaceHidden(id, false) }}>
                      👁
                    </span>
                  </button>
                </div>
              )
            })}
          </>
        )}
      </div>
      <p className="workspace-hint">Double-click to rename · drag to reorder.</p>

      <div className="sidebar-nav">
        {['General', 'Finance', 'Marketing', 'Business', 'Months'].map((section) => {
          const visible = navItems.filter((item) => item.section === section && !isNavHidden(item.id))
          if (!visible.length) return null
          return <div key={section}>
            <div className="nav-section-label">{section}</div>
            {visible.map((item) => <div className="sidebar-page-row" key={item.id}>
              <button className={`nav-item ${view.type === item.view.type && (item.view.type !== 'month' || (view.type === 'month' && view.id === item.view.id)) ? 'active' : ''}`} onClick={() => setView(item.view)}><SidebarLabel label={item.label} month={item.view.type === 'month'} /></button>
              <button className="sidebar-hide btn ghost small" aria-label={`Hide ${item.label} from sidebar`} title="Hide from sidebar" onClick={() => onSetSidebarHidden(item.id, true)}><HideIcon /></button>
            </div>)}
          </div>
        })}
      </div>

      <div className="sidebar-footer">
        <button className="nav-item" onClick={() => setCustomizing(true)}><span>☰ Customize sidebar</span></button>
        {!isNavHidden('add-month') && <button className="nav-item" onClick={() => setAddOpen(true)}>
          <span>+ Add Month</span>
        </button>
        }
        {!isNavHidden('settings') && <button className="nav-item" onClick={onOpenSettings}>
          <span>⚙️ Settings</span>
        </button>
        }
        {saveFailed ? (
          <div className="saved-indicator" style={{ color: 'var(--red)', fontWeight: 700 }}>
            ⚠ Not saved to server — is it running?
          </div>
        ) : lastSaved && (
          <div className="saved-indicator">
            <span className="dot" style={{ borderRadius: '50%' }} />
            Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>

      {customizing && <div className="modal-backdrop" onClick={() => setCustomizing(false)}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>Customize sidebar</h2><p className="drive-muted">Choose what appears in {ws.name}. Hiding an item keeps all its data.</p>
          <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'grid', gap: 12 }}>
            {[...navItems, { id: 'add-month', label: '+ Add Month' }, { id: 'settings', label: '⚙️ Settings' }].map((item) => <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={!isNavHidden(item.id)} onChange={(e) => onSetSidebarHidden(item.id, !e.target.checked)} />{item.label}
            </label>)}
          </div>
          <div className="modal-actions"><button className="btn accent" onClick={() => setCustomizing(false)}>Done</button></div>
        </div>
      </div>}
      {addOpen && (
        <AddMonthModal
          defaultMonth={ids.length ? shiftMonth(ids[0], 1) : currentMonthId()}
          existing={Object.keys(ws.months)}
          hasPrevious={ids.length > 0}
          onClose={() => setAddOpen(false)}
          onAdd={(id, copy) => {
            onAddMonth(id, copy)
            setAddOpen(false)
          }}
        />
      )}
    </div>
  )
}

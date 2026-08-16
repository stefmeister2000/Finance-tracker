import { useRef, useState } from 'react'
import type { AppData, Workspace, WorkspaceData } from '../types'
import type { View } from '../App'
import { monthLabel, shiftMonth, sortedMonthIds, currentMonthId, workspaceOrder } from '../storage'
import AddMonthModal from './AddMonthModal'

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
                    🙈
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
              <span className="workspace-icon">🙈</span>
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
      <p className="workspace-hint">Double-click to rename · drag to reorder · 🙈 to hide.</p>

      <div className="sidebar-nav">
      <div className="nav-section-label">General</div>
      <button
        className={`nav-item ${view.type === 'overview' ? 'active' : ''}`}
        onClick={() => setView({ type: 'overview' })}
      >
        <span>📊 Overview</span>
      </button>
      {ws.kind === 'personal' && (
        <button
          className={`nav-item ${view.type === 'networth' ? 'active' : ''}`}
          onClick={() => setView({ type: 'networth' })}
        >
          <span>🏦 Net Worth</span>
        </button>
      )}

      <div className="nav-section-label">Finance</div>
      {ws.kind === 'business' && (
        <button
          className={`nav-item ${view.type === 'invoices' ? 'active' : ''}`}
          onClick={() => setView({ type: 'invoices' })}
        >
          <span>🧾 Invoices</span>
        </button>
      )}
      <button
        className={`nav-item ${view.type === 'subscriptions' ? 'active' : ''}`}
        onClick={() => setView({ type: 'subscriptions' })}
      >
        <span>🔁 Subscriptions</span>
      </button>
      <button
        className={`nav-item ${view.type === 'budget' ? 'active' : ''}`}
        onClick={() => setView({ type: 'budget' })}
      >
        <span>💸 Fixed Costs</span>
      </button>

      {ws.kind === 'business' && (
        <>
          <div className="nav-section-label">Marketing</div>
          <button
            className={`nav-item ${view.type === 'adspend' ? 'active' : ''}`}
            onClick={() => setView({ type: 'adspend' })}
          >
            <span>📣 Ad Spend</span>
          </button>
          <button
            className={`nav-item ${view.type === 'influencers' ? 'active' : ''}`}
            onClick={() => setView({ type: 'influencers' })}
          >
            <span>🤝 Influencers</span>
          </button>

          <div className="nav-section-label">Business</div>
          <button
            className={`nav-item ${view.type === 'model' ? 'active' : ''}`}
            onClick={() => setView({ type: 'model' })}
          >
            <span>📐 Financial Model</span>
          </button>
          <button
            className={`nav-item ${view.type === 'funding' ? 'active' : ''}`}
            onClick={() => setView({ type: 'funding' })}
          >
            <span>💰 Funding</span>
          </button>
          <button
            className={`nav-item ${view.type === 'retail' ? 'active' : ''}`}
            onClick={() => setView({ type: 'retail' })}
          >
            <span>🏪 Retail</span>
          </button>
          <button
            className={`nav-item ${view.type === 'inventory' ? 'active' : ''}`}
            onClick={() => setView({ type: 'inventory' })}
          >
            <span>📦 Inventory</span>
          </button>
          <button
            className={`nav-item ${view.type === 'startup' ? 'active' : ''}`}
            onClick={() => setView({ type: 'startup' })}
          >
            <span>🚀 Startup Costs</span>
          </button>
          <button
            className={`nav-item ${view.type === 'tools' ? 'active' : ''}`}
            onClick={() => setView({ type: 'tools' })}
          >
            <span>🔧 Business Tools</span>
          </button>
          <button
            className={`nav-item ${view.type === 'contracts' ? 'active' : ''}`}
            onClick={() => setView({ type: 'contracts' })}
          >
            <span>📄 Contracts</span>
          </button>
        </>
      )}

      <div className="nav-section-label">Months</div>
      <div className="nav-months">
        {ids.map((id) => (
          <button
            key={id}
            className={`nav-item ${view.type === 'month' && view.id === id ? 'active' : ''}`}
            onClick={() => setView({ type: 'month', id })}
          >
            <span>{monthLabel(id)}</span>
          </button>
        ))}
        {ids.length === 0 && (
          <div className="empty-state" style={{ padding: '8px' }}>
            No months yet
          </div>
        )}
      </div>
      </div>{/* end sidebar-nav */}

      <div className="sidebar-footer">
        <button className="nav-item" onClick={() => setAddOpen(true)}>
          <span>+ Add Month</span>
        </button>
        <button className="nav-item" onClick={onOpenSettings}>
          <span>⚙️ Settings</span>
        </button>
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

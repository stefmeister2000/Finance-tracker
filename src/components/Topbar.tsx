import type { AppData } from '../types'
import type { View } from '../App'
import { greeting, monthLabel } from '../storage'

interface Props {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  view: View
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

function viewSubtitle(view: View): string {
  switch (view.type) {
    case 'overview':
      return "Here's how your finances are looking."
    case 'month':
      return `Reviewing ${monthLabel(view.id)}.`
    case 'networth':
      return 'Track every asset and liability you own.'
    case 'subscriptions':
      return "Here's what you're paying for, automatically detected."
    case 'budget':
      return 'Plan your fixed and variable monthly costs.'
    case 'invoices':
      return 'Track money owed to and by the business.'
    case 'adspend':
      return 'Track ad spend, revenue, and what performs best.'
    case 'influencers':
      return 'Manage commission partners and their effect on your margins.'
    case 'retail':
      return 'Shops and wholesale partners that stock your products.'
    case 'funding':
      return 'Plan and track how you spend investor money.'
    case 'model':
      return 'A 24-month financial model for your BV plan.'
    case 'inventory':
      return 'Plan stock purchases and track supply cost.'
    case 'startup':
      return 'Track one-time investments and startup costs.'
    case 'tools':
      return 'VAT, margin, and break-even calculators for your business.'
    case 'contracts':
      return 'Store and manage all your business contracts and agreements.'
  }
}

export default function Topbar({ data, view, onUndo, onRedo, canUndo, canRedo }: Props) {
  return (
    <div className="topbar">
      <div>
        <h1>
          {greeting()}, {data.userName || 'there'}
        </h1>
        <p className="subtitle">{viewSubtitle(view)}</p>
      </div>
      <div className="topbar-actions">
        <button className="btn ghost small" onClick={onUndo} disabled={!canUndo} title="Undo last change">
          ↩ Undo
        </button>
        <button className="btn ghost small" onClick={onRedo} disabled={!canRedo} title="Redo last change">
          ↪ Redo
        </button>

        <span className="tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {data.workspaces[data.activeWorkspace].kind === 'personal' ? '👤 ' : '🏢 '}
          {data.workspaces[data.activeWorkspace].name}
        </span>
      </div>
    </div>
  )
}

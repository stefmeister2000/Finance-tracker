import { v4 as uuid } from 'uuid'
import type { AppData, AssetType, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'

interface Props {
  ws: WorkspaceData
  type: AssetType
  setData: React.Dispatch<React.SetStateAction<AppData>>
  onClose: () => void
}

export default function NetWorthCategoryModal({ ws, type, setData, onClose }: Props) {
  const categories = ws.netWorthCategories.filter((c) => c.type === type)

  function addCategory() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthCategories: [
          ...w.netWorthCategories,
          { id: uuid(), name: 'New Category', type, color: '#94a3b8', liquid: false },
        ],
      })),
    )
  }

  function updateCategory(id: string, updates: { name?: string; color?: string; liquid?: boolean }) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthCategories: w.netWorthCategories.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      })),
    )
  }

  function removeCategory(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const remaining = w.netWorthCategories.filter((c) => c.id !== id)
        const usedByAccounts = w.netWorthAccounts.some((a) => a.category === id)
        let netWorthCategories = remaining
        let netWorthAccounts = w.netWorthAccounts

        if (usedByAccounts) {
          // Reassign accounts to a fallback "Other" category of the same type, creating one if needed.
          const fallbackName = type === 'asset' ? 'Other Asset' : 'Other Liability'
          let fallback = remaining.find((c) => c.type === type && c.name.toLowerCase() === fallbackName.toLowerCase())
          if (!fallback) {
            fallback = { id: uuid(), name: fallbackName, type, color: '#94a3b8', liquid: false }
            netWorthCategories = [...remaining, fallback]
          }
          const fallbackId = fallback.id
          netWorthAccounts = w.netWorthAccounts.map((a) => (a.category === id ? { ...a, category: fallbackId } : a))
        }

        return { ...w, netWorthCategories, netWorthAccounts }
      }),
    )
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Manage {type === 'asset' ? 'Asset' : 'Liability'} Categories</h2>
        <div className="settings-list">
          {categories.map((c) => (
            <div className="settings-row" key={c.id}>
              <input
                type="color"
                value={c.color}
                onChange={(e) => updateCategory(c.id, { color: e.target.value })}
              />
              <input
                type="text"
                value={c.name}
                onChange={(e) => updateCategory(c.id, { name: e.target.value })}
              />
              {type === 'asset' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={c.liquid}
                    onChange={(e) => updateCategory(c.id, { liquid: e.target.checked })}
                  />
                  Liquid
                </label>
              )}
              <button className="btn ghost small" onClick={() => removeCategory(c.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="btn secondary small" onClick={addCategory}>
          + Add Category
        </button>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

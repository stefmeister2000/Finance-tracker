import { useCurrency } from '../CurrencyContext'
import { v4 as uuid } from 'uuid'
import type { AppData, FixedCostItem, FixedCostType, WorkspaceData } from '../types'
import { updateActiveWorkspace, currentMonthId } from '../storage'
import { formatCurrency, liquidNetWorth, allMonthIds, totalsByCategoryRange } from '../utils'
import CategoryTag from './CategoryTag'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export default function BudgetPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const items = ws.fixedCosts ?? []
  const fixedItems = items.filter((i) => i.type === 'fixed')
  const variableItems = items.filter((i) => i.type === 'variable')

  const incomeItems = ws.fixedIncome ?? []
  const partnerItems = ws.partnerExpenses ?? []
  const partnerTotal = partnerItems.reduce((s, i) => s + i.monthlyCost, 0)

  const fixedTotal = fixedItems.reduce((s, i) => s + i.monthlyCost, 0)
  const variableTotal = variableItems.reduce((s, i) => s + i.monthlyCost, 0)
  const totalBurn = fixedTotal + variableTotal
  const incomeTotal = incomeItems.reduce((s, i) => s + i.monthlyCost, 0)
  const netMonthly = incomeTotal - totalBurn

  const months = allMonthIds(ws)
  const cur = currentMonthId()
  const monthId = months.includes(cur) ? cur : months.length ? months[months.length - 1] : cur
  const liquid = liquidNetWorth(ws, monthId)
  // Runway uses net burn (costs minus recurring income) — if income covers costs, runway is unlimited.
  const netBurn = totalBurn - incomeTotal
  const runwayMonths = netBurn > 0 ? liquid / netBurn : undefined

  const dataMonthIds = Object.keys(ws.months)
  const monthCount = dataMonthIds.length
  const expenseTotals = totalsByCategoryRange(ws, dataMonthIds, 'expense')
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const dismissedEstimates = new Set(ws.dismissedEstimates ?? [])
  const estimates = Array.from(expenseTotals.entries())
    .map(([catId, total]) => ({ cat: categoryById.get(catId), average: monthCount > 0 ? total / monthCount : 0 }))
    .filter((e) => e.cat && e.average > 0 && !dismissedEstimates.has(e.cat!.id))
    .sort((a, b) => b.average - a.average) as { cat: WorkspaceData['categories'][number]; average: number }[]

  function dismissEstimate(categoryId: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        dismissedEstimates: [...(w.dismissedEstimates ?? []), categoryId],
      })),
    )
  }

  function addItem(type: FixedCostType, overrides?: Partial<Pick<FixedCostItem, 'category' | 'name' | 'monthlyCost'>>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedCosts: [
          ...(w.fixedCosts ?? []),
          { id: uuid(), type, category: 'Other', name: 'New item', monthlyCost: 0, ...overrides },
        ],
      })),
    )
  }

  function updateItem(id: string, updates: Partial<FixedCostItem>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedCosts: (w.fixedCosts ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function removeItem(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedCosts: (w.fixedCosts ?? []).filter((i) => i.id !== id),
      })),
    )
  }

  function addIncome() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedIncome: [...(w.fixedIncome ?? []), { id: uuid(), type: 'fixed' as const, category: 'Other', name: 'New income', monthlyCost: 0 }],
      })),
    )
  }

  function updateIncome(id: string, updates: Partial<FixedCostItem>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedIncome: (w.fixedIncome ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function addPartnerExpense() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        partnerExpenses: [...(w.partnerExpenses ?? []), { id: uuid(), type: 'fixed' as const, category: 'Other', name: 'New item', monthlyCost: 0 }],
      })),
    )
  }

  function updatePartnerExpense(id: string, updates: Partial<FixedCostItem>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        partnerExpenses: (w.partnerExpenses ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function removePartnerExpense(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        partnerExpenses: (w.partnerExpenses ?? []).filter((i) => i.id !== id),
      })),
    )
  }

  function removeIncome(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        fixedIncome: (w.fixedIncome ?? []).filter((i) => i.id !== id),
      })),
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Fixed Costs</h2>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Fixed Income</div>
          <div className="value positive">{fmt(incomeTotal)}</div>
          <div className="sub">per month</div>
        </div>
        <div className="stat-card">
          <div className="label">Fixed Costs</div>
          <div className="value negative">{fmt(fixedTotal)}</div>
          <div className="sub">per month</div>
        </div>
        <div className="stat-card">
          <div className="label">Variable Costs</div>
          <div className="value negative">{fmt(variableTotal)}</div>
          <div className="sub">per month</div>
        </div>
        <div className="stat-card">
          <div className="label">Net per Month</div>
          <div className={`value ${netMonthly >= 0 ? 'positive' : 'negative'}`}>{netMonthly >= 0 ? '+' : ''}{fmt(netMonthly)}</div>
          <div className="sub">{fmt(incomeTotal)} income − {fmt(totalBurn)} burn</div>
        </div>
        <div className="stat-card">
          <div className="label">Liquid Runway</div>
          <div className="value">{netBurn <= 0 ? (totalBurn > 0 || incomeTotal > 0 ? '∞' : '—') : runwayMonths !== undefined ? `${runwayMonths.toFixed(1)} months` : '—'}</div>
          <div className="sub">{netBurn <= 0 && (totalBurn > 0 || incomeTotal > 0) ? 'income covers your burn' : `${fmt(liquid)} liquid ÷ net burn`}</div>
        </div>
      </div>

      {estimates.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Spending Estimates</h2>
            <p>Average monthly spend per category across {monthCount} month{monthCount === 1 ? '' : 's'} of data.</p>
            {dismissedEstimates.size > 0 && (
              <button className="btn ghost small" onClick={() => setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, dismissedEstimates: [] })))}>
                Show hidden ({dismissedEstimates.size})
              </button>
            )}
          </div>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th style={{ textAlign: 'right' }}>Avg / Month</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {estimates.map(({ cat, average }) => (
                  <tr key={cat.id}>
                    <td><CategoryTag category={cat} /></td>
                    <td className="amount negative">{fmt(average)}</td>
                    <td className="actions">
                      <button className="btn ghost small" onClick={() => addItem('fixed', { category: cat.name, name: cat.name, monthlyCost: average })}>+ Fixed</button>
                      <button className="btn ghost small" onClick={() => addItem('variable', { category: cat.name, name: cat.name, monthlyCost: average })}>+ Variable</button>
                      <button className="btn ghost small" onClick={() => dismissEstimate(cat.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CostSection
        title="Fixed Income"
        description="Recurring monthly income (salary, retainers, rental income…) — deducted directly from your costs below."
        type="fixed"
        income
        items={incomeItems}
        total={incomeTotal}
        currency={curr}
        panelClass="panel-assets"
        onAdd={addIncome}
        onUpdate={updateIncome}
        onRemove={removeIncome}
      />

      <CostSection
        title="Fixed Costs"
        description="Recurring costs that stay roughly the same every month (rent, subscriptions, loan payments…)."
        type="fixed"
        items={fixedItems}
        total={fixedTotal}
        currency={curr}
        panelClass="panel-liabilities"
        onAdd={() => addItem('fixed')}
        onUpdate={updateItem}
        onRemove={removeItem}
      />

      <CostSection
        title="Variable Costs"
        description="Costs that fluctuate month to month (ad spend, groceries, dining, extras…)."
        type="variable"
        items={variableItems}
        total={variableTotal}
        currency={curr}
        panelClass="panel-assets"
        onAdd={() => addItem('variable')}
        onUpdate={updateItem}
        onRemove={removeItem}
      />

      {/* Partner Expenses are a household concept — only shown in personal workspaces, not businesses. */}
      {ws.kind === 'personal' && (
        <CostSection
          title="Partner Expenses"
          description={`Your partner's recurring monthly expenses, managed separately — not counted in your own burn or runway. Total: ${fmt(partnerTotal)}/mo.`}
          type="fixed"
          accent="#a855f7"
          items={partnerItems}
          total={partnerTotal}
          currency={curr}
          panelClass=""
          onAdd={addPartnerExpense}
          onUpdate={updatePartnerExpense}
          onRemove={removePartnerExpense}
        />
      )}
    </div>
  )
}

function CostSection({
  title,
  description,
  type,
  income = false,
  accent,
  items,
  total,
  currency,
  panelClass,
  onAdd,
  onUpdate,
  onRemove,
}: {
  title: string
  description: string
  type: FixedCostType
  income?: boolean
  accent?: string
  items: FixedCostItem[]
  total: number
  currency: string
  panelClass: string
  onAdd: () => void
  onUpdate: (id: string, updates: Partial<FixedCostItem>) => void
  onRemove: (id: string) => void
}) {
  const { fmt, curr } = useCurrency()
  // Group by category
  const grouped = new Map<string, FixedCostItem[]>()
  for (const item of items) {
    const cat = item.category.trim() || 'Other'
    if (!grouped.has(cat)) grouped.set(cat, [])
    grouped.get(cat)!.push(item)
  }
  const groups = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))

  const SECTION_COLORS: Record<string, string> = {
    'fixed': '#f0506e',
    'variable': '#22c55e',
  }
  const accentColor = accent ?? (income ? '#6366f1' : SECTION_COLORS[type])
  const amountClass = income ? 'positive' : 'negative'

  return (
    <div className={`panel ${panelClass}`}>
      <div className="panel-header">
        <h2>{title}</h2>
        <p>{description}</p>
        <button className="btn secondary small" onClick={onAdd}>+ Add {income ? 'Income' : `${title.split(' ')[0]} Cost`}</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">None added yet.</div>
      ) : (
        <div>
          {groups.map(([category, groupItems]) => {
            const groupTotal = groupItems.reduce((s, i) => s + i.monthlyCost, 0)
            return (
              <div key={category} style={{ marginBottom: 20 }}>
                {/* Category divider */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 8,
                  paddingBottom: 6,
                  borderBottom: `2px solid ${accentColor}22`,
                }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: accentColor,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{category}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(groupTotal)} / mo
                  </span>
                </div>

                <table style={{ width: '100%' }}>
                  <tbody>
                    {groupItems.map((item) => (
                      <tr key={item.id}>
                        <td style={{ paddingLeft: 20, width: '40%' }}>
                          <input
                            type="text"
                            className="table-input"
                            value={item.name}
                            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
                            placeholder="Item name"
                          />
                        </td>
                        <td style={{ width: '30%' }}>
                          <input
                            type="text"
                            className="table-input"
                            value={item.category}
                            onChange={(e) => onUpdate(item.id, { category: e.target.value })}
                            placeholder="Category"
                          />
                        </td>
                        <td className={`amount ${amountClass}`} style={{ width: '20%' }}>
                          <input
                            type="number"
                            step="0.01"
                            className="table-input amount-input"
                            style={{ maxWidth: 110 }}
                            value={item.monthlyCost}
                            onChange={(e) => onUpdate(item.id, { monthlyCost: parseFloat(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="actions" style={{ width: '10%' }}>
                          <button className="btn ghost small danger" onClick={() => onRemove(item.id)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            borderTop: '1px solid var(--border)',
            marginTop: 4,
          }}>
            <strong>Total</strong>
            <strong className={`amount ${amountClass}`}>{fmt(total)} / mo</strong>
          </div>
        </div>
      )}
    </div>
  )
}

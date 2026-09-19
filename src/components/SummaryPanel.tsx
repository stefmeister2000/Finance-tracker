import { useCurrency } from '../CurrencyContext'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { AppData, WorkspaceData } from '../types'
import { formatCurrency, previousMonthId, totalsByCategory } from '../utils'
import CategoryTag from './CategoryTag'

interface Props {
  ws: WorkspaceData
  monthId: string
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export default function SummaryPanel({ ws, monthId }: Props) {
  const { fmt, curr } = useCurrency()
  const month = ws.months[monthId]
  const incomeByCat = totalsByCategory(month, 'income')
  const expenseByCat = totalsByCategory(month, 'expense')

  const prevId = previousMonthId(ws, monthId)
  const prevMonth = prevId ? ws.months[prevId] : undefined
  const prevExpenseByCat = prevMonth ? totalsByCategory(prevMonth, 'expense') : new Map<string, number>()
  const prevIncomeByCat = prevMonth ? totalsByCategory(prevMonth, 'income') : new Map<string, number>()

  return (
    <div className="clear-page summary-page">
      <div className="dual-panel-grid">
        <BreakdownPanel
          title="Income by Category"
          map={incomeByCat}
          prevMap={prevIncomeByCat}
          ws={ws}
          type="income"
        />
        <BreakdownPanel
          title="Expenses by Category"
          map={expenseByCat}
          prevMap={prevExpenseByCat}
          ws={ws}
          type="expense"
        />
      </div>
    </div>
  )
}

function BreakdownPanel({
  title,
  map,
  prevMap,
  ws,
  type,
}: {
  title: string
  map: Map<string, number>
  prevMap: Map<string, number>
  ws: WorkspaceData
  type: 'income' | 'expense'
}) {
  const { fmt, curr } = useCurrency()
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const rows = Array.from(map.entries())
    .map(([catId, amount]) => ({ cat: categoryById.get(catId), amount, prevAmount: prevMap.get(catId) ?? 0 }))
    .filter((r) => r.cat)
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((s, r) => s + r.amount, 0)

  const chartData = rows.map((r) => ({ name: r.cat!.name, value: r.amount, color: r.cat!.color }))

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">No data for this month yet.</div>
      ) : (
        <div className="panel-grid">
          <div className="scroll-x"><table>
            <thead>
              <tr>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th style={{ textAlign: 'right' }}>% of Total</th>
                <th style={{ textAlign: 'right' }}>Vs Last Month</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = r.amount - r.prevAmount
                const showDelta = r.prevAmount > 0 || r.amount > 0
                const deltaIsBad = type === 'expense' ? delta > 0 : delta < 0
                return (
                  <tr key={r.cat!.id}>
                    <td>
                      <CategoryTag category={r.cat!} />
                    </td>
                    <td className="amount">{fmt(r.amount)}</td>
                    <td className="amount" style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                      {total > 0 ? `${((r.amount / total) * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td
                      className="amount"
                      style={{
                        fontWeight: 400,
                        color: !showDelta || Math.abs(delta) < 1 ? 'var(--text-muted)' : deltaIsBad ? 'var(--red)' : 'var(--green)',
                      }}
                    >
                      {!showDelta || Math.abs(delta) < 1
                        ? '—'
                        : `${delta > 0 ? '+' : ''}${fmt(delta)}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="amount">{fmt(total)}</td>
                <td></td>
                <td></td>
              </tr>
            </tfoot>
          </table></div>
          <div style={{ width: '100%', minWidth: 220, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  cy="42%"
                >
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={70}
                  iconSize={9}
                  wrapperStyle={{ fontSize: 12, lineHeight: '18px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

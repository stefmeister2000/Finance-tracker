import { useCurrency } from '../CurrencyContext'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { AppData, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { formatCurrency, monthTotals, previousMonthId, totalsByCategory } from '../utils'
import CategoryTag from './CategoryTag'

interface Props {
  ws: WorkspaceData
  monthId: string
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export default function SummaryPanel({ ws, monthId, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const month = ws.months[monthId]
  const incomeByCat = totalsByCategory(month, 'income')
  const expenseByCat = totalsByCategory(month, 'expense')

  const prevId = previousMonthId(ws, monthId)
  const prevMonth = prevId ? ws.months[prevId] : undefined
  const prevExpenseByCat = prevMonth ? totalsByCategory(prevMonth, 'expense') : new Map<string, number>()
  const prevIncomeByCat = prevMonth ? totalsByCategory(prevMonth, 'income') : new Map<string, number>()

  return (
    <div>
      <InsightsPanel
        ws={ws}
        monthId={monthId}
        prevId={prevId}
        month={month}
        prevMonth={prevMonth}
        expenseByCat={expenseByCat}
        prevExpenseByCat={prevExpenseByCat}
        setData={setData}
      />
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

function InsightsPanel({
  ws,
  monthId,
  prevId,
  month,
  prevMonth,
  expenseByCat,
  prevExpenseByCat,
  setData,
}: {
  ws: WorkspaceData
  monthId: string
  prevId: string | undefined
  month: import('../types').MonthData
  prevMonth: import('../types').MonthData | undefined
  expenseByCat: Map<string, number>
  prevExpenseByCat: Map<string, number>
  setData: React.Dispatch<React.SetStateAction<AppData>>
}) {
  const { fmt, curr } = useCurrency()
  const categoryById = new Map(ws.categories.map((c) => [c.id, c]))
  const totals = monthTotals(month)
  const prevTotals = monthTotals(prevMonth)
  const insights: { id: string; tone: 'positive' | 'negative' | 'neutral'; text: string }[] = []

  if (prevMonth) {
    // Overall spending trend
    const expenseDelta = totals.expense - prevTotals.expense
    if (Math.abs(expenseDelta) > 1) {
      const pct = prevTotals.expense > 0 ? (Math.abs(expenseDelta) / prevTotals.expense) * 100 : 100
      insights.push({
        id: 'expense-trend',
        tone: expenseDelta > 0 ? 'negative' : 'positive',
        text:
          expenseDelta > 0
            ? `Total spending is up ${fmt(expenseDelta)} (${pct.toFixed(0)}%) vs ${prevId}.`
            : `Total spending is down ${fmt(Math.abs(expenseDelta))} (${pct.toFixed(0)}%) vs ${prevId}. Nice work.`,
      })
    }

    // Net / savings trend
    const netDelta = totals.net - prevTotals.net
    if (Math.abs(netDelta) > 1) {
      insights.push({
        id: 'net-trend',
        tone: netDelta > 0 ? 'positive' : 'negative',
        text:
          netDelta > 0
            ? `Net result improved by ${fmt(netDelta)} compared to ${prevId}.`
            : `Net result dropped by ${fmt(Math.abs(netDelta))} compared to ${prevId}.`,
      })
    }

    // Per-category increases/decreases worth flagging
    const categoryDeltas: { id: string; name: string; color: string; delta: number; pct: number }[] = []
    const allCatIds = new Set([...expenseByCat.keys(), ...prevExpenseByCat.keys()])
    for (const catId of allCatIds) {
      const cat = categoryById.get(catId)
      if (!cat) continue
      const current = expenseByCat.get(catId) ?? 0
      const prev = prevExpenseByCat.get(catId) ?? 0
      const delta = current - prev
      if (Math.abs(delta) < 10) continue
      const pct = prev > 0 ? (delta / prev) * 100 : 100
      if (Math.abs(pct) < 15 && Math.abs(delta) < 30) continue
      categoryDeltas.push({ id: catId, name: cat.name, color: cat.color, delta, pct })
    }
    categoryDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    for (const d of categoryDeltas.slice(0, 3)) {
      insights.push({
        id: `cat-trend-${d.id}`,
        tone: d.delta > 0 ? 'negative' : 'positive',
        text:
          d.delta > 0
            ? `${d.name} spending rose ${fmt(d.delta)} (${d.pct.toFixed(0)}%) vs last month.`
            : `${d.name} spending fell ${fmt(Math.abs(d.delta))} (${Math.abs(d.pct).toFixed(0)}%) vs last month.`,
      })
    }
  } else {
    insights.push({
      id: 'first-month',
      tone: 'neutral',
      text: 'This is the earliest month with data, so there is nothing to compare against yet.',
    })
  }

  // Largest expense category this month
  const sortedExpense = Array.from(expenseByCat.entries()).sort((a, b) => b[1] - a[1])
  if (sortedExpense.length > 0 && totals.expense > 0) {
    const [topCatId, topAmount] = sortedExpense[0]
    const cat = categoryById.get(topCatId)
    if (cat) {
      const share = (topAmount / totals.expense) * 100
      insights.push({
        id: 'top-category',
        tone: share > 40 ? 'negative' : 'neutral',
        text: `${cat.name} is your biggest expense category at ${fmt(topAmount)} (${share.toFixed(0)}% of spending).`,
      })
    }
  }

  // Savings rate
  if (totals.income > 0) {
    const rate = (totals.net / totals.income) * 100
    insights.push({
      id: 'savings-rate',
      tone: rate >= 20 ? 'positive' : rate >= 0 ? 'neutral' : 'negative',
      text:
        rate >= 0
          ? `You kept ${rate.toFixed(0)}% of your income this month.`
          : `You spent ${fmt(Math.abs(totals.net))} more than you earned this month.`,
    })
  }

  if (totals.income === 0 && totals.expense === 0) {
    insights.length = 0
    insights.push({ id: 'no-transactions', tone: 'neutral', text: 'No transactions recorded for this month yet.' })
  }

  const dismissed = new Set(ws.dismissedInsights ?? [])
  const visible = insights.filter((insight) => !dismissed.has(`${monthId}:${insight.id}`))

  function dismiss(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        dismissedInsights: [...(w.dismissedInsights ?? []), `${monthId}:${id}`],
      })),
    )
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>Insights</h2>
        <p>A closer look at how {monthId} compares and where your money is going.</p>
      </div>
      {visible.length === 0 ? (
        <div className="empty-state">No insights to show — you've dismissed them all for this month.</div>
      ) : (
        <ul className="insights-list">
          {visible.map((insight) => (
            <li key={insight.id} className={`insight insight-${insight.tone}`}>
              <span>{insight.text}</span>
              <button className="insight-dismiss" onClick={() => dismiss(insight.id)} title="Dismiss">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
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
          <table>
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
          </table>
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

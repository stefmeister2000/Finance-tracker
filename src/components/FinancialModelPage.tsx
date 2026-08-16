import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { AppData, FinancialModelAssumptions, FinancialScenario, WorkspaceData } from '../types'
import { updateActiveWorkspace, monthLabel } from '../storage'
import { useCurrency } from '../CurrencyContext'
import { defaultsFrom, project, sumRows as sum, type MonthRow, type Scenario } from '../financialModel'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

type Tab = 'plan' | 'assumptions' | 'sales' | 'unit' | 'costs' | 'pnl' | 'cash' | 'financing' | 'summary' | 'scenarios' | 'stress'

export default function FinancialModelPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const [scenario, setScenario] = useState<Scenario>('base')
  const plan = ws.importedPlan
  const [tab, setTab] = useState<Tab>(plan ? 'plan' : 'summary')
  const [sheetIdx, setSheetIdx] = useState(0)
  const [editingPlan, setEditingPlan] = useState(false)

  function parseCell(value: string): string | number {
    const t = value.trim()
    if (t === '') return ''
    const num = Number(t)
    return Number.isFinite(num) && String(num) === t ? num : value
  }
  function mutatePlan(fn: (sheets: NonNullable<typeof plan>['sheets']) => NonNullable<typeof plan>['sheets']) {
    setData((prev) => updateActiveWorkspace(prev, (w) => (w.importedPlan ? { ...w, importedPlan: { ...w.importedPlan, sheets: fn(w.importedPlan.sheets) } } : w)))
  }
  function updatePlanCell(si: number, ri: number, ci: number, value: string) {
    mutatePlan((sheets) => sheets.map((s, i) => {
      if (i !== si) return s
      const rows = s.rows.map((r) => r.slice())
      while (rows[ri].length <= ci) rows[ri].push('')
      rows[ri][ci] = parseCell(value)
      return { ...s, rows }
    }))
  }
  function deletePlanRow(si: number, ri: number) {
    mutatePlan((sheets) => sheets.map((s, i) => (i === si ? { ...s, rows: s.rows.filter((_, r) => r !== ri) } : s)))
  }
  function addPlanRow(si: number) {
    mutatePlan((sheets) => sheets.map((s, i) => {
      if (i !== si) return s
      const width = Math.max(...s.rows.map((r) => r.length), 1)
      return { ...s, rows: [...s.rows, Array(width).fill('')] }
    }))
  }

  const a = ws.financialModel ?? defaultsFrom(ws)
  const rows = project(a, scenario)

  function set<K extends keyof FinancialModelAssumptions>(key: K, value: FinancialModelAssumptions[K]) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, financialModel: { ...(w.financialModel ?? a), [key]: value } })))
  }
  function num<K extends keyof FinancialModelAssumptions>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => set(key, (parseFloat(e.target.value) || 0) as FinancialModelAssumptions[K])
  }

  const scenarios = ws.financialScenarios ?? []

  function saveScenario() {
    const name = prompt('Name this scenario (e.g. Realistic, Optimistic, Conservative):')?.trim()
    if (!name) return
    const s: FinancialScenario = { id: uuid(), name, assumptions: a, createdAt: new Date().toISOString() }
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, financialScenarios: [...(w.financialScenarios ?? []), s] })))
  }

  function updateScenario(id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({
      ...w,
      financialScenarios: (w.financialScenarios ?? []).map((s) => (s.id === id ? { ...s, assumptions: a } : s)),
    })))
  }

  function loadScenario(s: FinancialScenario) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, financialModel: { ...s.assumptions } })))
    setTab('summary')
  }

  function deleteScenario(id: string) {
    setData((prev) => updateActiveWorkspace(prev, (w) => ({ ...w, financialScenarios: (w.financialScenarios ?? []).filter((s) => s.id !== id) })))
  }

  const totalRevenue = sum(rows, 'revenue')
  const totalGross = sum(rows, 'grossProfit')
  const totalEbitda = sum(rows, 'ebitda')
  const totalNet = sum(rows, 'netProfit')
  const endingCash = rows[rows.length - 1]?.cash ?? 0
  const minCash = Math.min(...rows.map((r) => r.cash))
  const minCashMonth = rows.find((r) => r.cash === minCash)
  const breakEven = rows.find((r) => r.ebitda >= 0)
  const cashPositive = rows.find((r) => r.cash >= 0)
  const additionalNeeded = minCash < 0 ? -minCash : 0

  const TABS: [Tab, string][] = [
    ...(plan ? [['plan', 'Official Plan'] as [Tab, string]] : []),
    ['summary', 'Quick Model'], ['assumptions', 'Assumptions'], ['sales', 'Sales'], ['unit', 'Unit Economics'],
    ['costs', 'Costs'], ['pnl', 'P&L'], ['cash', 'Cash Flow'], ['financing', 'Financing'], ['stress', 'Stress Test'], ['scenarios', 'Scenarios'],
  ]

  // Stress / sensitivity: scale month-1 units by a factor and read the outcome.
  const stressLevels = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2]
  const stressRows = stressLevels.map((f) => {
    const r = project({ ...a, unitsMonth1: a.unitsMonth1 * f }, scenario)
    const y1 = r.slice(0, 12), y2 = r.slice(12, 24)
    return {
      f,
      y1rev: y1.reduce((s, x) => s + x.revenue, 0),
      y2rev: y2.reduce((s, x) => s + x.revenue, 0),
      minCash: Math.min(...r.map((x) => x.cash)),
      endY1: y1[y1.length - 1]?.cash ?? 0,
      endY2: y2[y2.length - 1]?.cash ?? 0,
    }
  })

  const chartData = rows.map((r) => ({ name: monthLabel(r.monthId).replace(' 20', " '"), cash: Math.round(r.cash), ebitda: Math.round(r.ebitda) }))

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Financial Model — 24 Months</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
            <button className={`btn ${scenario === 'base' ? 'secondary' : 'ghost'} small`} onClick={() => setScenario('base')}>Base</button>
            <button className={`btn ${scenario === 'downside' ? 'secondary' : 'ghost'} small`} onClick={() => setScenario('downside')}>Downside</button>
          </div>
        </div>
      </div>

      <div className="tabs" style={{ flexWrap: 'wrap' }}>
        {TABS.map(([t, label]) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ── Official (imported) plan ── */}
      {tab === 'plan' && plan && (
        <div>
          <div className="panel" style={{ border: '2px solid var(--accent)', background: 'var(--accent-soft)' }}>
            <div className="panel-header">
              <h2>{plan.name}</h2>
              <p>The authoritative accountant/notary numbers. Imported {new Date(plan.importedAt).toLocaleDateString()}. Turn on Edit to change values, add or remove rows.</p>
              <button
                className={`btn ${editingPlan ? 'accent' : 'secondary'} small`}
                onClick={() => setEditingPlan((v) => !v)}
              >
                {editingPlan ? '✓ Done editing' : '✎ Edit plan'}
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {plan.sheets.map((s, i) => (
                <button key={s.name} className={`btn ${sheetIdx === i ? 'secondary' : 'ghost'} small`} onClick={() => setSheetIdx(i)}>{s.name}</button>
              ))}
            </div>
          </div>
          {plan.sheets[sheetIdx]?.name.toLowerCase().includes('summary') && !editingPlan ? (
            <SummarySheet sheet={plan.sheets[sheetIdx]} fmt={fmt} />
          ) : (
            <SheetTable
              sheet={plan.sheets[sheetIdx]}
              editing={editingPlan}
              onCell={(ri, ci, v) => updatePlanCell(sheetIdx, ri, ci, v)}
              onDeleteRow={(ri) => deletePlanRow(sheetIdx, ri)}
              onAddRow={() => addPlanRow(sheetIdx)}
            />
          )}
        </div>
      )}

      {/* ── Summary ── */}
      {tab === 'summary' && (
        <div>
          <div className="stat-grid">
            <div className="stat-card"><div className="label">Revenue (24 mo)</div><div className="value">{fmt(totalRevenue)}</div></div>
            <div className="stat-card"><div className="label">Gross Profit</div><div className="value positive">{fmt(totalGross)}</div><div className="sub">{totalRevenue > 0 ? `${((totalGross / totalRevenue) * 100).toFixed(0)}% margin` : ''}</div></div>
            <div className="stat-card"><div className="label">EBITDA (24 mo)</div><div className={`value ${totalEbitda >= 0 ? 'positive' : 'negative'}`}>{fmt(totalEbitda)}</div></div>
            <div className="stat-card"><div className="label">Net Profit (24 mo)</div><div className={`value ${totalNet >= 0 ? 'positive' : 'negative'}`}>{fmt(totalNet)}</div></div>
            <div className="stat-card"><div className="label">Ending Cash</div><div className={`value ${endingCash >= 0 ? 'positive' : 'negative'}`}>{fmt(endingCash)}</div></div>
            <div className="stat-card"><div className="label">Lowest Cash</div><div className={`value ${minCash >= 0 ? '' : 'negative'}`}>{fmt(minCash)}</div><div className="sub">{minCashMonth ? monthLabel(minCashMonth.monthId) : ''}</div></div>
            <div className="stat-card"><div className="label">Break-even (EBITDA)</div><div className="value">{breakEven ? `Mo ${breakEven.m}` : '—'}</div><div className="sub">{breakEven ? monthLabel(breakEven.monthId) : 'not within 24 mo'}</div></div>
            <div className="stat-card"><div className="label">Extra funding needed</div><div className={`value ${additionalNeeded > 0 ? 'negative' : 'positive'}`}>{additionalNeeded > 0 ? fmt(additionalNeeded) : 'None'}</div></div>
          </div>

          <div className="panel">
            <div className="panel-header"><h2>Cash Balance &amp; EBITDA</h2><p>{scenario === 'base' ? 'Base case' : 'Downside case'} — monthly ending cash and operating profit.</p></div>
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <ReferenceLine y={0} stroke="var(--text-muted)" />
                  <Line type="monotone" dataKey="cash" name="Ending cash" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="#22c55e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* ── Assumptions ── */}
      {tab === 'assumptions' && (
        <div className="panel">
          <div className="panel-header"><h2>Assumptions</h2><p>The inputs that drive every tab. Defaults are pulled from your products, fixed costs and funding.</p></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Start month"><input type="month" value={a.startMonth} onChange={(e) => set('startMonth', e.target.value)} /></Field>
            <Field label={`Starting cash (${curr})`}><input type="number" value={a.startingCash || ''} onChange={num('startingCash')} /></Field>
            <Field label={`Investment injected (${curr})`}><input type="number" value={a.investment || ''} onChange={num('investment')} /></Field>
            <Field label={`Price / unit ex-VAT (${curr})`}><input type="number" value={a.pricePerUnit || ''} onChange={num('pricePerUnit')} /></Field>
            <Field label={`COGS / unit (${curr})`}><input type="number" value={a.cogsPerUnit || ''} onChange={num('cogsPerUnit')} /></Field>
            <Field label={`Fulfilment / unit (${curr})`}><input type="number" value={a.fulfilmentPerUnit || ''} onChange={num('fulfilmentPerUnit')} /></Field>
            <Field label="Units in month 1"><input type="number" value={a.unitsMonth1 || ''} onChange={num('unitsMonth1')} /></Field>
            <Field label="Monthly unit growth %"><input type="number" value={a.monthlyGrowthPct || ''} onChange={num('monthlyGrowthPct')} /></Field>
            <Field label={`Fixed opex / month (${curr})`}><input type="number" value={a.fixedOpexMonthly || ''} onChange={num('fixedOpexMonthly')} /></Field>
            <Field label={`Marketing / month (${curr})`}><input type="number" value={a.marketingMonthly || ''} onChange={num('marketingMonthly')} /></Field>
            <Field label={`Other opex / month (${curr})`}><input type="number" value={a.otherOpexMonthly || ''} onChange={num('otherOpexMonthly')} /></Field>
            <Field label="Tax rate %"><input type="number" value={a.taxRatePct || ''} onChange={num('taxRatePct')} /></Field>
          </div>
          <h3 style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 22 }}>Downside scenario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            <Field label="Growth haircut (points)"><input type="number" value={a.downsideGrowthHaircutPct || ''} onChange={num('downsideGrowthHaircutPct')} /></Field>
            <Field label="Price haircut %"><input type="number" value={a.downsidePriceHaircutPct || ''} onChange={num('downsidePriceHaircutPct')} /></Field>
            <Field label="Month-1 units haircut %"><input type="number" value={a.downsideUnitsHaircutPct || ''} onChange={num('downsideUnitsHaircutPct')} /></Field>
          </div>
        </div>
      )}

      {/* ── Sales ── */}
      {tab === 'sales' && (
        <ModelTable
          caption="Units and revenue per month."
          rows={rows}
          columns={[
            { h: 'Units', f: (r) => Math.round(r.units).toLocaleString() },
            { h: 'Revenue', f: (r) => fmt(r.revenue), cls: 'positive' },
          ]}
          totals={[Math.round(sum(rows, 'units')).toLocaleString(), fmt(totalRevenue)]}
        />
      )}

      {/* ── Unit economics ── */}
      {tab === 'unit' && (() => {
        const price = a.pricePerUnit * (scenario === 'downside' ? 1 - a.downsidePriceHaircutPct / 100 : 1)
        const varCost = a.cogsPerUnit + a.fulfilmentPerUnit
        const cm = price - varCost
        const cmPct = price > 0 ? (cm / price) * 100 : 0
        return (
          <div className="panel">
            <div className="panel-header"><h2>Unit Economics</h2><p>Per-unit profitability at {scenario} pricing.</p></div>
            <div className="stat-grid">
              <div className="stat-card"><div className="label">Price / unit</div><div className="value">{fmt(price)}</div></div>
              <div className="stat-card"><div className="label">COGS / unit</div><div className="value negative">{fmt(a.cogsPerUnit)}</div></div>
              <div className="stat-card"><div className="label">Fulfilment / unit</div><div className="value negative">{fmt(a.fulfilmentPerUnit)}</div></div>
              <div className="stat-card"><div className="label">Contribution margin</div><div className={`value ${cm >= 0 ? 'positive' : 'negative'}`}>{fmt(cm)}</div><div className="sub">{cmPct.toFixed(1)}% per unit</div></div>
            </div>
          </div>
        )
      })()}

      {/* ── Costs ── */}
      {tab === 'costs' && (
        <ModelTable
          caption="Cost of goods, fulfilment and operating costs per month."
          rows={rows}
          columns={[
            { h: 'COGS', f: (r) => fmt(r.cogs), cls: 'negative' },
            { h: 'Fulfilment', f: (r) => fmt(r.fulfilment), cls: 'negative' },
            { h: 'Opex', f: (r) => fmt(r.opex), cls: 'negative' },
            { h: 'Total costs', f: (r) => fmt(r.cogs + r.fulfilment + r.opex), cls: 'negative' },
          ]}
          totals={[fmt(sum(rows, 'cogs')), fmt(sum(rows, 'fulfilment')), fmt(sum(rows, 'opex')), fmt(sum(rows, 'cogs') + sum(rows, 'fulfilment') + sum(rows, 'opex'))]}
        />
      )}

      {/* ── P&L ── */}
      {tab === 'pnl' && (
        <ModelTable
          caption="Profit & loss per month."
          rows={rows}
          columns={[
            { h: 'Revenue', f: (r) => fmt(r.revenue) },
            { h: 'Gross profit', f: (r) => fmt(r.grossProfit), cls: 'positive' },
            { h: 'Opex', f: (r) => fmt(r.opex), cls: 'negative' },
            { h: 'EBITDA', f: (r) => fmt(r.ebitda), clsFn: (r) => (r.ebitda >= 0 ? 'positive' : 'negative') },
            { h: 'Tax', f: (r) => fmt(r.tax), cls: 'negative' },
            { h: 'Net profit', f: (r) => fmt(r.netProfit), clsFn: (r) => (r.netProfit >= 0 ? 'positive' : 'negative') },
          ]}
          totals={[fmt(totalRevenue), fmt(totalGross), fmt(sum(rows, 'opex')), fmt(totalEbitda), fmt(sum(rows, 'tax')), fmt(totalNet)]}
        />
      )}

      {/* ── Cash flow ── */}
      {tab === 'cash' && (
        <ModelTable
          caption="Monthly cash movement and ending balance. Investment lands in month 1."
          rows={rows}
          columns={[
            { h: 'Net profit', f: (r) => fmt(r.netProfit), clsFn: (r) => (r.netProfit >= 0 ? 'positive' : 'negative') },
            { h: 'Investment', f: (r) => (r.investmentIn ? fmt(r.investmentIn) : '—') },
            { h: 'Net cash', f: (r) => fmt(r.netCash), clsFn: (r) => (r.netCash >= 0 ? 'positive' : 'negative') },
            { h: 'Cash balance', f: (r) => fmt(r.cash), clsFn: (r) => (r.cash >= 0 ? '' : 'negative') },
          ]}
          totals={[fmt(totalNet), fmt(sum(rows, 'investmentIn')), fmt(sum(rows, 'netCash')), fmt(endingCash)]}
        />
      )}

      {/* ── Financing ── */}
      {tab === 'financing' && (
        <div className="panel">
          <div className="panel-header"><h2>Financing</h2><p>Whether the raise carries you through 24 months in the {scenario} case.</p></div>
          <div className="stat-grid">
            <div className="stat-card"><div className="label">Investment injected</div><div className="value">{fmt(a.investment)}</div></div>
            <div className="stat-card"><div className="label">Starting cash</div><div className="value">{fmt(a.startingCash)}</div></div>
            <div className="stat-card"><div className="label">Lowest cash point</div><div className={`value ${minCash >= 0 ? '' : 'negative'}`}>{fmt(minCash)}</div><div className="sub">{minCashMonth ? monthLabel(minCashMonth.monthId) : ''}</div></div>
            <div className="stat-card"><div className="label">Cash turns positive</div><div className="value">{cashPositive ? monthLabel(cashPositive.monthId) : (endingCash >= 0 ? 'from start' : 'not in 24 mo')}</div></div>
            <div className="stat-card"><div className="label">Additional funding needed</div><div className={`value ${additionalNeeded > 0 ? 'negative' : 'positive'}`}>{additionalNeeded > 0 ? fmt(additionalNeeded) : 'None'}</div><div className="sub">to stay cash-positive</div></div>
            <div className="stat-card"><div className="label">Ending cash</div><div className={`value ${endingCash >= 0 ? 'positive' : 'negative'}`}>{fmt(endingCash)}</div></div>
          </div>
          {additionalNeeded > 0 && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--red)', fontWeight: 600 }}>
              ⚠ In the {scenario} case you run {fmt(additionalNeeded)} short around {minCashMonth ? monthLabel(minCashMonth.monthId) : ''}. Raise more, cut burn, or slow spend.
            </div>
          )}
        </div>
      )}

      {/* ── Scenarios ── */}
      {tab === 'scenarios' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Saved Scenarios</h2>
            <p>Save the current assumptions under a name, then compare them side by side (base case, {curr}).</p>
            <button className="btn secondary small" onClick={saveScenario}>+ Save current as scenario</button>
          </div>
          {scenarios.length === 0 ? (
            <div className="empty-state">No scenarios saved yet — set your assumptions, then click "Save current as scenario".</div>
          ) : (
            <div className="scroll-x">
              <table style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th style={{ textAlign: 'right' }}>Revenue 24mo</th>
                    <th style={{ textAlign: 'right' }}>Gross profit</th>
                    <th style={{ textAlign: 'right' }}>EBITDA</th>
                    <th style={{ textAlign: 'right' }}>Net profit</th>
                    <th style={{ textAlign: 'right' }}>Ending cash</th>
                    <th style={{ textAlign: 'right' }}>Lowest cash</th>
                    <th style={{ textAlign: 'right' }}>Break-even</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {scenarios.map((s) => {
                    const sr = project(s.assumptions, 'base')
                    const rev = sum(sr, 'revenue')
                    const gross = sum(sr, 'grossProfit')
                    const ebitda = sum(sr, 'ebitda')
                    const net = sum(sr, 'netProfit')
                    const end = sr[sr.length - 1]?.cash ?? 0
                    const low = Math.min(...sr.map((r) => r.cash))
                    const be = sr.find((r) => r.ebitda >= 0)
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.name}<div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{new Date(s.createdAt).toLocaleDateString()}</div></td>
                        <td className="amount">{fmt(rev)}</td>
                        <td className="amount positive">{fmt(gross)}</td>
                        <td className={`amount ${ebitda >= 0 ? 'positive' : 'negative'}`}>{fmt(ebitda)}</td>
                        <td className={`amount ${net >= 0 ? 'positive' : 'negative'}`}>{fmt(net)}</td>
                        <td className={`amount ${end >= 0 ? 'positive' : 'negative'}`}>{fmt(end)}</td>
                        <td className={`amount ${low >= 0 ? '' : 'negative'}`}>{fmt(low)}</td>
                        <td className="amount">{be ? `M${be.m}` : '—'}</td>
                        <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn ghost small" onClick={() => loadScenario(s)} title="Load these assumptions into the model">Load</button>
                          <button className="btn ghost small" onClick={() => updateScenario(s.id)} title="Overwrite with current assumptions">Update</button>
                          <button className="btn ghost small danger" onClick={() => { if (confirm(`Delete scenario "${s.name}"?`)) deleteScenario(s.id) }}>✕</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            <strong>Load</strong> copies a scenario's assumptions back into the model to edit. <strong>Update</strong> overwrites a saved scenario with your current assumptions. The Base/Downside toggle still stress-tests whichever assumptions are loaded.
          </p>
        </div>
      )}

      {/* ── Stress test (sales sensitivity → liquidity) ── */}
      {tab === 'stress' && (
        <div className="panel">
          <div className="panel-header">
            <h2>Stress Test — Sales Sensitivity</h2>
            <p>What happens to revenue and cash if sales come in below (or above) plan. Rows where cash goes negative are the risk. Based on the {scenario} case.</p>
          </div>
          <div className="scroll-x">
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {['Sales level', 'Year 1 revenue', 'Year 2 revenue', 'Lowest cash', 'End Y1 cash', 'End Y2 cash'].map((h, i) => (
                    <th key={h} style={{ border: '1px solid var(--border)', padding: '7px 10px', background: 'var(--bg-soft)', textAlign: i === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stressRows.map((r) => {
                  const isBase = r.f === 1
                  return (
                    <tr key={r.f} style={{ background: isBase ? 'var(--accent-soft)' : r.minCash < 0 ? '#ef444412' : undefined }}>
                      <td style={{ border: '1px solid var(--border)', padding: '6px 10px', fontWeight: 700 }}>
                        {Math.round(r.f * 100)}%{isBase ? ' (plan)' : ''}
                      </td>
                      <td className="amount" style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{fmt(r.y1rev)}</td>
                      <td className="amount" style={{ border: '1px solid var(--border)', padding: '6px 10px' }}>{fmt(r.y2rev)}</td>
                      <td className="amount" style={{ border: '1px solid var(--border)', padding: '6px 10px', color: r.minCash < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{fmt(r.minCash)}</td>
                      <td className="amount" style={{ border: '1px solid var(--border)', padding: '6px 10px', color: r.endY1 < 0 ? 'var(--red)' : undefined }}>{fmt(r.endY1)}</td>
                      <td className="amount" style={{ border: '1px solid var(--border)', padding: '6px 10px', color: r.endY2 < 0 ? 'var(--red)' : undefined }}>{fmt(r.endY2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            🟢 lowest cash stays positive · 🔴 you run out of cash at that sales level — the point where you'd need more funding or lower burn.
          </p>
        </div>
      )}
    </div>
  )
}

/** Purpose-built, readable view of the messy multi-block "Summary" sheet. */
function SummarySheet({ sheet, fmt }: { sheet: { name: string; rows: (string | number)[][] }; fmt: (n: number) => string }) {
  const rows = sheet.rows
  const isNum = (v: unknown): v is number => typeof v === 'number'
  const str = (v: unknown) => (v === undefined || v === null ? '' : String(v))

  // Locate the "Metric | Year 1 | Year 2 | 24 months | Comment" block.
  let mRow = -1, mCol = -1
  for (let r = 0; r < rows.length && mRow < 0; r++) {
    for (let c = 0; c < (rows[r]?.length ?? 0); c++) {
      if (str(rows[r][c]).trim().toLowerCase() === 'metric') { mRow = r; mCol = c; break }
    }
  }
  const metricHeader = mRow >= 0 ? rows[mRow].slice(mCol) : []
  const metricRows: (string | number)[][] = []
  if (mRow >= 0) {
    for (let r = mRow + 1; r < rows.length; r++) {
      if (str(rows[r][mCol]).trim() === '') continue
      metricRows.push(rows[r].slice(mCol))
    }
  }

  // Left-hand key facts: label in col0, value in col1, and not part of the metric block.
  const facts: { label: string; value: string }[] = []
  for (const r of rows) {
    const label = str(r[0]).trim()
    const val = r[1]
    if (!label || label.length > 45) continue
    if (val === '' || val === undefined || val === null) continue
    facts.push({ label, value: isNum(val) ? fmt(val) : str(val) })
  }

  // Notes: long free-text lines (e.g. notary-readiness assessment), minus anything
  // already shown as a comment inside the metric table.
  const metricComments = new Set(metricRows.map((r) => str(r[r.length - 1])))
  const notes: string[] = []
  for (const r of rows) {
    const text = r.map(str).find((c) => c.length > 45)
    if (text && !metricComments.has(text) && !notes.includes(text)) notes.push(text)
  }

  const fmtMetric = (label: string, v: unknown) => {
    if (!isNum(v)) return str(v)
    if (/margin|%/i.test(label)) return `${(v * 100).toFixed(0)}%`
    if (/pouch|order|unit|customer/i.test(label)) return Math.round(v).toLocaleString()
    return fmt(v)
  }

  return (
    <div>
      {facts.length > 0 && (
        <div className="stat-grid">
          {facts.map((f, i) => (
            <div key={i} className="stat-card">
              <div className="label">{f.label}</div>
              <div className="value" style={{ fontSize: 18 }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}

      {metricRows.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2>Key Figures</h2><p>The headline P&amp;L and cash numbers for Year 1, Year 2 and the full 24 months.</p></div>
          <div className="scroll-x">
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  {metricHeader.map((h, i) => (
                    <th key={i} style={{ border: '1px solid var(--border)', padding: '8px 12px', background: 'var(--bg-soft)', textAlign: i === 0 || i === metricHeader.length - 1 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{str(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricRows.map((r, ri) => {
                  const label = str(r[0])
                  return (
                    <tr key={ri} style={ri % 2 ? { background: 'var(--bg-soft)' } : undefined}>
                      {metricHeader.map((_, ci) => {
                        const v = r[ci]
                        const isLabel = ci === 0
                        const isComment = ci === metricHeader.length - 1
                        const neg = isNum(v) && v < 0
                        return (
                          <td key={ci} style={{
                            border: '1px solid var(--border)', padding: '8px 12px',
                            textAlign: isLabel || isComment ? 'left' : 'right',
                            fontWeight: isLabel ? 700 : 400,
                            color: neg ? 'var(--red)' : isComment ? 'var(--text-muted)' : undefined,
                            fontSize: isComment ? 12 : 13, whiteSpace: isComment ? 'normal' : 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {ci === 0 || isComment ? str(v) : fmtMetric(label, v)}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2>Notes &amp; Assumptions</h2></div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {notes.map((n, i) => <li key={i} style={{ fontSize: 13, lineHeight: 1.5 }}>{n}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

function SheetTable({ sheet, editing, onCell, onDeleteRow, onAddRow }: {
  sheet: { name: string; rows: (string | number)[][] }
  editing?: boolean
  onCell?: (rowIdx: number, colIdx: number, value: string) => void
  onDeleteRow?: (rowIdx: number) => void
  onAddRow?: () => void
}) {
  if (!sheet) return null
  const rows = sheet.rows
  const isNum = (v: string | number) => typeof v === 'number'
  // Row 0 is usually the sheet title; row 1 the column headers; the rest data.
  const titleRowIdx = rows[0]?.length === 1 ? 0 : -1
  const title = titleRowIdx === 0 ? String(rows[0][0]) : sheet.name
  const headerIdx = titleRowIdx === 0 ? 1 : 0
  const header = rows[headerIdx] ?? []
  const width = Math.max(header.length, ...rows.map((r) => r.length), 1)
  const fmtCell = (v: string | number) => (isNum(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? ''))
  // Body rows keep their absolute index in the sheet (for editing/removing).
  const body = rows.map((r, i) => ({ r, i })).filter(({ i }) => i > headerIdx)
  const border = '1px solid var(--border)'

  const editInput = (v: string | number, ri: number, ci: number) => (
    <input
      className="table-input"
      defaultValue={String(v ?? '')}
      onBlur={(e) => { if (e.target.value !== String(v ?? '')) onCell?.(ri, ci, e.target.value) }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      style={{ width: '100%', minWidth: 70, textAlign: isNum(v) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}
    />
  )

  return (
    <div className="panel">
      <div className="panel-header"><h2>{title}</h2></div>
      <div className="scroll-x">
        <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {editing && <th style={{ border, background: 'var(--bg-soft)', width: 30 }}></th>}
              {Array.from({ length: width }).map((_, ci) => {
                const h = header[ci] ?? ''
                const numeric = isNum(body[0]?.r[ci])
                return (
                  <th key={ci} style={{ border, padding: '7px 10px', background: 'var(--bg-soft)', textAlign: numeric ? 'right' : 'left', whiteSpace: 'nowrap', position: 'sticky', top: 0 }}>
                    {editing ? editInput(h, headerIdx, ci) : String(h ?? '')}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {body.map(({ r, i: ri }, bi) => {
              // A row whose first cell reads like a total/label gets emphasized.
              const label = String(r[0] ?? '')
              const isTotal = /total|avg|ending|net income|ebitda|gross|opening|assets|equity|liabilit/i.test(label)
              return (
                <tr key={ri} style={{ background: isTotal ? 'var(--accent-soft)' : bi % 2 ? 'var(--bg-soft)' : undefined }}>
                  {editing && (
                    <td style={{ border, textAlign: 'center' }}>
                      <button className="btn ghost small danger" title="Delete this row" onClick={() => onDeleteRow?.(ri)} style={{ padding: '2px 6px' }}>✕</button>
                    </td>
                  )}
                  {Array.from({ length: width }).map((_, ci) => {
                    const v = r[ci] ?? ''
                    const negative = isNum(v) && v < 0
                    return (
                      <td key={ci} style={{
                        border, padding: editing ? 3 : '6px 10px', textAlign: isNum(v) ? 'right' : 'left', whiteSpace: 'nowrap',
                        fontWeight: (isTotal || ci === 0) ? 600 : 400,
                        color: negative ? 'var(--red)' : undefined,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {editing ? editInput(v, ri, ci) : fmtCell(v)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing && (
        <button className="btn ghost small" onClick={() => onAddRow?.()} style={{ marginTop: 8 }}>+ Add row</button>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

interface Column {
  h: string
  f: (r: MonthRow) => string
  cls?: string
  clsFn?: (r: MonthRow) => string
}

function ModelTable({ caption, rows, columns, totals }: { caption: string; rows: MonthRow[]; columns: Column[]; totals: string[] }) {
  return (
    <div className="panel">
      <div className="panel-header"><h2>24-Month Detail</h2><p>{caption}</p></div>
      <div className="scroll-x">
        <table style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th>Month</th>
              {columns.map((c) => <th key={c.h} style={{ textAlign: 'right' }}>{c.h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.m} style={i % 2 ? { background: 'var(--bg-soft)' } : undefined}>
                <td style={{ whiteSpace: 'nowrap' }}><strong>M{r.m}</strong> <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{monthLabel(r.monthId)}</span></td>
                {columns.map((c) => <td key={c.h} className={`amount ${c.clsFn ? c.clsFn(r) : c.cls ?? ''}`}>{c.f(r)}</td>)}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Total</strong></td>
              {totals.map((t, i) => <td key={i} className="amount"><strong>{t}</strong></td>)}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

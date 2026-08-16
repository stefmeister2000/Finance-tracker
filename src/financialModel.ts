import type { FinancialModelAssumptions, WorkspaceData } from './types'
import { currentMonthId, shiftMonth } from './storage'
import { migrateCostItems, netPrice, totalCosts, DEFAULT_VAT } from './components/BusinessToolsPage'

export type Scenario = 'base' | 'downside'

export interface MonthRow {
  m: number
  monthId: string
  units: number
  revenue: number
  cogs: number
  fulfilment: number
  grossProfit: number
  opex: number
  ebitda: number
  tax: number
  netProfit: number
  investmentIn: number
  netCash: number
  cash: number
}

/** Sensible starting assumptions derived from the workspace's real data (products, fixed costs, funding). */
export function defaultsFrom(ws: WorkspaceData): FinancialModelAssumptions {
  const vat = ws.vatRate ?? DEFAULT_VAT
  const priced = (ws.products ?? []).filter((p) => p.sellingPrice > 0)
  const p0 = priced[0]
  const price = p0 ? netPrice(p0, vat) : 0
  const cogs = p0 ? totalCosts({ ...p0, costItems: p0.costItems ?? migrateCostItems(p0) }) : 0
  const fixed = (ws.fixedCosts ?? []).reduce((s, f) => s + f.monthlyCost, 0)
  return {
    startMonth: currentMonthId(),
    startingCash: 0,
    investment: ws.investorFunds ?? 0,
    pricePerUnit: +price.toFixed(2),
    cogsPerUnit: +cogs.toFixed(2),
    fulfilmentPerUnit: 0,
    unitsMonth1: 0,
    monthlyGrowthPct: 0,
    fixedOpexMonthly: +fixed.toFixed(2),
    marketingMonthly: 0,
    otherOpexMonthly: 0,
    taxRatePct: 0,
    downsideGrowthHaircutPct: 0,
    downsidePriceHaircutPct: 0,
    downsideUnitsHaircutPct: 0,
  }
}

/** Projects the 24-month model for a given scenario. */
export function project(a: FinancialModelAssumptions, scenario: Scenario): MonthRow[] {
  const price = a.pricePerUnit * (scenario === 'downside' ? 1 - a.downsidePriceHaircutPct / 100 : 1)
  const units1 = a.unitsMonth1 * (scenario === 'downside' ? 1 - a.downsideUnitsHaircutPct / 100 : 1)
  const growth = (a.monthlyGrowthPct - (scenario === 'downside' ? a.downsideGrowthHaircutPct : 0)) / 100
  const opex = a.fixedOpexMonthly + a.marketingMonthly + a.otherOpexMonthly
  let cash = a.startingCash
  const rows: MonthRow[] = []
  for (let m = 1; m <= 24; m++) {
    const units = units1 * Math.pow(1 + growth, m - 1)
    const revenue = units * price
    const cogs = units * a.cogsPerUnit
    const fulfilment = units * a.fulfilmentPerUnit
    const grossProfit = revenue - cogs - fulfilment
    const ebitda = grossProfit - opex
    const tax = ebitda > 0 ? ebitda * (a.taxRatePct / 100) : 0
    const netProfit = ebitda - tax
    const investmentIn = m === 1 ? a.investment : 0
    const netCash = netProfit + investmentIn
    cash += netCash
    rows.push({
      m, monthId: shiftMonth(a.startMonth, m - 1), units, revenue, cogs, fulfilment,
      grossProfit, opex, ebitda, tax, netProfit, investmentIn, netCash, cash,
    })
  }
  return rows
}

export const sumRows = (rows: MonthRow[], k: keyof MonthRow) => rows.reduce((s, r) => s + (r[k] as number), 0)

import type { WorkspaceData } from './types'
import { monthLabel, sortedMonthIds } from './storage'
import { defaultsFrom, project } from './financialModel'
import { migrateCostItems, netPrice, totalCosts, DEFAULT_VAT } from './components/BusinessToolsPage'

type Cell = string | number | undefined | null
type Rows = Cell[][]

function csvEscape(v: Cell): string {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: Rows): string {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n')
}

/** Tab-separated — pastes cleanly into spreadsheet cells (Google Sheets, Excel, Numbers). */
export function toTsv(rows: Rows): string {
  return rows.map((r) => r.map((c) => String(c ?? '').replace(/[\t\n]+/g, ' ')).join('\t')).join('\n')
}

/** Copies text to the clipboard, resolving true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const n2 = (v: number) => v.toFixed(2)

// ── Per-dataset builders (return CSV rows for the active workspace) ──────────────

export function transactionsRows(ws: WorkspaceData): Rows {
  const catById = new Map(ws.categories.map((c) => [c.id, c.name]))
  const cardById = new Map(ws.cards.map((c) => [c.id, c.name]))
  const rows: Rows = [['Month', 'Date', 'Description', 'Category', 'Type', 'Card', 'Amount', 'Currency']]
  for (const mid of sortedMonthIds(ws.months)) {
    for (const t of ws.months[mid].transactions) {
      rows.push([
        mid, t.date,
        t.description.replace(/\s*\[(adspend|startup|copied):[^\]]+\]/, '').replace(/\s*\(stripe:[^)]+\)/, ''),
        catById.get(t.categoryId) ?? '', t.type, cardById.get(t.cardId) ?? '', n2(t.amount), ws.currency,
      ])
    }
  }
  return rows
}

export function invoicesRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Number', 'Type', 'Party', 'Description', 'Date', 'Due date', 'Amount', 'Currency', 'Status']]
  for (const i of ws.invoices ?? []) {
    rows.push([i.number ?? '', i.type, i.party, i.description, i.date, i.dueDate ?? '', n2(i.amount), ws.currency, i.status])
  }
  return rows
}

export function productsRows(ws: WorkspaceData): Rows {
  const vat = ws.vatRate ?? DEFAULT_VAT
  const rows: Rows = [['Product', 'Category', 'Selling price', 'VAT included', 'Net (ex-VAT)', 'Total cost', 'Net profit', 'Gross margin %', 'Currency']]
  for (const p of ws.products ?? []) {
    const items = p.costItems ?? migrateCostItems(p)
    const net = netPrice(p, vat)
    const charges = (p.chargeItems ?? []).reduce((s, c) => s + c.amount, 0)
    const revenue = net + charges
    const cost = totalCosts({ ...p, costItems: items })
    const profit = revenue - cost
    rows.push([p.name, p.category, n2(p.sellingPrice), p.vatIncluded ? 'yes' : 'no', n2(net), n2(cost), n2(profit), revenue > 0 ? (profit / revenue * 100).toFixed(1) : '0', ws.currency])
  }
  return rows
}

export function fixedCostsRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Type', 'Category', 'Name', 'Monthly cost', 'Currency']]
  for (const f of ws.fixedCosts ?? []) rows.push([f.type, f.category, f.name, n2(f.monthlyCost), ws.currency])
  for (const f of ws.fixedIncome ?? []) rows.push(['income', f.category, f.name, n2(f.monthlyCost), ws.currency])
  for (const c of ws.kind === 'personal' ? ws.freelanceClients ?? [] : []) {
    if (c.fixedIncome) rows.push(['income', 'Freelance', c.client, n2(c.amount), ws.currency])
  }
  return rows
}

export function capTableRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Shareholder', '% owned', 'Amount paid', 'Implied valuation', 'Notes', 'Currency']]
  for (const h of ws.shareholders ?? []) {
    const val = h.amountInvested > 0 && h.percent > 0 ? n2(h.amountInvested / (h.percent / 100)) : ''
    rows.push([h.name, h.percent, n2(h.amountInvested), val, h.notes ?? '', ws.currency])
  }
  return rows
}

export function startupCostsRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Date', 'Description', 'Category', 'Amount', 'Planned/Spent', 'Notes', 'Currency']]
  for (const c of ws.startupCosts ?? []) {
    rows.push([c.date, c.description, c.category, n2(c.amount), c.planned ? 'planned' : 'spent', c.notes ?? '', ws.currency])
  }
  const total = (ws.startupCosts ?? []).reduce((s, c) => s + c.amount, 0)
  rows.push(['', 'TOTAL', '', n2(total), '', '', ws.currency])
  return rows
}

export function fundAllocationsRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Bucket', 'Planned', 'Spent', 'Left', 'Notes', 'Currency']]
  for (const a of ws.fundAllocations ?? []) rows.push([a.category, n2(a.planned), n2(a.spent ?? 0), n2(a.planned - (a.spent ?? 0)), a.notes ?? '', ws.currency])
  return rows
}

export function inventoryRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Item', 'Supplier', 'Quantity', 'Unit cost', 'Total', 'Order date', 'Arrival', 'Received', 'Paid', 'Currency']]
  for (const p of ws.inventoryPurchases ?? []) {
    rows.push([p.item, p.supplier ?? '', p.quantity, n2(p.unitCost), n2(p.quantity * p.unitCost), p.orderDate ?? '', p.arrivalDate ?? '', p.received ? 'yes' : 'no', p.paid ? 'yes' : 'no', ws.currency])
  }
  return rows
}

export function retailRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Retailer', 'Purchase terms', 'Margin %', 'Status', 'Notes']]
  for (const r of ws.retailPartners ?? []) rows.push([r.name, r.purchaseTerms ?? '', r.marginPct ?? 0, r.status ?? '', r.notes ?? ''])
  return rows
}

export function influencersRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Name', 'Platform', 'Handle', 'Commission %', 'Fixed per sale', 'Notes', 'Currency']]
  for (const i of ws.influencers ?? []) rows.push([i.name, i.platform, i.handle ?? '', i.commissionPct, n2(i.fixedPerSale ?? 0), i.notes ?? '', ws.currency])
  return rows
}

export function receivablesRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Person', 'Description', 'Amount', 'Month', 'Expected date', 'Paid', 'Currency']]
  for (const r of ws.receivables ?? []) rows.push([r.person, r.description ?? '', n2(r.amount), r.monthId, r.expectedDate ?? '', r.paid ? 'yes' : 'no', ws.currency])
  return rows
}

export function freelanceRows(ws: WorkspaceData): Rows {
  const rows: Rows = [['Client', 'Work', 'Amount', 'Payment date', 'Paid', 'Currency']]
  for (const c of ws.kind === 'personal' ? ws.freelanceClients ?? [] : []) rows.push([c.client, c.description ?? '', n2(c.amount), c.paymentDate ?? '', c.paid ? 'yes' : 'no', ws.currency])
  return rows
}

/** The 24-month financial model (P&L + cash flow) for a scenario. */
export function financialModelRows(ws: WorkspaceData, scenario: 'base' | 'downside'): Rows {
  const a = ws.financialModel ?? defaultsFrom(ws)
  const rows: Rows = [['Month', 'Label', 'Units', 'Revenue', 'COGS', 'Fulfilment', 'Gross profit', 'Opex', 'EBITDA', 'Tax', 'Net profit', 'Investment', 'Net cash', 'Cash balance', 'Currency']]
  for (const r of project(a, scenario)) {
    rows.push([`M${r.m}`, monthLabel(r.monthId), Math.round(r.units), n2(r.revenue), n2(r.cogs), n2(r.fulfilment), n2(r.grossProfit), n2(r.opex), n2(r.ebitda), n2(r.tax), n2(r.netProfit), n2(r.investmentIn), n2(r.netCash), n2(r.cash), ws.currency])
  }
  return rows
}

/** Accountant-facing annual P&L + cash summary: Year 1, Year 2 and 24-month total. */
export function annualSummaryRows(ws: WorkspaceData, scenario: 'base' | 'downside'): Rows {
  const a = ws.financialModel ?? defaultsFrom(ws)
  const all = project(a, scenario)
  const y1 = all.slice(0, 12)
  const y2 = all.slice(12, 24)
  const S = (rows: typeof all, k: keyof (typeof all)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0)
  const line = (label: string, k: keyof (typeof all)[number]) => [label, n2(S(y1, k)), n2(S(y2, k)), n2(S(all, k))]
  return [
    ['Line (' + scenario + ')', 'Year 1', 'Year 2', 'Total 24 mo'],
    ['Units sold', Math.round(S(y1, 'units')), Math.round(S(y2, 'units')), Math.round(S(all, 'units'))],
    line('Revenue', 'revenue'),
    line('COGS', 'cogs'),
    line('Fulfilment', 'fulfilment'),
    line('Gross profit', 'grossProfit'),
    line('Operating costs', 'opex'),
    line('EBITDA', 'ebitda'),
    line('Tax', 'tax'),
    line('Net profit', 'netProfit'),
    line('Investment in', 'investmentIn'),
    ['Ending cash', n2(y1[y1.length - 1]?.cash ?? 0), n2(y2[y2.length - 1]?.cash ?? 0), n2(all[all.length - 1]?.cash ?? 0)],
  ]
}

export function assumptionsRows(ws: WorkspaceData): Rows {
  const a = ws.financialModel ?? defaultsFrom(ws)
  return [
    ['Assumption', 'Value'],
    ['Start month', a.startMonth],
    ['Starting cash', n2(a.startingCash)],
    ['Investment injected', n2(a.investment)],
    ['Price / unit (ex-VAT)', n2(a.pricePerUnit)],
    ['COGS / unit', n2(a.cogsPerUnit)],
    ['Fulfilment / unit', n2(a.fulfilmentPerUnit)],
    ['Units month 1', a.unitsMonth1],
    ['Monthly growth %', a.monthlyGrowthPct],
    ['Fixed opex / month', n2(a.fixedOpexMonthly)],
    ['Marketing / month', n2(a.marketingMonthly)],
    ['Other opex / month', n2(a.otherOpexMonthly)],
    ['Tax rate %', a.taxRatePct],
    ['Downside: growth haircut (pts)', a.downsideGrowthHaircutPct],
    ['Downside: price haircut %', a.downsidePriceHaircutPct],
    ['Downside: units haircut %', a.downsideUnitsHaircutPct],
  ]
}

// ── A single dataset the UI can list and download ────────────────────────────────

export interface Exportable {
  key: string
  label: string
  build: (ws: WorkspaceData) => Rows
  has: (ws: WorkspaceData) => boolean
}

export const EXPORTS: Exportable[] = [
  { key: 'transactions', label: 'Transactions (all months)', build: transactionsRows, has: (w) => Object.values(w.months).some((m) => m.transactions.length > 0) },
  { key: 'invoices', label: 'Invoices', build: invoicesRows, has: (w) => (w.invoices ?? []).length > 0 },
  { key: 'products', label: 'Products & margins', build: productsRows, has: (w) => (w.products ?? []).length > 0 },
  { key: 'fixed-costs', label: 'Fixed costs & income', build: fixedCostsRows, has: (w) => (w.fixedCosts ?? []).length > 0 || (w.fixedIncome ?? []).length > 0 || (w.kind === 'personal' && (w.freelanceClients ?? []).some((c) => c.fixedIncome)) },
  { key: 'assumptions', label: 'Financial model — assumptions', build: assumptionsRows, has: () => true },
  { key: 'summary-base', label: 'Financial plan — annual summary (base)', build: (w) => annualSummaryRows(w, 'base'), has: () => true },
  { key: 'summary-downside', label: 'Financial plan — annual summary (downside)', build: (w) => annualSummaryRows(w, 'downside'), has: () => true },
  { key: 'model-base', label: 'Financial model — 24 months (base)', build: (w) => financialModelRows(w, 'base'), has: () => true },
  { key: 'model-downside', label: 'Financial model — 24 months (downside)', build: (w) => financialModelRows(w, 'downside'), has: () => true },
  { key: 'cap-table', label: 'Cap table (shareholders)', build: capTableRows, has: (w) => (w.shareholders ?? []).length > 0 },
  { key: 'startup-costs', label: 'Startup costs', build: startupCostsRows, has: (w) => (w.startupCosts ?? []).length > 0 },
  { key: 'use-of-funds', label: 'Use of funds', build: fundAllocationsRows, has: (w) => (w.fundAllocations ?? []).length > 0 },
  { key: 'inventory', label: 'Inventory & supply', build: inventoryRows, has: (w) => (w.inventoryPurchases ?? []).length > 0 },
  { key: 'retail', label: 'Retail partners', build: retailRows, has: (w) => (w.retailPartners ?? []).length > 0 },
  { key: 'influencers', label: 'Influencers', build: influencersRows, has: (w) => (w.influencers ?? []).length > 0 },
  { key: 'receivables', label: 'Owed to you', build: receivablesRows, has: (w) => (w.receivables ?? []).length > 0 },
  { key: 'freelance', label: 'Freelance clients', build: freelanceRows, has: (w) => w.kind === 'personal' && (w.freelanceClients ?? []).length > 0 },
]

export function exportOne(ws: WorkspaceData, e: Exportable) {
  downloadText(`${slug(ws.name)}-${e.key}.csv`, toCsv(e.build(ws)))
}

/** Copy one dataset as TSV so it pastes straight into spreadsheet cells. */
export function copyOne(ws: WorkspaceData, e: Exportable): Promise<boolean> {
  return copyText(toTsv(e.build(ws)))
}

function fullPlanParts(ws: WorkspaceData, sep: (rows: Rows) => string): string {
  const parts: string[] = []
  parts.push(`${ws.name} — Finance Plan`)
  parts.push(`Generated ${new Date().toLocaleString()} · Currency: ${ws.currency}`)
  for (const e of EXPORTS) {
    if (!e.has(ws)) continue
    parts.push('')
    parts.push(e.label.toUpperCase())
    parts.push(sep(e.build(ws)))
  }
  return parts.join('\n')
}

/** The entire finance plan for a workspace as one readable multi-section CSV file. */
export function exportFullPlan(ws: WorkspaceData) {
  downloadText(`${slug(ws.name)}-finance-plan-${new Date().toISOString().slice(0, 10)}.csv`, fullPlanParts(ws, toCsv))
}

/** Copy the entire finance plan as TSV — paste into a spreadsheet, each section stacks in rows. */
export function copyFullPlan(ws: WorkspaceData): Promise<boolean> {
  return copyText(fullPlanParts(ws, toTsv))
}

// ── BV financial plan (financieel plan for incorporation) ────────────────────────
// The curated, legally-relevant subset a notary/accountant needs — not operational data.

function bvPlanParts(ws: WorkspaceData, sep: (rows: Rows) => string): string {
  // If a full plan was imported (accountant spreadsheet), export exactly that.
  if (ws.importedPlan) {
    const parts: string[] = [`${ws.name} — ${ws.importedPlan.name}`, `Imported ${new Date(ws.importedPlan.importedAt).toLocaleDateString()} · Currency ${ws.currency}`]
    for (const s of ws.importedPlan.sheets) {
      parts.push('')
      parts.push(s.name.toUpperCase())
      parts.push(sep(s.rows as Rows))
    }
    return parts.join('\n')
  }
  const raised = ws.investorFunds ?? 0
  const startup = (ws.startupCosts ?? []).reduce((s, c) => s + c.amount, 0)
  const sections: [string, Rows][] = [
    ['1. HYPOTHESES / ASSUMPTIONS', assumptionsRows(ws)],
    ['2. FINANCING — SHARE CAPITAL & SHAREHOLDERS', capTableRows(ws)],
    ['3. STARTUP COSTS / INVESTMENTS', startupCostsRows(ws)],
    ['4. USE OF FUNDS', fundAllocationsRows(ws)],
    ['5. PROJECTED P&L — ANNUAL (BASE CASE)', annualSummaryRows(ws, 'base')],
    ['6. PROJECTED P&L — ANNUAL (DOWNSIDE CASE)', annualSummaryRows(ws, 'downside')],
    ['7. PROJECTED CASH FLOW — 24 MONTHS (BASE CASE)', financialModelRows(ws, 'base')],
  ]
  const parts: string[] = []
  parts.push(`${ws.name} — FINANCIAL PLAN (BV incorporation)`)
  parts.push(`Prepared ${new Date().toLocaleDateString()} · Currency ${ws.currency}`)
  parts.push(sep([
    ['Financing summary', ''],
    ['Share capital / investment', n2(raised)],
    ['Startup costs / investments', n2(startup)],
  ]))
  for (const [title, rows] of sections) {
    parts.push('')
    parts.push(title)
    parts.push(sep(rows))
  }
  return parts.join('\n')
}

export function exportBvPlan(ws: WorkspaceData) {
  downloadText(`${slug(ws.name)}-bv-financial-plan-${new Date().toISOString().slice(0, 10)}.csv`, bvPlanParts(ws, toCsv))
}

export function copyBvPlan(ws: WorkspaceData): Promise<boolean> {
  return copyText(bvPlanParts(ws, toTsv))
}

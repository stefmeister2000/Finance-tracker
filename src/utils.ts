import type { AdCampaign, MonthData, NetWorthAccount, NetWorthCategoryDef, Transaction, WorkspaceData } from './types'
import { sortedMonthIds } from './storage'
import { normalizeDescription, SUBSCRIPTION_KEYWORDS } from './categorize'

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** Strips internal bookkeeping tags (adspend/startup/copied/stripe) from a transaction description for display. */
export function cleanDescription(description: string): string {
  return description
    .replace(/\s*\[(adspend|startup|copied):[^\]]+\]/, '')
    .replace(/\s*\(stripe:[^)]+\)/, '')
}

/** Returns a small badge descriptor (label, color) if the description carries a copied-from or Stripe tag, else null. */
export function descriptionBadge(description: string): { label: string; bg: string; color: string } | null {
  const copiedMatch = description.match(/\[copied:(personal|business):[^\]]+\]/)
  if (copiedMatch) {
    const fromBiz = copiedMatch[1] === 'business'
    return fromBiz
      ? { label: '🏢 from Business', bg: '#6366f122', color: '#6366f1' }
      : { label: '👤 from Personal', bg: '#22c55e22', color: '#22c55e' }
  }
  if (description.includes('(stripe:')) {
    return { label: '💳 Stripe', bg: '#635bff22', color: '#635bff' }
  }
  return null
}

export function monthTotals(month: MonthData | undefined) {
  let income = 0
  let expense = 0
  if (month) {
    for (const t of month.transactions) {
      if (t.type === 'income') income += t.amount
      else if (t.type === 'expense') expense += t.amount
    }
  }
  return { income, expense, net: income - expense }
}

export function totalsByCard(month: MonthData) {
  const map = new Map<string, { income: number; expense: number }>()
  for (const t of month.transactions) {
    const entry = map.get(t.cardId) ?? { income: 0, expense: 0 }
    if (t.type === 'income') entry.income += t.amount
    else if (t.type === 'expense') entry.expense += t.amount
    map.set(t.cardId, entry)
  }
  return map
}

export function totalsByCategory(month: MonthData, type: 'income' | 'expense') {
  const map = new Map<string, number>()
  for (const t of month.transactions) {
    if (t.type !== type) continue
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
  }
  return map
}

/** Totals by category, summed across all of the given months. */
export function totalsByCategoryRange(ws: WorkspaceData, monthIds: string[], type: 'income' | 'expense') {
  const map = new Map<string, number>()
  for (const id of monthIds) {
    const month = ws.months[id]
    if (!month) continue
    for (const t of month.transactions) {
      if (t.type !== type) continue
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount)
    }
  }
  return map
}

export function previousMonthId(ws: WorkspaceData, monthId: string): string | undefined {
  const ids = sortedMonthIds(ws.months).filter((id) => id < monthId)
  return ids.length ? ids[ids.length - 1] : undefined
}

/** All month ids relevant to this workspace: months with transactions + months with net worth data. */
export function allMonthIds(ws: WorkspaceData): string[] {
  const set = new Set<string>(Object.keys(ws.months))
  for (const acc of ws.netWorthAccounts) {
    for (const m of Object.keys(acc.values)) set.add(m)
  }
  return Array.from(set).sort()
}

/** Value of an account at a given month, carrying forward the most recent prior recorded value. */
export function accountValueAt(account: NetWorthAccount, monthId: string): number {
  if (monthId in account.values) return account.values[monthId]
  const priorMonths = Object.keys(account.values)
    .filter((m) => m <= monthId)
    .sort()
  if (priorMonths.length === 0) return 0
  return account.values[priorMonths[priorMonths.length - 1]]
}

export function netWorthAtMonth(ws: WorkspaceData, monthId: string): number {
  let total = 0
  for (const acc of ws.netWorthAccounts) {
    const value = accountValueAt(acc, monthId)
    total += acc.type === 'asset' ? value : -value
  }
  return total
}

export function netWorthHistory(ws: WorkspaceData) {
  return allMonthIds(ws).map((id) => ({ month: id, netWorth: netWorthAtMonth(ws, id) }))
}

export interface NetWorthCategoryGroup {
  category: NetWorthCategoryDef
  accounts: NetWorthAccount[]
  total: number
}

/** Groups net worth accounts of a given type by category, with each group's total at the given month. */
export function netWorthByCategory(
  ws: WorkspaceData,
  type: 'asset' | 'liability',
  monthId: string,
): NetWorthCategoryGroup[] {
  const groups: NetWorthCategoryGroup[] = []
  for (const category of ws.netWorthCategories.filter((c) => c.type === type)) {
    const accounts = ws.netWorthAccounts.filter((a) => a.type === type && a.category === category.id)
    if (accounts.length === 0) continue
    const total = accounts.reduce((s, a) => s + accountValueAt(a, monthId), 0)
    groups.push({ category, accounts, total })
  }
  return groups.sort((a, b) => b.total - a.total)
}

/** Total of all liquid asset categories (e.g. cash, easily-sellable investments) minus total liabilities. */
export function liquidNetWorth(ws: WorkspaceData, monthId: string): number {
  const liquidCategoryIds = new Set(
    ws.netWorthCategories.filter((c) => c.type === 'asset' && c.liquid).map((c) => c.id),
  )
  let liquidAssets = 0
  let liabilities = 0
  for (const acc of ws.netWorthAccounts) {
    const value = accountValueAt(acc, monthId)
    if (acc.type === 'asset') {
      if (liquidCategoryIds.has(acc.category)) liquidAssets += value
    } else {
      liabilities += value
    }
  }
  return liquidAssets - liabilities
}

export function cashFlowHistory(ws: WorkspaceData) {
  return sortedMonthIds(ws.months).map((id) => {
    const totals = monthTotals(ws.months[id])
    return { month: id, ...totals }
  })
}

export interface AdCampaignStats {
  campaign: AdCampaign
  spend: number
  revenue: number
  conversions: number
  clicks: number
  roas: number | null // revenue / spend
  cpa: number | null // spend / conversions
  entryCount: number
}

/** Per-campaign totals across all logged spend entries, sorted by ROAS (best performing first). */
export function adCampaignStats(ws: WorkspaceData): AdCampaignStats[] {
  const entries = ws.adSpendEntries ?? []
  return (ws.adCampaigns ?? [])
    .map((campaign) => {
      const own = entries.filter((e) => e.campaignId === campaign.id)
      const spend = own.reduce((s, e) => s + e.spend, 0)
      const revenue = own.reduce((s, e) => s + e.revenue, 0)
      const conversions = own.reduce((s, e) => s + e.conversions, 0)
      const clicks = own.reduce((s, e) => s + (e.clicks ?? 0), 0)
      return {
        campaign,
        spend,
        revenue,
        conversions,
        clicks,
        roas: spend > 0 ? revenue / spend : null,
        cpa: conversions > 0 ? spend / conversions : null,
        entryCount: own.length,
      }
    })
    .sort((a, b) => {
      if (a.roas === null && b.roas === null) return b.spend - a.spend
      if (a.roas === null) return 1
      if (b.roas === null) return -1
      return b.roas - a.roas
    })
}

/** Overall ad spend totals across all campaigns. */
export function adSpendTotals(ws: WorkspaceData) {
  const entries = ws.adSpendEntries ?? []
  const spend = entries.reduce((s, e) => s + e.spend, 0)
  const revenue = entries.reduce((s, e) => s + e.revenue, 0)
  const conversions = entries.reduce((s, e) => s + e.conversions, 0)
  return { spend, revenue, conversions, roas: spend > 0 ? revenue / spend : null }
}

/** Ad spend + revenue grouped by month (YYYY-MM), sorted chronologically. */
export function adSpendHistory(ws: WorkspaceData) {
  const map = new Map<string, { spend: number; revenue: number }>()
  for (const e of ws.adSpendEntries ?? []) {
    const month = e.date.slice(0, 7)
    const entry = map.get(month) ?? { spend: 0, revenue: 0 }
    entry.spend += e.spend
    entry.revenue += e.revenue
    map.set(month, entry)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({ month, ...totals }))
}

/**
 * Reconciles adSpendEntries into expense transactions in the corresponding months.
 * Each ad spend entry gets a tagged transaction `[adspend:{id}]` so they can be
 * identified and updated/removed when entries change.
 */
export function reconcileAdSpendTransactions(ws: WorkspaceData): WorkspaceData {
  const campaignMap = new Map((ws.adCampaigns ?? []).map((c) => [c.id, c]))
  const adCat =
    ws.categories.find(
      (c) =>
        c.type === 'expense' &&
        (c.name.toLowerCase().includes('market') ||
          c.name.toLowerCase().includes('advert') ||
          c.name.toLowerCase().includes('ad')),
    ) ?? ws.categories.find((c) => c.type === 'expense')
  const cardId = ws.cards[0]?.id ?? ''
  const dismissed = new Set(ws.dismissedReconcileTags ?? [])
  const months = { ...ws.months }
  const keepTxIds = new Set<string>()

  for (const entry of ws.adSpendEntries ?? []) {
    if (entry.spend <= 0) continue
    if (dismissed.has(`adspend:${entry.id}`)) continue
    const targetMonthId = entry.date.slice(0, 7)
    const campaign = campaignMap.get(entry.campaignId)
    const tag = `[adspend:${entry.id}]`
    const desc = `Ad Spend: ${campaign?.name ?? 'Campaign'} ${tag}`

    // Find the existing tagged transaction anywhere — its current month bucket may be stale
    // if the entry's date was edited since the last reconcile, so search isn't limited to targetMonthId.
    let foundMonthId: string | null = null
    let foundTx: Transaction | null = null
    for (const [mid, month] of Object.entries(months)) {
      const tx = month.transactions.find((t) => t.description.includes(tag))
      if (tx) { foundMonthId = mid; foundTx = tx; break }
    }

    if (!months[targetMonthId]) months[targetMonthId] = { id: targetMonthId, transactions: [] }

    if (foundTx && foundMonthId) {
      if (foundMonthId !== targetMonthId) {
        // Move the transaction into the month that matches its current source date.
        months[foundMonthId] = {
          ...months[foundMonthId],
          transactions: months[foundMonthId].transactions.filter((t) => t.id !== foundTx!.id),
        }
        months[targetMonthId] = {
          ...months[targetMonthId],
          transactions: [...months[targetMonthId].transactions, { ...foundTx, amount: entry.spend, description: desc, date: entry.date }],
        }
      } else {
        months[targetMonthId] = {
          ...months[targetMonthId],
          transactions: months[targetMonthId].transactions.map((t) =>
            t.id === foundTx!.id ? { ...t, amount: entry.spend, description: desc, date: entry.date } : t,
          ),
        }
      }
      keepTxIds.add(foundTx.id)
    } else {
      const newTx = {
        id: crypto.randomUUID(),
        date: entry.date,
        description: desc,
        amount: entry.spend,
        type: 'expense' as const,
        categoryId: adCat?.id ?? '',
        cardId,
      }
      months[targetMonthId] = { ...months[targetMonthId], transactions: [...months[targetMonthId].transactions, newTx] }
      keepTxIds.add(newTx.id)
    }
  }

  // Remove stale adspend transactions (entry deleted, spend set to 0, or dismissed by the user)
  for (const monthId of Object.keys(months)) {
    const month = months[monthId]
    const filtered = month.transactions.filter((t) => !t.description.includes('[adspend:') || keepTxIds.has(t.id))
    if (filtered.length !== month.transactions.length) {
      months[monthId] = { ...month, transactions: filtered }
    }
  }

  return { ...ws, months }
}

/** Reconciles startupCosts into expense transactions tagged `[startup:{id}]`. */
export function reconcileStartupCostTransactions(ws: WorkspaceData): WorkspaceData {
  const cardId = ws.cards[0]?.id ?? ''
  const dismissed = new Set(ws.dismissedReconcileTags ?? [])
  const months = { ...ws.months }
  const keepTxIds = new Set<string>()

  for (const cost of ws.startupCosts ?? []) {
    if (cost.planned) continue
    if (cost.amount <= 0 || !cost.date) continue
    if (dismissed.has(`startup:${cost.id}`)) continue
    const targetMonthId = cost.date.slice(0, 7)
    const tag = `[startup:${cost.id}]`
    const desc = `${cost.description} ${tag}`
    const cat = ws.categories.find(
      (c) => c.type === 'expense' && c.name.toLowerCase() === cost.category.toLowerCase(),
    )
    const categoryId = cat?.id ?? (ws.categories.find((c) => c.type === 'expense')?.id ?? '')

    // Find the existing tagged transaction anywhere — its current month bucket may be stale
    // if the cost's date was edited since the last reconcile.
    let foundMonthId: string | null = null
    let foundTx: Transaction | null = null
    for (const [mid, month] of Object.entries(months)) {
      const tx = month.transactions.find((t) => t.description.includes(tag))
      if (tx) { foundMonthId = mid; foundTx = tx; break }
    }

    if (!months[targetMonthId]) months[targetMonthId] = { id: targetMonthId, transactions: [] }

    if (foundTx && foundMonthId) {
      if (foundMonthId !== targetMonthId) {
        months[foundMonthId] = {
          ...months[foundMonthId],
          transactions: months[foundMonthId].transactions.filter((t) => t.id !== foundTx!.id),
        }
        months[targetMonthId] = {
          ...months[targetMonthId],
          transactions: [...months[targetMonthId].transactions, { ...foundTx, amount: cost.amount, description: desc, date: cost.date, categoryId }],
        }
      } else {
        months[targetMonthId] = {
          ...months[targetMonthId],
          transactions: months[targetMonthId].transactions.map((t) =>
            t.id === foundTx!.id ? { ...t, amount: cost.amount, description: desc, date: cost.date, categoryId } : t,
          ),
        }
      }
      keepTxIds.add(foundTx.id)
    } else {
      const newTx = {
        id: crypto.randomUUID(),
        date: cost.date,
        description: desc,
        amount: cost.amount,
        type: 'expense' as const,
        categoryId,
        cardId,
      }
      months[targetMonthId] = { ...months[targetMonthId], transactions: [...months[targetMonthId].transactions, newTx] }
      keepTxIds.add(newTx.id)
    }
  }

  for (const monthId of Object.keys(months)) {
    const month = months[monthId]
    const filtered = month.transactions.filter((t) => !t.description.includes('[startup:') || keepTxIds.has(t.id))
    if (filtered.length !== month.transactions.length) {
      months[monthId] = { ...month, transactions: filtered }
    }
  }

  return { ...ws, months }
}

export interface SubscriptionInfo {
  key: string
  description: string
  categoryId: string
  cardId: string
  amount: number
  occurrences: number
  months: string[]
  lastDate: string
  monthlyEstimate: number
  annualEstimate: number
  flaggedRecurring: boolean
  /** True if the monthly cost has been manually overridden by the user. */
  overridden: boolean
}

/** Groups amounts into clusters where each member is within 10% of the cluster's running average, returning the largest cluster. */
function largestConsistentCluster<T extends { t: Transaction }>(entries: T[]): T[] {
  const sorted = entries.slice().sort((a, b) => a.t.amount - b.t.amount)
  let best: T[] = []
  for (let i = 0; i < sorted.length; i++) {
    const cluster: T[] = [sorted[i]]
    let sum = sorted[i].t.amount
    for (let j = i + 1; j < sorted.length; j++) {
      const avg = sum / cluster.length
      if (Math.abs(sorted[j].t.amount - avg) / avg <= 0.1) {
        cluster.push(sorted[j])
        sum += sorted[j].t.amount
      } else {
        break
      }
    }
    if (cluster.length > best.length) best = cluster
  }
  return best
}

/**
 * Detects likely recurring subscriptions by grouping transactions with the same
 * description + card. A group is flagged as a subscription if it:
 *  - matches a known subscription/membership keyword (e.g. Netflix, Spotify, Meta Pay), or
 *  - appears with similar amounts across 2+ different months, or
 *  - appears 3+ times with similar amounts within a single month (e.g. daily ad spend), or
 *  - is manually flagged as recurring.
 */
export function detectSubscriptions(ws: WorkspaceData): SubscriptionInfo[] {
  const groups = new Map<string, { t: Transaction; month: string }[]>()

  for (const monthId of sortedMonthIds(ws.months)) {
    for (const t of ws.months[monthId].transactions) {
      if (t.type !== 'expense') continue
      if (t.ignoreSubscription) continue
      const norm = normalizeDescription(t.description)
      const key = `${norm}|${t.cardId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ t, month: monthId })
    }
  }

  const results: SubscriptionInfo[] = []
  for (const [key, entries] of groups) {
    const months = Array.from(new Set(entries.map((e) => e.month))).sort()
    const flaggedRecurring = entries.some((e) => e.t.recurring)
    const desc = entries[0].t.description.toLowerCase()
    const matchesKnownSubscription = SUBSCRIPTION_KEYWORDS.some((kw) => desc.includes(kw.trim()))

    const cluster = largestConsistentCluster(entries)
    const clusterMonths = new Set(cluster.map((e) => e.month))

    const qualifies =
      flaggedRecurring ||
      matchesKnownSubscription ||
      months.length >= 2 ||
      cluster.length >= 3
    if (!qualifies) continue

    const amounts = cluster.map((e) => e.t.amount)
    const sum = amounts.reduce((s, a) => s + a, 0)
    const override = ws.subscriptionOverrides?.[key]
    const monthlyEstimate = override ?? sum / Math.max(1, clusterMonths.size)

    const last = entries.slice().sort((a, b) => a.t.date.localeCompare(b.t.date))[entries.length - 1]
    results.push({
      key,
      description: last.t.description,
      categoryId: last.t.categoryId,
      cardId: last.t.cardId,
      amount: last.t.amount,
      occurrences: entries.length,
      months,
      lastDate: last.t.date,
      monthlyEstimate,
      annualEstimate: monthlyEstimate * 12,
      flaggedRecurring,
      overridden: override !== undefined,
    })
  }

  return results.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)
}

import { v4 as uuid } from 'uuid'
import type { AppData, MonthData, NetWorthCategoryDef, WorkspaceData } from './types'
import { DEFAULT_NET_WORTH_CATEGORIES } from './types'

const STORAGE_KEY = 'finance-tracker-data-v2'
const OLD_STORAGE_KEY = 'finance-tracker-data-v1'

function defaultCategories() {
  return [
    { id: uuid(), name: 'Salary', type: 'income' as const, color: '#22c55e' },
    { id: uuid(), name: 'Freelance', type: 'income' as const, color: '#10b981' },
    { id: uuid(), name: 'Other Income', type: 'income' as const, color: '#84cc16' },

    { id: uuid(), name: 'Groceries', type: 'expense' as const, color: '#f59e0b' },
    { id: uuid(), name: 'Rent / Mortgage', type: 'expense' as const, color: '#ef4444' },
    { id: uuid(), name: 'Utilities', type: 'expense' as const, color: '#f97316' },
    { id: uuid(), name: 'Transport', type: 'expense' as const, color: '#3b82f6' },
    { id: uuid(), name: 'Dining Out', type: 'expense' as const, color: '#ec4899' },
    { id: uuid(), name: 'Shopping', type: 'expense' as const, color: '#a855f7' },
    { id: uuid(), name: 'Health', type: 'expense' as const, color: '#14b8a6' },
    { id: uuid(), name: 'Entertainment', type: 'expense' as const, color: '#6366f1' },
    { id: uuid(), name: 'Subscriptions', type: 'expense' as const, color: '#8b5cf6' },
    { id: uuid(), name: 'Software & Tools', type: 'expense' as const, color: '#0ea5e9' },
    { id: uuid(), name: 'Savings & Investments', type: 'expense' as const, color: '#06b6d4' },
    { id: uuid(), name: 'Other', type: 'expense' as const, color: '#64748b' },

    { id: uuid(), name: 'Bank Transfer', type: 'ignore' as const, color: '#94a3b8' },
  ]
}

function defaultBusinessCategories() {
  return [
    { id: uuid(), name: 'Sales Revenue', type: 'income' as const, color: '#22c55e' },
    { id: uuid(), name: 'Services', type: 'income' as const, color: '#10b981' },
    { id: uuid(), name: 'Other Income', type: 'income' as const, color: '#84cc16' },

    { id: uuid(), name: 'Software & Tools', type: 'expense' as const, color: '#8b5cf6' },
    { id: uuid(), name: 'Marketing', type: 'expense' as const, color: '#ec4899' },
    { id: uuid(), name: 'Office & Rent', type: 'expense' as const, color: '#ef4444' },
    { id: uuid(), name: 'Salaries & Contractors', type: 'expense' as const, color: '#f97316' },
    { id: uuid(), name: 'Travel', type: 'expense' as const, color: '#3b82f6' },
    { id: uuid(), name: 'Taxes', type: 'expense' as const, color: '#f59e0b' },
    { id: uuid(), name: 'Equipment', type: 'expense' as const, color: '#14b8a6' },
    { id: uuid(), name: 'Other Expenses', type: 'expense' as const, color: '#64748b' },

    { id: uuid(), name: 'Bank Transfer', type: 'ignore' as const, color: '#94a3b8' },
  ]
}

export function defaultNetWorthCategories(): NetWorthCategoryDef[] {
  return DEFAULT_NET_WORTH_CATEGORIES.map((c) => ({ id: uuid(), ...c }))
}

function defaultWorkspace(business: boolean, name: string): WorkspaceData {
  return {
    name,
    kind: business ? 'business' : 'personal',
    currency: 'EUR',
    cards: business
      ? [
          { id: uuid(), name: 'Business Account', color: '#4f46e5' },
          { id: uuid(), name: 'Business Card', color: '#0ea5e9' },
        ]
      : [
          { id: uuid(), name: 'Main Card', color: '#4f46e5' },
          { id: uuid(), name: 'Everyday Card', color: '#0ea5e9' },
          { id: uuid(), name: 'Savings Account', color: '#16a34a' },
        ],
    categories: business ? defaultBusinessCategories() : defaultCategories(),
    months: {},
    netWorthAccounts: [],
    netWorthCategories: defaultNetWorthCategories(),
    invoices: business ? [] : undefined,
  }
}

/** Creates a new business workspace and adds it to the app data, returning the new workspace id. */
export function addBusinessWorkspace(data: AppData, name: string): { data: AppData; id: string } {
  const id = uuid()
  const ws = defaultWorkspace(true, name || 'New Business')
  return {
    data: {
      ...data,
      workspaces: { ...data.workspaces, [id]: ws },
      workspaceOrder: [...workspaceOrder(data), id],
    },
    id,
  }
}

/** Removes a business workspace. The personal workspace cannot be removed. */
export function removeWorkspace(data: AppData, id: string): AppData {
  if (data.workspaces[id]?.kind !== 'business') return data
  const workspaces = { ...data.workspaces }
  delete workspaces[id]
  const order = workspaceOrder(data).filter((w) => w !== id)
  const activeWorkspace = data.activeWorkspace === id ? 'personal' : data.activeWorkspace
  return { ...data, workspaces, workspaceOrder: order, activeWorkspace }
}

/** Returns the display order of all workspace ids, falling back to object key order. */
export function workspaceOrder(data: AppData): string[] {
  const ids = Object.keys(data.workspaces)
  if (data.workspaceOrder) {
    const known = data.workspaceOrder.filter((id) => ids.includes(id))
    const missing = ids.filter((id) => !known.includes(id))
    return [...known, ...missing]
  }
  return ids
}

/**
 * Ensures a workspace has `netWorthCategories` and that every net worth account's
 * `category` field references a valid category id. Older data stored the category
 * as a plain name (e.g. "Cash & Bank"); this remaps those to ids, creating any
 * missing default categories along the way.
 */
function migrateNetWorthCategories(ws: WorkspaceData): WorkspaceData {
  let categories = ws.netWorthCategories
  if (!categories || categories.length === 0) {
    categories = defaultNetWorthCategories()
  }

  // Add any newer default categories (e.g. Crypto, Stock Investments, Hard Assets,
  // Business Valuations) that don't yet exist in older workspaces, so they show up
  // as selectable options without disturbing already-categorized accounts.
  const existingNames = new Set(categories.map((c) => c.name.toLowerCase()))
  for (const def of DEFAULT_NET_WORTH_CATEGORIES) {
    if (!existingNames.has(def.name.toLowerCase())) {
      categories = [...categories, { id: uuid(), ...def }]
      existingNames.add(def.name.toLowerCase())
    }
  }

  const byName = new Map(categories.map((c) => [c.name.toLowerCase(), c]))
  const byId = new Set(categories.map((c) => c.id))

  const netWorthAccounts = (ws.netWorthAccounts ?? []).map((acc) => {
    if (byId.has(acc.category)) return acc
    // category is an old plain name (or unknown) - remap to an id
    let match = byName.get(String(acc.category).toLowerCase())
    if (!match) {
      const fallbackName = acc.type === 'asset' ? 'Other Asset' : 'Other Liability'
      match = byName.get(fallbackName.toLowerCase())
      if (!match) {
        const def = DEFAULT_NET_WORTH_CATEGORIES.find((c) => c.name === fallbackName)!
        match = { id: uuid(), ...def }
        categories = [...categories, match]
        byName.set(match.name.toLowerCase(), match)
      }
    }
    return { ...acc, category: match.id }
  })

  return { ...ws, netWorthCategories: categories, netWorthAccounts }
}

export function defaultData(): AppData {
  return {
    version: 2,
    userName: 'there',
    activeWorkspace: 'personal',
    workspaces: {
      personal: defaultWorkspace(false, 'Personal'),
      business: defaultWorkspace(true, 'Business'),
    },
    workspaceOrder: ['personal', 'business'],
  }
}

export function emptyMonth(id: string): MonthData {
  return { id, transactions: [] }
}

function migrateFromV1(old: any): AppData {
  const ws: WorkspaceData = {
    name: 'Personal',
    kind: 'personal',
    currency: old.currency ?? 'EUR',
    cards: old.cards ?? [],
    categories: old.categories ?? [],
    months: {},
    netWorthAccounts: [],
    netWorthCategories: defaultNetWorthCategories(),
  }

  const accountByName = new Map<string, string>() // name -> account id

  const monthIds = Object.keys(old.months ?? {}).sort()
  for (const id of monthIds) {
    const oldMonth = old.months[id]
    ws.months[id] = { id, transactions: oldMonth.transactions ?? [] }
    for (const entry of oldMonth.netWorth ?? []) {
      const key = `${entry.type}:${entry.name}`
      let accId = accountByName.get(key)
      if (!accId) {
        accId = uuid()
        accountByName.set(key, accId)
        ws.netWorthAccounts.push({
          id: accId,
          name: entry.name || 'Account',
          type: entry.type,
          category: entry.type === 'asset' ? 'Cash & Bank' : 'Credit Card',
          values: {},
        })
      }
      const acc = ws.netWorthAccounts.find((a) => a.id === accId)!
      acc.values[id] = entry.balance
    }
  }

  return {
    version: 2,
    userName: 'there',
    activeWorkspace: 'personal',
    workspaces: {
      personal: ws,
      business: defaultWorkspace(true, 'Business'),
    },
    workspaceOrder: ['personal', 'business'],
  }
}

function migrateAppData(data: AppData): AppData {
  const workspaces: Record<string, WorkspaceData> = {}
  for (const [id, ws] of Object.entries(data.workspaces)) {
    let migrated = migrateNetWorthCategories(ws)
    if (!migrated.kind) {
      migrated = { ...migrated, kind: id === 'personal' ? 'personal' : 'business' }
    }
    if (!migrated.name) {
      migrated = { ...migrated, name: id === 'personal' ? 'Personal' : id === 'business' ? 'Business' : id }
    }
    if (migrated.kind === 'business' && !migrated.invoices) {
      migrated = { ...migrated, invoices: [] }
    }
    if (!migrated.categories.some((c) => c.type === 'ignore')) {
      migrated = {
        ...migrated,
        categories: [...migrated.categories, { id: uuid(), name: 'Bank Transfer', type: 'ignore', color: '#94a3b8' }],
      }
    }
    // "Pocket" moves are internal transfers between your own balances — never real
    // income/expense — so force them to the ignore type across all months.
    let touchedPocket = false
    const months = Object.fromEntries(
      Object.entries(migrated.months).map(([mid, m]) => [
        mid,
        {
          ...m,
          transactions: m.transactions.map((t) => {
            if (t.type !== 'ignore' && /pocket/i.test(t.description)) {
              touchedPocket = true
              return { ...t, type: 'ignore' as const, categoryId: '' }
            }
            return t
          }),
        },
      ]),
    )
    if (touchedPocket) migrated = { ...migrated, months }
    workspaces[id] = migrated
  }
  return {
    ...data,
    workspaces,
    workspaceOrder: workspaceOrder({ ...data, workspaces }),
  }
}

function loadFromLocalStorage(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppData
      if (parsed.workspaces && parsed.workspaces.personal) return migrateAppData(parsed)
    }
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY)
    if (oldRaw) {
      const old = JSON.parse(oldRaw)
      if (old.cards && old.categories && old.months) {
        return migrateAppData(migrateFromV1(old))
      }
    }
    return defaultData()
  } catch {
    return defaultData()
  }
}

/** Loads app data from the local SQLite-backed API, falling back to localStorage/defaults if the server is unreachable. */
export async function loadData(): Promise<AppData> {
  try {
    // Time-box the request so a hung/wrong server (e.g. a dead dev proxy) can never
    // freeze the app on "Loading…" — fall back to the local cache instead.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('/api/data', { signal: controller.signal })
    clearTimeout(timer)
    if (res.ok) {
      const parsed = await res.json()
      if (parsed && parsed.workspaces && parsed.workspaces.personal) {
        return migrateAppData(parsed as AppData)
      }
    }
  } catch {
    // server unreachable / timed out, fall back below
  }
  return loadFromLocalStorage()
}

/** Saves app data to the SQLite-backed API, with a localStorage mirror as an offline cache.
 *  Returns false when the durable (server) save failed, so the UI can warn instead of pretending. */
export async function saveData(data: AppData): Promise<boolean> {
  const json = JSON.stringify(data)
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    // localStorage quota exceeded (large uploaded files) — the server below is the durable store.
  }
  try {
    const res = await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: json,
    })
    return res.ok
  } catch {
    // offline: localStorage mirror above will be used until server is back
    return false
  }
}

/** Best-effort save fired as the tab is closing. Uses navigator.sendBeacon so the
 *  request survives the page unload (a normal async fetch is often cancelled). */
export function flushDataBeacon(data: AppData): void {
  const json = JSON.stringify(data)
  try {
    localStorage.setItem(STORAGE_KEY, json)
  } catch {
    /* quota exceeded — server beacon below is the durable path */
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/data', new Blob([json], { type: 'application/json' }))
    }
  } catch {
    /* ignore */
  }
}

export function monthLabel(id: string): string {
  const [year, month] = id.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function currentMonthId(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(id: string, delta: number): string {
  const [year, month] = id.split('-').map(Number)
  const date = new Date(year, month - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function sortedMonthIds(months: Record<string, MonthData>): string[] {
  return Object.keys(months).sort()
}

export function activeWorkspace(data: AppData): WorkspaceData {
  return data.workspaces[data.activeWorkspace]
}

export function updateActiveWorkspace(
  data: AppData,
  updater: (ws: WorkspaceData) => WorkspaceData,
): AppData {
  return {
    ...data,
    workspaces: {
      ...data.workspaces,
      [data.activeWorkspace]: updater(data.workspaces[data.activeWorkspace]),
    },
  }
}

export function renameWorkspace(data: AppData, id: string, name: string): AppData {
  if (!data.workspaces[id]) return data
  return {
    ...data,
    workspaces: {
      ...data.workspaces,
      [id]: { ...data.workspaces[id], name },
    },
  }
}

export function reorderWorkspaces(data: AppData, newOrder: string[]): AppData {
  return { ...data, workspaceOrder: newOrder }
}

export function setWorkspaceHidden(data: AppData, id: string, hidden: boolean): AppData {
  const current = new Set(data.hiddenWorkspaces ?? [])
  if (hidden) current.add(id)
  else current.delete(id)
  // Never leave the active workspace hidden — switch to the first visible one.
  let activeWorkspace = data.activeWorkspace
  if (hidden && activeWorkspace === id) {
    activeWorkspace = workspaceOrder(data).find((w) => !current.has(w)) ?? 'personal'
  }
  return { ...data, hiddenWorkspaces: Array.from(current), activeWorkspace }
}

export function setWorkspaceIcon(data: AppData, id: string, icon: string): AppData {
  if (!data.workspaces[id]) return data
  return {
    ...data,
    workspaces: { ...data.workspaces, [id]: { ...data.workspaces[id], icon } },
  }
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

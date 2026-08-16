export type EntryType = 'income' | 'expense' | 'ignore'
export type AssetType = 'asset' | 'liability'
export type WorkspaceKind = 'personal' | 'business'
export type Workspace = string

export interface BankCard {
  id: string
  name: string
  color: string
}

export interface Category {
  id: string
  name: string
  type: EntryType
  color: string
}

export interface Transaction {
  id: string
  date: string // YYYY-MM-DD
  description: string
  amount: number // always positive
  type: EntryType
  categoryId: string
  cardId: string
  recurring?: boolean
  ignoreSubscription?: boolean
  /** Flagged by the user to review later (e.g. a suspicious or to-cancel expense). */
  flagged?: boolean
}

export interface MonthData {
  id: string // YYYY-MM
  transactions: Transaction[]
}

// Default net worth category names + colors used to seed new workspaces and for migrating old data.
export const DEFAULT_NET_WORTH_CATEGORIES: { name: string; type: AssetType; color: string; liquid: boolean }[] = [
  { name: 'Cash & Bank', type: 'asset', color: '#22c55e', liquid: true },
  { name: 'Stock Investments', type: 'asset', color: '#6366f1', liquid: true },
  { name: 'Crypto Investments', type: 'asset', color: '#f97316', liquid: true },
  { name: 'Business Valuations', type: 'asset', color: '#14b8a6', liquid: false },
  { name: 'Real Estate', type: 'asset', color: '#f59e0b', liquid: false },
  { name: 'Vehicle', type: 'asset', color: '#3b82f6', liquid: false },
  { name: 'Hard Assets', type: 'asset', color: '#a855f7', liquid: false },
  { name: 'Other Asset', type: 'asset', color: '#94a3b8', liquid: false },
  { name: 'Credit Card', type: 'liability', color: '#f0506e', liquid: false },
  { name: 'Loan', type: 'liability', color: '#ef4444', liquid: false },
  { name: 'Other Liability', type: 'liability', color: '#94a3b8', liquid: false },
]

export interface NetWorthCategoryDef {
  id: string
  name: string
  type: AssetType
  color: string
  /** Whether this category counts toward "liquid" net worth (e.g. cash, easily-sellable investments). */
  liquid: boolean
}

export interface NetWorthAccount {
  id: string
  name: string
  type: AssetType
  category: string // references NetWorthCategoryDef.id
  /** Optional free-text description (e.g. account number, what it covers, where it's held). */
  notes?: string
  values: Record<string, number> // monthId (YYYY-MM) -> balance
}

/** A subscription added manually rather than detected from transactions. */
export interface ManualSubscription {
  id: string
  description: string
  categoryId: string
  cardId: string
  monthlyCost: number
}

export type FixedCostType = 'fixed' | 'variable'

/** A recurring monthly cost line item, grouped by a free-text category for budgeting. */
export interface FixedCostItem {
  id: string
  type: FixedCostType
  category: string
  name: string
  monthlyCost: number
}

export type InvoiceType = 'income' | 'expense'
export type InvoiceStatus = 'paid' | 'unpaid' | 'overdue'

/** A business invoice representing money owed to or by the business. */
export interface Invoice {
  id: string
  type: InvoiceType
  /** Invoice number for accounting, e.g. 'INV-2026-014'. */
  number?: string
  party: string // client (income) or vendor (expense)
  description: string
  amount: number
  date: string // YYYY-MM-DD, issue date
  dueDate?: string // YYYY-MM-DD
  status: InvoiceStatus
  categoryId?: string
  fileName?: string
  fileData?: string // data URL of the uploaded invoice file
}

export type AdCampaignStatus = 'active' | 'paused' | 'ended'

/** A named ad account (e.g. NOOMS, PulseAI) with a color for visual separation. */
export interface AdAccount {
  id: string
  name: string
  color: string
}

/** An ad campaign tracked for spend/performance (e.g. a Meta or Google Ads campaign). */
export interface AdCampaign {
  id: string
  name: string
  platform: string // e.g. 'Meta', 'Google', 'TikTok', 'LinkedIn', 'Other'
  status: AdCampaignStatus
  accountId?: string // references AdAccount.id
  notes?: string
}

/** A single day/period of spend + results logged for a campaign. */
export interface AdSpendEntry {
  id: string
  campaignId: string
  date: string // YYYY-MM-DD
  spend: number
  revenue: number
  conversions: number
  clicks?: number
}

/** A freelance client and when they're expected to pay. */
export interface FreelanceClient {
  id: string
  client: string
  description?: string
  amount: number
  paymentDate?: string // YYYY-MM-DD expected payment date
  paid: boolean
}

/** Money someone else owes you, tracked per month. */
export interface Receivable {
  id: string
  person: string
  description?: string
  amount: number
  monthId: string // YYYY-MM, month this was recorded
  expectedDate?: string // YYYY-MM-DD
  paid: boolean
  paidDate?: string // YYYY-MM-DD
}

/** A product/service tracked for margin and volume calculations. */
/** A named cost line item on a product (e.g. Medication, Doctor fee, Ad spend). */
export interface ProductCostItem {
  id: string
  label: string
  amount: number
}

export interface Product {
  id: string
  name: string
  category: string // free-text group, e.g. 'Weight Loss', 'Hair Loss', 'Men's Health'
  sellingPrice: number
  vatIncluded: boolean
  /** Named cost breakdown replacing the old flat cogs/otherCosts fields. */
  costItems?: ProductCostItem[]
  /** Extra charges billed to the customer on top of the selling price (e.g. shipping, handling). */
  chargeItems?: ProductCostItem[]
  /** @deprecated use costItems */
  cogs?: number
  /** @deprecated use costItems */
  otherCosts?: number
  /** Marks this product as important/priority, e.g. to highlight it visually in Business Tools. */
  highlighted?: boolean
  /** Optional custom color tag for quick visual grouping, e.g. '#6366f1'. */
  colorTag?: string
}

/** A saved scenario from the Volume & Break-even calculator. */
export interface VolumeExample {
  id: string
  label: string
  productId: string
  productName: string
  dailyUnits: number
  fixedCosts: number
  adSpend: number
  targetProfit: number
  cogsOverride?: number
  createdAt: string // ISO timestamp
}

/** Ad spend + revenue tracked per product category per month. */
export interface AdCategoryBudget {
  id: string
  productCategory: string // e.g. 'Weight Loss', 'Peptides', 'Hair Loss'
  monthId: string // YYYY-MM
  spend: number
  revenue: number
  leads?: number
}

/** An influencer/affiliate partner earning commission on product sales. */
export interface Influencer {
  id: string
  name: string
  platform: string // e.g. 'Instagram', 'TikTok', 'YouTube', 'Affiliate site', 'Other'
  handle?: string
  /** Commission as a percentage of net (ex-VAT) revenue, e.g. 15 = 15%. */
  commissionPct: number
  /** Optional fixed fee per sale on top of (or instead of) the percentage. */
  fixedPerSale?: number
  /** Product ids this partner promotes. Empty/undefined = all products. */
  productIds?: string[]
  notes?: string
}

/** Inputs driving the 24-month financial model / BV financial plan. */
export interface FinancialModelAssumptions {
  startMonth: string // YYYY-MM (month 1 of the model)
  startingCash: number
  investment: number // capital injected in month 1
  pricePerUnit: number // ex-VAT selling price
  cogsPerUnit: number // product cost per unit
  fulfilmentPerUnit: number // shipping/fulfilment per unit
  unitsMonth1: number // units sold in month 1
  monthlyGrowthPct: number // month-over-month unit growth, %
  fixedOpexMonthly: number // rent, salaries, tools…
  marketingMonthly: number // ad/marketing spend per month
  otherOpexMonthly: number // anything else recurring
  taxRatePct: number // corporate tax on profit, %
  /** Downside scenario adjustments. */
  downsideGrowthHaircutPct: number // subtract this many points from growth
  downsidePriceHaircutPct: number // reduce price by this %
  downsideUnitsHaircutPct: number // reduce month-1 units by this %
}

/** One sheet of an imported financial plan (rows of cells, as from a spreadsheet). */
export interface ImportedPlanSheet {
  name: string
  rows: (string | number)[][]
}

/** A full financial plan imported from a spreadsheet — displayed as-is, exact numbers preserved. */
export interface ImportedFinancialPlan {
  name: string
  importedAt: string // ISO timestamp
  sheets: ImportedPlanSheet[]
}

/** A saved, named snapshot of financial-model assumptions for comparison. */
export interface FinancialScenario {
  id: string
  name: string
  assumptions: FinancialModelAssumptions
  createdAt: string // ISO timestamp
}

/** A shareholder / cap-table entry — who owns what and what they paid for it. */
export interface Shareholder {
  id: string
  name: string
  percent: number // % ownership
  amountInvested: number // how much they paid for their stake (0 for founders)
  notes?: string
}

/** A stock/supply purchase — used to plan future supply costs and model inventory. */
export interface InventoryPurchase {
  id: string
  item: string
  supplier?: string
  quantity: number
  unitCost: number // cost per unit
  orderDate?: string // YYYY-MM-DD
  arrivalDate?: string // YYYY-MM-DD expected/actual arrival
  received: boolean // stock has arrived
  paid: boolean // supplier has been paid
  notes?: string
}

/** A planned allocation of raised/investor funds — one line of the "use of funds". */
export interface FundAllocation {
  id: string
  category: string // e.g. 'Marketing', 'Hiring', 'Inventory', 'Product', 'Runway'
  planned: number // amount earmarked for this bucket
  spent?: number // how much has actually been spent from it so far
  notes?: string
}

/** A retail / wholesale partner that stocks the business's products (e.g. Delhaize, a gym). */
export interface RetailPartner {
  id: string
  name: string
  /** Purchase terms / "Inkoop" — free text, e.g. "30-50 SKU", "min. order €500". */
  purchaseTerms?: string
  /** The retailer's margin as a percentage, e.g. 30 = they mark up 30%. */
  marginPct?: number
  /** Products this retailer stocks (product ids). Empty = all / unspecified. */
  productIds?: string[]
  status?: 'active' | 'prospect' | 'paused'
  notes?: string
}

/** A business contract with optional file attachment. */
export type ContractStatus = 'active' | 'pending' | 'expired' | 'terminated'
export interface Contract {
  id: string
  title: string
  party: string
  type: string // 'Employment', 'Supplier', 'Client', 'NDA', 'Service', 'Lease', 'Other'
  signedDate: string // YYYY-MM-DD
  expiryDate?: string // YYYY-MM-DD
  status: ContractStatus
  notes?: string
  fileName?: string
  fileData?: string // base64 data URL
  /** Whether the contract is signed. Set directly when uploading; inferred from in-app signature for written contracts. */
  signed?: boolean
  /** Contract text written and signed directly in the app, as an alternative to uploading a file. */
  bodyText?: string
  signatureDataUrl?: string // PNG data URL of a drawn signature
  signedByName?: string // typed name accompanying the signature
  signedAt?: string // ISO timestamp of when it was signed in-app
}

/** A one-time investment or startup cost tracked for business workspaces. */
export interface StartupCost {
  id: string
  date: string // YYYY-MM-DD
  description: string
  category: string // free-text: 'Legal', 'Equipment', 'Software', 'Marketing', 'Office', 'Hiring', etc.
  amount: number
  notes?: string
  /** If true, this is a planned/future cost — not yet spent, not reconciled to transactions. */
  planned?: boolean
  /** Marks this cost as important/priority so it's easy to spot in the list. */
  highlighted?: boolean
}

export interface WorkspaceData {
  name: string
  kind: WorkspaceKind
  currency: string
  /** Custom emoji icon shown in the sidebar workspace switcher. */
  icon?: string
  /** VAT rate as a decimal, e.g. 0.05 for 5% VAT. Defaults to 0.05 if unset. */
  vatRate?: number
  /** Named VAT country configs the user added. Active rate is taken from vatRate. */
  vatCountries?: { name: string; rate: number }[]
  cards: BankCard[]
  categories: Category[]
  months: Record<string, MonthData>
  netWorthAccounts: NetWorthAccount[]
  netWorthCategories: NetWorthCategoryDef[]
  /** Manual monthly cost overrides for detected subscriptions, keyed by SubscriptionInfo.key. */
  subscriptionOverrides?: Record<string, number>
  /** Subscriptions added manually (not auto-detected from transactions). */
  manualSubscriptions?: ManualSubscription[]
  /** Subscription keys the user flagged to review later (detected key, or `manual-{id}`). */
  flaggedSubscriptions?: string[]
  /** Recurring fixed/variable monthly costs used for budgeting. */
  fixedCosts?: FixedCostItem[]
  /** Recurring monthly income (salary, retainers, rental income…) netted against fixed costs. */
  fixedIncome?: FixedCostItem[]
  /** Partner's recurring expenses, managed separately — not counted in the workspace's own burn. */
  partnerExpenses?: FixedCostItem[]
  /** Invoices for business workspaces (income owed by clients, expenses owed to vendors). */
  invoices?: Invoice[]
  /** Learned description -> category mappings, keyed by `${type}|${normalizedDescription}`. */
  categoryRules?: Record<string, string>
  /** Learned description -> entry-type mappings, keyed by normalized description (e.g. a bank-to-bank "Pocket Withdrawal" → 'ignore'). */
  typeRules?: Record<string, EntryType>
  /** Tags (e.g. `adspend:{id}`, `startup:{id}`) for auto-generated transactions the user deleted manually — reconcile functions skip these forever. */
  dismissedReconcileTags?: string[]
  /** Saved scenarios from the Volume & Break-even calculator, for revisiting ideas later. */
  volumeExamples?: VolumeExample[]
  /** Money owed to you by other people. */
  receivables?: Receivable[]
  /** Freelance clients and their expected payment dates. */
  freelanceClients?: FreelanceClient[]
  /** Named ad accounts (e.g. NOOMS, PulseAI) with colors for visual separation. */
  adAccounts?: AdAccount[]
  /** Ad campaigns tracked for spend/performance. */
  adCampaigns?: AdCampaign[]
  /** Logged ad spend + results, one entry per month per campaign. */
  adSpendEntries?: AdSpendEntry[]
  /** Meta Ads API credentials — supports multiple ad accounts. */
  metaAdConfig?: { accessToken: string; adAccountIds: string[] }
  /** Stripe API key for income sync. */
  stripeConfig?: { apiKey: string }
  /** Products/services tracked for margin and volume calculations. */
  products?: Product[]
  /** One-time startup / investment costs for business workspaces. */
  startupCosts?: StartupCost[]
  /** Ad spend + revenue tracked per product category per month. */
  adCategoryBudgets?: AdCategoryBudget[]
  /** Business contracts with optional file attachments. */
  contracts?: Contract[]
  /** Influencer/affiliate partners earning commission on product sales. */
  influencers?: Influencer[]
  /** Retail / wholesale partners that stock the business's products. */
  retailPartners?: RetailPartner[]
  /** Total investor / raised capital for this business. */
  investorFunds?: number
  /** Planned "use of funds" — how the raised capital is allocated and spent. */
  fundAllocations?: FundAllocation[]
  /** Inputs for the 24-month financial model / BV financial plan. */
  financialModel?: FinancialModelAssumptions
  /** A full financial plan imported from a spreadsheet, shown with its exact numbers. */
  importedPlan?: ImportedFinancialPlan
  /** Cap table — shareholders and what they own/paid. */
  shareholders?: Shareholder[]
  /** Stock/supply purchases used to plan future supply costs and model inventory. */
  inventoryPurchases?: InventoryPurchase[]
  /** Saved, named scenarios of the financial model for side-by-side comparison. */
  financialScenarios?: FinancialScenario[]
  /** User-defined display order for products (array of product ids). */
  productOrder?: string[]
  categoryOrder?: string[]
  /** Product category names (free-text, e.g. 'Peptides') hidden from Business Tools for focus. */
  hiddenProductCategories?: string[]
  /** Insight ids the user has dismissed, keyed by `${monthId}:${insightId}`. */
  dismissedInsights?: string[]
  /** Category ids dismissed from the Budget page's Spending Estimates panel. */
  dismissedEstimates?: string[]
}

export interface AppData {
  version: number
  userName: string
  activeWorkspace: Workspace
  workspaces: Record<Workspace, WorkspaceData>
  /** Display order of workspace ids (sidebar order). */
  workspaceOrder?: Workspace[]
  /** Workspace ids hidden from the sidebar for focus (not deleted). */
  hiddenWorkspaces?: Workspace[]
}

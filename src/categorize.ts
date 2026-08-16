import type { Category, EntryType, NetWorthAccount, NetWorthCategoryDef } from './types'

// Maps lowercase keywords found in a transaction description to a category name.
// The category name must match (case-insensitively) a category in the workspace;
// if no match is found, falls back to "Other" / "Other Income".
// Order matters: more specific rules should come before broader ones.
const EXPENSE_KEYWORDS: [string[], string][] = [
  // Transport (checked before Rent so "rent a car" doesn't match Rent/Mortgage)
  [
    [
      'rent a car', 'rent-a-car', 'car rental', 'car rentals', 'uber', 'bolt', 'lyft', 'taxi', 'train', 'sncb',
      'nmbs', 'metro', 'fuel', 'petrol', 'shell', 'esso', 'eppco', 'enoc', 'adnoc', 'parking', 'transport',
      'scooter', 'rta', 'salik', 'careem',
    ],
    'Transport',
  ],
  [
    [
      'tesco', 'lidl', 'aldi', 'carrefour', 'albert heijn', 'colruyt', 'delhaize', 'spar', 'supermarket',
      'grocery', 'groceries', 'choithram', 'minimart', 'mini mart', 'union coop', 'lulu',
    ],
    'Groceries',
  ],
  [['rent', 'mortgage', 'landlord'], 'Rent / Mortgage'],
  [
    [
      'electric', 'electricity', 'water', 'gas bill', 'utility', 'utilities', 'internet', 'broadband', 'telecom',
      'mobile bill', 'mobile vikings', 'etisalat', 'du ', 'dewa', 'sewa',
    ],
    'Utilities',
  ],
  [
    [
      'restaurant', 'cafe', 'coffee', 'mcdonald', 'burger', 'kfc', 'pizza', 'deliveroo', 'uber eats', 'takeaway',
      'bar ', 'pub', 'foodies', 'food bay', 'talabat', 'zomato',
    ],
    'Dining Out',
  ],
  [
    ['amazon', 'zalando', 'shop', 'store', 'h&m', 'zara', 'ikea', 'media markt', 'souq', 'mall'],
    'Shopping',
  ],
  [['pharmacy', 'doctor', 'hospital', 'dentist', 'health', 'medical', 'clinic'], 'Health'],
  [
    ['cinema', 'netflix', 'spotify', 'disney', 'steam', 'playstation', 'xbox', 'concert', 'game', 'tiktok'],
    'Entertainment',
  ],
  [
    ['subscription', 'icloud', 'google one', 'youtube premium', 'apple.com/bill', 'patreon'],
    'Subscriptions',
  ],
  [
    ['transfer to savings', 'investment', 'broker', 'etoro', 'degiro', 'trading', 'crypto', 'kucoin'],
    'Savings & Investments',
  ],
  // AI tools / SaaS / software (used by both personal and business workspaces)
  [
    [
      'aws', 'azure', 'digitalocean', 'github', 'figma', 'notion', 'slack', 'zoom', 'software', 'saas',
      'openai', 'anthropic', 'claude.ai', 'lovable', 'arcads', 'linkedin', 'meta pay', 'meta platforms',
      'chatgpt', 'midjourney', 'vercel', 'netlify',
    ],
    'Software & Tools',
  ],
  [['ads', 'advertising', 'facebook ads', 'google ads', 'marketing'], 'Marketing'],
  [['office', 'wework', 'coworking'], 'Office & Rent'],
  [['payroll', 'salary payment', 'contractor', 'freelancer payment'], 'Salaries & Contractors'],
  [['flight', 'hotel', 'airbnb', 'booking.com'], 'Travel'],
  [['vat', 'tax office', 'irs', 'revenue service'], 'Taxes'],
]

const INCOME_KEYWORDS: [string[], string][] = [
  [['salary', 'payroll', 'wages'], 'Salary'],
  [['freelance', 'invoice payment', 'contract payment'], 'Freelance'],
  [['sale', 'revenue', 'customer payment', 'stripe', 'paypal'], 'Sales Revenue'],
  [['service fee', 'consulting'], 'Services'],
]

// Descriptions that are almost always self-transfers between the user's own accounts,
// not real income or expenses, so they default to the "ignore" entry type.
const TRANSFER_KEYWORDS = ['payment from stef keppens', 'payment from keppens stef', 'from stef keppens', 'from keppens stef', 'pocket']

/** Returns true if a transaction description looks like a transfer between the user's own accounts. */
export function looksLikeSelfTransfer(description: string): boolean {
  const desc = description.toLowerCase()
  return TRANSFER_KEYWORDS.some((kw) => desc.includes(kw))
}

// Merchant/description keywords that strongly indicate a recurring subscription or
// membership, regardless of how many times they've appeared so far.
export const SUBSCRIPTION_KEYWORDS = [
  'netflix', 'spotify', 'disney', 'icloud', 'google one', 'youtube premium', 'apple.com/bill', 'patreon',
  'amazon prime', 'xbox', 'playstation plus', 'adobe', 'microsoft 365', 'office 365', 'dropbox', 'notion',
  'linkedin', 'mobile vikings', 'etisalat', 'du ', 'gym', 'fitness', 'subscription', 'meta pay', 'tiktok',
  'openai', 'chatgpt', 'anthropic', 'claude.ai', 'vercel', 'github',
]

/**
 * Normalizes a transaction description for matching/grouping purposes: lowercases,
 * strips digits (reference numbers, dates, etc.) and punctuation, and collapses
 * whitespace. This lets "Payment from Stef Keppens 4471" and "Payment from Stef
 * Keppens 9823" be recognized as the same recurring description.
 */
export function normalizeDescription(desc: string): string {
  return desc
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Normalizes a description + type into a stable key for the learned category-rules map. */
export function categoryRuleKey(description: string, type: EntryType): string {
  return `${type}|${normalizeDescription(description)}`
}

export function guessCategoryId(
  description: string,
  type: EntryType,
  categories: Category[],
  categoryRules?: Record<string, string>,
): string | undefined {
  if (type === 'ignore') return undefined

  const learned = categoryRules?.[categoryRuleKey(description, type)]
  if (learned && categories.some((c) => c.id === learned)) return learned

  const desc = description.toLowerCase()
  const rules = type === 'income' ? INCOME_KEYWORDS : EXPENSE_KEYWORDS
  for (const [keywords, categoryName] of rules) {
    if (keywords.some((kw) => desc.includes(kw))) {
      const match = categories.find((c) => c.type === type && c.name.toLowerCase() === categoryName.toLowerCase())
      if (match) return match.id
    }
  }
  const fallback = categories.find((c) => c.type === type && c.name.toLowerCase().startsWith('other'))
  return fallback?.id ?? categories.find((c) => c.type === type)?.id
}

// Maps lowercase keywords found in a category name to a representative emoji icon.
// Order matters: more specific names should come before broader ones.
const CATEGORY_ICONS: [string[], string][] = [
  [['groceries', 'grocery', 'supermarket'], '🛒'],
  [['rent', 'mortgage', 'house', 'home', 'office & rent'], '🏠'],
  [['utilities', 'utility', 'electric', 'water', 'internet'], '💡'],
  [['transport', 'car', 'vehicle', 'fuel', 'parking', 'travel', 'flight', 'hotel'], '🚗'],
  [['dining', 'restaurant', 'food', 'coffee'], '🍔'],
  [['shopping'], '🛍️'],
  [['health', 'medical', 'doctor', 'dentist', 'pharmacy'], '🏥'],
  [['entertainment', 'game', 'cinema'], '🎬'],
  [['subscription'], '🔁'],
  [['software', 'tools', 'saas'], '💻'],
  [['savings', 'investment'], '💰'],
  [['salary', 'salaries', 'payroll', 'wages', 'contractor'], '💼'],
  [['freelance', 'services', 'consulting'], '🧑‍💻'],
  [['sales revenue', 'revenue'], '💵'],
  [['marketing', 'advertising', 'ads'], '📣'],
  [['tax'], '🧾'],
  [['equipment'], '🛠️'],
  [['cost of goods', 'cogs'], '📦'],
  [['bank transfer', 'transfer'], '🔄'],
  [['income'], '💵'],
]

/** Returns a representative emoji icon for a category name, based on keyword matching, or undefined if none match. */
export function categoryIcon(name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [keywords, icon] of CATEGORY_ICONS) {
    if (keywords.some((kw) => lower.includes(kw))) return icon
  }
  return undefined
}

/** Suggests an entry type for a transaction: a learned rule (from a past manual choice)
 *  wins, then self-transfer detection, otherwise the parsed fallback. */
export function guessEntryType(
  description: string,
  fallback: EntryType,
  typeRules?: Record<string, EntryType>,
): EntryType {
  const learned = typeRules?.[normalizeDescription(description)]
  if (learned) return learned
  if (looksLikeSelfTransfer(description)) return 'ignore'
  return fallback
}

// Maps lowercase keywords found in a net worth account's name to a default category name.
const NET_WORTH_KEYWORDS: [string[], string][] = [
  [['kucoin', 'binance', 'ledger', 'metamask', 'crypto', 'wallet', 'degiro', 'etoro', 'broker', 'invest', 'trading', 'stocks', 'shares'], 'Investments'],
  [['house', 'apartment', 'property', 'real estate', 'home'], 'Real Estate'],
  [['car', 'vehicle', 'bike', 'motorcycle', 'scooter'], 'Vehicle'],
  [['watch', 'rolex', 'jewel', 'collectible', 'art'], 'Other Asset'],
  [['credit card'], 'Credit Card'],
  [['loan', 'mortgage'], 'Loan'],
  [['bank', 'cash', 'account', 'revolut', 'kbc', 'argenta', 'hellenic'], 'Cash & Bank'],
]

/** Suggests a net worth category id for an account based on its name and asset/liability type. */
export function guessNetWorthCategory(
  account: Pick<NetWorthAccount, 'name' | 'type'>,
  categories: NetWorthCategoryDef[],
): string | undefined {
  const name = account.name.toLowerCase()
  const sameType = categories.filter((c) => c.type === account.type)
  for (const [keywords, categoryName] of NET_WORTH_KEYWORDS) {
    if (keywords.some((kw) => name.includes(kw))) {
      const match = sameType.find((c) => c.name.toLowerCase() === categoryName.toLowerCase())
      if (match) return match.id
    }
  }
  const fallbackName = account.type === 'asset' ? 'Other Asset' : 'Other Liability'
  const fallback = sameType.find((c) => c.name.toLowerCase() === fallbackName.toLowerCase())
  return fallback?.id ?? sameType[0]?.id
}

export interface ParsedTransaction {
  date: string // YYYY-MM-DD
  description: string
  amount: number // positive
  type: 'income' | 'expense'
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Try to parse a token that represents a whole date by itself, e.g. "Jun 1, 2026". */
function parseDateToken(token: string): string | null {
  const t = token.trim()

  // "Jun 1, 2026" / "January 10, 2026"
  let m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${pad(month)}-${pad(Number(m[2]))}`
  }

  // "1 Jun 2026" / "01 June 2026"
  m = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/)
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()]
    if (month) return `${m[3]}-${pad(month)}-${pad(Number(m[1]))}`
  }

  // "01/06/2026" or "01-06-2026" (DD/MM/YYYY)
  m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`

  // "2026-06-01"
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  return null
}

const AMOUNT_TOKEN_RE = /^[+-]?\(?[€$£]?\s?\d{1,3}(?:[,.\s]\d{3})*[.,]\d{2}\)?$/

function parseAmount(token: string): number {
  let t = token.trim()
  let negative = false
  if (t.startsWith('(') && t.endsWith(')')) {
    negative = true
    t = t.slice(1, -1)
  }
  t = t.replace(/[€$£]/g, '').trim()
  if (t.startsWith('-')) {
    negative = true
    t = t.slice(1)
  }
  if (t.startsWith('+')) t = t.slice(1)
  // normalize thousands/decimal separators: assume last separator before 2 digits is decimal
  t = t.replace(/\s/g, '')
  const lastComma = t.lastIndexOf(',')
  const lastDot = t.lastIndexOf('.')
  const decimalSep = Math.max(lastComma, lastDot)
  if (decimalSep !== -1) {
    const intPart = t.slice(0, decimalSep).replace(/[.,]/g, '')
    const decPart = t.slice(decimalSep + 1)
    t = `${intPart}.${decPart}`
  }
  const value = parseFloat(t)
  return negative ? -value : value
}

export interface TextItem {
  str: string
  x: number
  y: number
}

interface ColumnPositions {
  out?: number
  in?: number
  balance?: number
}

/** Classify an amount's x position into the nearest known column. */
function classifyColumn(x: number, cols: ColumnPositions): 'out' | 'in' | 'balance' | null {
  const candidates: { key: 'out' | 'in' | 'balance'; pos: number }[] = []
  if (cols.out !== undefined) candidates.push({ key: 'out', pos: cols.out })
  if (cols.in !== undefined) candidates.push({ key: 'in', pos: cols.in })
  if (cols.balance !== undefined) candidates.push({ key: 'balance', pos: cols.balance })
  if (candidates.length === 0) return null

  let best = candidates[0]
  let bestDist = Math.abs(x - best.pos)
  for (const c of candidates.slice(1)) {
    const dist = Math.abs(x - c.pos)
    if (dist < bestDist) {
      best = c
      bestDist = dist
    }
  }
  // Don't classify if it's wildly off from any known column header
  if (bestDist > 60) return null
  return best.key
}

/** Parses a single transaction line (array of text items sorted by x). */
function parseLineItems(items: TextItem[], cols: ColumnPositions): ParsedTransaction | null {
  if (items.length === 0) return null
  const date = parseDateToken(items[0].str)
  if (!date) return null

  const rest = items.slice(1)
  const descParts: string[] = []
  let txAmount: number | null = null
  let txType: 'income' | 'expense' | null = null

  for (const item of rest) {
    const str = item.str.trim()
    if (AMOUNT_TOKEN_RE.test(str)) {
      const col = classifyColumn(item.x, cols)
      if (col === 'out' || col === 'in') {
        const value = Math.abs(parseAmount(str))
        if (!isNaN(value) && value !== 0) {
          txAmount = value
          txType = col === 'out' ? 'expense' : 'income'
        }
      }
      // 'balance' (or unclassified) amounts are ignored
    } else {
      descParts.push(str)
    }
  }

  if (txAmount === null || !txType) return null

  let description = descParts.join(' ').replace(/\s+/g, ' ').trim()
  if (!description) description = 'Transaction'

  return { date, description, amount: txAmount, type: txType }
}

export interface ParsedStatement {
  transactions: ParsedTransaction[]
  bank: 'KBC' | 'Revolut'
  warning?: string
}

function linesFor(items: TextItem[]): TextItem[][] {
  const lines = new Map<number, TextItem[]>()
  for (const item of items) {
    const key = Math.round(item.y)
    if (!lines.has(key)) lines.set(key, [])
    lines.get(key)!.push(item)
  }
  return [...lines.entries()].sort((a, b) => b[0] - a[0])
    .map(([, line]) => line.slice().sort((a, b) => a.x - b.x))
}

/** Parse extracted PDF text independently of the browser and PDF worker. */
export function parseStatementPages(pages: TextItem[][]): ParsedStatement {
  const pageLines = pages.map(linesFor)
  const text = pageLines.flat().map((line) => line.map((i) => i.str).join(' ')).join('\n')
  const transactions: ParsedTransaction[] = []
  if (/Export KBC Touch|KBC-Rekening/i.test(text)) {
    // KBC uses one signed amount column, rather than separate money-in/out columns.
    // Date-column anchors avoid mistaking payment-detail dates for new transactions.
    for (const lines of pageLines) {
      let current: ParsedTransaction | undefined
      let detail: 'Mededeling' | 'Tijdstip' | undefined
      for (const line of lines) {
        const date = line[0].x < 130 ? parseDateToken(line[0].str) : null
        if (date) {
          const amountItems = line.filter((i) => i.x > 400)
          const token = amountItems.map((i) => i.str).join('').replace(/EUR/g, '').replace(/[−–]/g, '-').trim()
          if (!/^[+-]?(?:\d+|\d{1,3}(?:[.\s]\d{3})+),\d{2}$/.test(token)) {
            throw new Error('A KBC transaction amount could not be read. No transactions were imported.')
          }
          const signed = parseAmount(token)
          current = { date, description: line.filter((i) => i.x >= 130 && i.x <= 400).map((i) => i.str).join(' ').trim() || 'Transaction',
            amount: Math.abs(signed), type: signed < 0 ? 'expense' : 'income' }
          transactions.push(current)
          detail = undefined
        } else if (current) {
          const description = line.filter((i) => i.x >= 130 && i.x <= 400).map((i) => i.str).join(' ').trim()
          if (description === 'Mededeling' || description === 'Tijdstip') detail = description
          else if (detail && description) {
            current.description += ` · ${description}`
            detail = undefined
          }
        }
      }
    }
    const count = text.match(/Aantal verrichtingen:\s*(\d+)/i)
    const total = text.match(/Totaal bedrag:\s*([+−–-]?[\d.\s]+,\d{2})/i)
    const netCents = transactions.reduce((sum, t) => sum + (t.type === 'income' ? 1 : -1) * Math.round(t.amount * 100), 0)
    if (count && Number(count[1]) !== transactions.length) {
      throw new Error(`KBC lists ${count[1]} transactions, but only ${transactions.length} could be read. Import stopped to prevent incomplete totals.`)
    }
    if (total && Math.round(parseAmount(total[1].replace(/[−–]/g, '-')) * 100) !== netCents) {
      throw new Error('The parsed KBC total does not match the statement total. Import stopped to prevent incorrect totals.')
    }
    const warning = /Alle uitgaven/i.test(text)
      ? 'This KBC export contains expenses only. Income is not included; upload an export of all transactions to see both totals.'
      : /Alle inkomsten/i.test(text)
        ? 'This KBC export contains income only. Expenses are not included; upload an export of all transactions to see both totals.'
        : undefined
    return { bank: 'KBC', transactions, warning }
  }
  const cols: ColumnPositions = { out: 335, in: 417, balance: 526 }
  for (const lines of pageLines) {
    for (const line of lines) {
      for (const item of line) {
        const norm = item.str.trim().toLowerCase()
        if (norm === 'money out') cols.out = item.x
        else if (norm === 'money in') cols.in = item.x
        else if (norm === 'balance') cols.balance = item.x
      }
    }
    for (const line of lines) {
      const parsed = parseLineItems(line, cols)
      if (parsed) transactions.push(parsed)
    }
  }
  return { bank: 'Revolut', transactions }
}

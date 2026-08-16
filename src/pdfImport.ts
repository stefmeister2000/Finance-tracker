import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

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

interface TextItem {
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

export async function parseStatementPdf(file: File): Promise<ParsedTransaction[]> {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise

  const transactions: ParsedTransaction[] = []
  // Default column positions based on Revolut's standard statement layout.
  const cols: ColumnPositions = { out: 335, in: 417, balance: 526 }

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const items: TextItem[] = (content.items as any[])
      .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }))

    // Group items into lines by rounded Y coordinate
    const lineMap = new Map<number, TextItem[]>()
    for (const item of items) {
      const key = Math.round(item.y)
      if (!lineMap.has(key)) lineMap.set(key, [])
      lineMap.get(key)!.push(item)
    }

    // Sort lines top-to-bottom (descending Y in PDF coords = top of page)
    const lines = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, lineItems]) => lineItems.slice().sort((a, b) => a.x - b.x))

    // Update column positions from header rows on this page
    for (const lineItems of lines) {
      for (const item of lineItems) {
        const norm = item.str.trim().toLowerCase()
        if (norm === 'money out') cols.out = item.x
        else if (norm === 'money in') cols.in = item.x
        else if (norm === 'balance') cols.balance = item.x
      }
    }

    for (const lineItems of lines) {
      const parsed = parseLineItems(lineItems, cols)
      if (parsed) transactions.push(parsed)
    }
  }

  return transactions
}

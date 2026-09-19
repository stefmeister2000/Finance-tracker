/** Canonical month keys used for navigation and reports. */
export function isMonthId(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function monthLabel(id: string): string {
  if (!isMonthId(id)) return 'Unknown month'
  const [year, month] = id.split('-').map(Number)
  const date = new Date(0)
  date.setFullYear(year, month - 1, 1)
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function sortedMonthIds(months: Record<string, unknown>): string[] {
  return Object.keys(months).filter(isMonthId).sort()
}

import type { ProductCostItem } from './types'

export function costVatBreakdown(item: ProductCostItem) {
  const net = item.amount
  const vat = item.vatRate === undefined ? null : net * item.vatRate
  return { net, vat, gross: vat === null ? null : net + vat }
}

export function costVatTotals(items: ProductCostItem[]) {
  const net = items.reduce((sum, item) => sum + item.amount, 0)
  const complete = items.every((item) => item.vatRate !== undefined)
  const vat = complete ? items.reduce((sum, item) => sum + costVatBreakdown(item).vat!, 0) : null
  return { net, vat, gross: vat === null ? null : net + vat }
}

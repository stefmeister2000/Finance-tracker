import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/productCosts.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { costVatBreakdown, costVatTotals } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
test('supplier rates stay separate and add up without changing net costs', () => {
  const items = [{ amount: 4.48, vatRate: 0.06 }, { amount: 6, vatRate: 0.21 }]
  const totals = costVatTotals(items)
  assert.ok(Math.abs(totals.net - 10.48) < 1e-9)
  assert.ok(Math.abs(totals.vat - 1.5288) < 1e-9)
  assert.ok(Math.abs(totals.gross - 12.0088) < 1e-9)
})
test('legacy costs preserve their amounts without inventing VAT', () => {
  assert.deepEqual(costVatBreakdown({ amount: 6 }), { net: 6, vat: null, gross: null })
  assert.deepEqual(costVatTotals([{ amount: 6 }, { amount: 4, vatRate: .21 }]), { net: 10, vat: null, gross: null })
})
test('explicit zero VAT is complete and distinct from an unknown rate', () => {
  assert.deepEqual(costVatTotals([{ amount: 6, vatRate: 0 }]), { net: 6, vat: 0, gross: 6 })
})

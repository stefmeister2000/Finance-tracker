import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/statementParser.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
const { parseStatementPages } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const item = (str, x, y) => ({ str, x, y })
const header = item('Export KBC Touch', 270, 5)
const row = (amount, y = 700) => [item('11-09-2026', 82, y), item('Example client', 145, y), item(amount, 470, y), item('EUR', 507, y + 2.8)]
test('KBC signed amounts, ungrouped thousands, details, filtering and totals across pages', () => {
  const result = parseStatementPages([
    [header, item('Alle uitgaven', 70, 740), ...row('-2250,00'), item('Tijdstip', 145, 680), item('12.48 uur', 145, 670), item('11-09-2026 om 12.48 uur', 145, 650)],
    [header, ...row('-50,03'), item('Aantal verrichtingen: 2', 70, 80), item('Totaal bedrag: -2300,03 EUR', 70, 60)],
  ])
  assert.equal(result.transactions.length, 2)
  assert.equal(result.transactions[0].amount, 2250)
  assert.equal(result.transactions[0].type, 'expense')
  assert.match(result.transactions[0].description, /12.48 uur/)
  assert.match(result.warning, /expenses only/)
})
test('KBC positive income with and without plus sign, grouped amounts and unicode minus', () => {
  const result = parseStatementPages([[header, ...row('+1.234,56'), ...row('2500,00', 600), ...row('−12,30', 500)]])
  assert.deepEqual(result.transactions.map(({ amount, type }) => [amount, type]), [[1234.56, 'income'], [2500, 'income'], [12.3, 'expense']])
})
test('KBC rejects incomplete or unbalanced statements and unreadable amounts', () => {
  for (const summary of ['Aantal verrichtingen: 2', 'Totaal bedrag: -9,99 EUR']) {
    assert.throws(() => parseStatementPages([[header, ...row('-50,03'), item(summary, 70, 60)]]))
  }
  assert.throws(() => parseStatementPages([[header, ...row('???')]]))
})
test('Revolut columns still distinguish income, expenses and balances', () => {
  const result = parseStatementPages([[
    item('Money out', 335, 740), item('Money in', 417, 740), item('Balance', 526, 740),
    item('Sep 1, 2026', 30, 700), item('Shop', 130, 700), item('25.00', 335, 700), item('100.00', 526, 700),
    item('Sep 2, 2026', 30, 680), item('Salary', 130, 680), item('900.00', 417, 680), item('1,000.00', 526, 680),
  ]])
  assert.deepEqual(result.transactions.map(({ amount, type }) => [amount, type]), [[25, 'expense'], [900, 'income']])
})
if (process.env.KBC_TEXT_FIXTURE) {
  test('user statement reconciles all 19 transactions to the printed total', () => {
    const result = parseStatementPages(JSON.parse(fs.readFileSync(process.env.KBC_TEXT_FIXTURE, 'utf8')))
    assert.equal(result.transactions.length, 19)
    assert.equal(result.transactions.filter(t => t.type === 'income').length, 0)
    assert.equal(result.transactions.reduce((s, t) => s + Math.round(t.amount * 100), 0), 1664623)
    assert.equal(new Set(result.transactions.map(t => `${t.date}|${t.description}|${t.amount}`)).size, 19)
  })
}

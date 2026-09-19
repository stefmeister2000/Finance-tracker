import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/months.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
const { isMonthId, monthLabel, sortedMonthIds } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
test('valid month keys render calendar labels in chronological order', () => {
  assert.equal(monthLabel('2026-09'), 'September 2026')
  assert.equal(monthLabel('2026-01'), 'January 2026')
  assert.deepEqual(sortedMonthIds({ '2026-09': {}, '2026-01': {} }), ['2026-01', '2026-09'])
})
test('malformed keys cannot appear as months or render Invalid Date', () => {
  for (const value of ['', 'undefined', 'name', '2026-00', '2026-13', '2026-9', '2026-09-16']) {
    assert.equal(isMonthId(value), false)
    assert.equal(monthLabel(value), 'Unknown month')
    assert.deepEqual(sortedMonthIds({ [value]: {} }), [])
  }
})

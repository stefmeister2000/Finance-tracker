import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../src/adReporting.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
const { adReportingWorkspace } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const ws = {
  adCampaigns: [{ id: 'a', accountId: 'one' }, { id: 'b', accountId: 'two' }, { id: 'c' }],
  adSpendEntries: [
    { id: '1', campaignId: 'a', date: '2026-09-01', spend: 10, revenue: 40 },
    { id: '2', campaignId: 'a', date: '2026-09-15', spend: 20, revenue: 50 },
    { id: '3', campaignId: 'a', date: '2026-08-01', spend: 900, revenue: 0 },
    { id: '4', campaignId: 'b', date: '2026-09-01', spend: 80, revenue: 100 },
    { id: '5', campaignId: 'c', date: '2026-09-01', spend: 5, revenue: 0 },
  ],
}
test('month and account isolate spend, revenue and multiple entries without mutation', () => {
  const scoped = adReportingWorkspace(ws, '2026-09', 'one')
  assert.deepEqual(scoped.adSpendEntries.map(e => e.id), ['1', '2'])
  assert.equal(scoped.adSpendEntries.reduce((s, e) => s + e.spend, 0), 30)
  assert.equal(scoped.adSpendEntries.reduce((s, e) => s + e.revenue, 0), 90)
  assert.equal(ws.adSpendEntries.length, 5)
})
test('all-time, unassigned and empty selections remain accurate', () => {
  assert.equal(adReportingWorkspace(ws, 'all', 'all').adSpendEntries.length, 5)
  assert.deepEqual(adReportingWorkspace(ws, '2026-09', '__none__').adSpendEntries.map(e => e.id), ['5'])
  assert.equal(adReportingWorkspace(ws, '2026-10', 'one').adSpendEntries.length, 0)
})

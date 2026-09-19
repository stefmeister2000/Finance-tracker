import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const { outputText } = ts.transpileModule(fs.readFileSync(new URL('../src/folders.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } })
const { contractFolders, invoiceFolders, invoiceFolder, deleteContractFolder, deleteInvoiceFolder } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
test('deleting a contract folder preserves files, signatures and metadata', () => {
  const ws = { contracts: [{ id: '1', type: 'Client', fileData: 'original', signed: true }, { id: '2', type: 'Supplier' }] }
  const result = deleteContractFolder(ws, 'Client')
  assert.equal(contractFolders(result).includes('Client'), false)
  assert.deepEqual(result.contracts[0], { id: '1', type: 'Unfiled', fileData: 'original', signed: true })
  assert.equal(result.contracts[1], ws.contracts[1])
  assert.equal(ws.contracts[0].type, 'Client')
  assert.equal(deleteContractFolder(result, 'Unfiled'), result)
})
test('invoice folder deletion is month-scoped and preserves legacy invoice records', () => {
  const ws = { accountingDocuments: [{ id: 'a', month: '2026-09', folder: 'b2b', data: 'pdf' }, { id: 'b', month: '2026-08', folder: 'b2b' }], invoices: [{ id: 'c', date: '2026-09-01', type: 'expense', amount: 100 }, { id: 'd', date: '2026-08-01', type: 'expense' }] }
  const result = deleteInvoiceFolder(ws, '2026-09', 'b2b')
  assert.equal(invoiceFolders(result, '2026-09').some(f => f.id === 'b2b'), false)
  assert.equal(invoiceFolders(result, '2026-08').some(f => f.id === 'b2b'), true)
  assert.deepEqual(result.accountingDocuments[0], { id: 'a', month: '2026-09', folder: 'unfiled', data: 'pdf' })
  assert.equal(invoiceFolder(result.invoices[0]), 'unfiled')
  assert.equal(result.invoices[0].amount, 100)
  assert.equal(result.accountingDocuments[1], ws.accountingDocuments[1])
  assert.equal(result.invoices[1], ws.invoices[1])
  assert.equal(deleteInvoiceFolder(result, '2026-09', 'unfiled'), result)
})
test('custom empty folders persist independently of their files', () => {
  assert.deepEqual(contractFolders({ contractFolders: ['Legal'], contracts: [] }), ['Legal'])
  assert.deepEqual(invoiceFolders({ invoiceFolders: { '2026-09': [{ id: 'custom', name: 'Receipts' }] } }, '2026-09'), [{ id: 'custom', name: 'Receipts' }])
})

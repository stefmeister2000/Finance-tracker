import type { Invoice, WorkspaceData } from './types'

export const DEFAULT_CONTRACT_FOLDERS = ['Client', 'Supplier', 'Employment', 'NDA', 'Service Agreement', 'Lease', 'Partnership', 'Other']
export const DEFAULT_INVOICE_FOLDERS = [
  { id: 'b2b', name: 'Invoices B2B', icon: '🧾', hint: 'Supplier invoices and business purchases' },
  { id: 'sales', name: 'Sales', icon: '↗', hint: 'Customer invoices and sales reports' },
  { id: 'bank', name: 'Bank statements', icon: '🏦', hint: 'Monthly statements from your bank' },
]
export const UNFILED = { id: 'unfiled', name: 'Unfiled', icon: '📁', hint: 'Files from deleted folders' }
export function contractFolders(ws: WorkspaceData): string[] {
  return Array.from(new Set([...(ws.contractFolders ?? DEFAULT_CONTRACT_FOLDERS), ...(ws.contracts ?? []).map(c => c.type || 'Other')]))
}
export function invoiceFolders(ws: WorkspaceData, month: string) {
  return ws.invoiceFolders?.[month] ?? DEFAULT_INVOICE_FOLDERS
}
export function invoiceFolder(invoice: Invoice): string {
  return invoice.accountingFolder ?? (invoice.type === 'income' ? 'sales' : 'b2b')
}
export function deleteContractFolder(ws: WorkspaceData, name: string): WorkspaceData {
  if (name === 'Unfiled') return ws
  return { ...ws, contractFolders: [...contractFolders(ws).filter(f => f !== name && f !== 'Unfiled'), 'Unfiled'],
    contracts: (ws.contracts ?? []).map(c => (c.type || 'Other') === name ? { ...c, type: 'Unfiled' } : c) }
}
export function deleteInvoiceFolder(ws: WorkspaceData, month: string, id: string): WorkspaceData {
  if (id === UNFILED.id) return ws
  return { ...ws,
    invoiceFolders: { ...ws.invoiceFolders, [month]: [...invoiceFolders(ws, month).filter(f => f.id !== id && f.id !== UNFILED.id), UNFILED] },
    accountingDocuments: (ws.accountingDocuments ?? []).map(d => d.month === month && d.folder === id ? { ...d, folder: UNFILED.id } : d),
    invoices: (ws.invoices ?? []).map(i => i.date.slice(0, 7) === month && invoiceFolder(i) === id ? { ...i, accountingFolder: UNFILED.id } : i),
  }
}

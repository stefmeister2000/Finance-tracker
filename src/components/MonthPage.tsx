import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import type { AppData, Invoice, InvoiceStatus, InvoiceType, WorkspaceData } from '../types'
import { monthLabel, sortedMonthIds, updateActiveWorkspace } from '../storage'
import { formatCurrency, monthTotals, netWorthAtMonth } from '../utils'
import TransactionsPanel from './TransactionsPanel'
import SummaryPanel from './SummaryPanel'
import ReceivablesPanel from './ReceivablesPanel'
import { InvoiceTable } from './InvoicesPage'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  monthId: string
  onDeleteMonth: (id: string) => void
  onNavigateMonth: (id: string) => void
}

export default function MonthPage({ data, ws, setData, monthId, onDeleteMonth, onNavigateMonth }: Props) {
  const { fmt, curr } = useCurrency()
  const [tab, setTab] = useState<'transactions' | 'breakdown' | 'owed' | 'invoices'>('transactions')
  const month = ws.months[monthId]
  const totals = monthTotals(month)
  const netWorth = netWorthAtMonth(ws, monthId)
  const ids = sortedMonthIds(ws.months)
  const idx = ids.indexOf(monthId)
  const pnlLabel = ws.kind === 'business' ? 'Profit / Loss' : 'Savings'

  return (
    <div>
      <div className="page-header">
        <h1>{monthLabel(monthId)}</h1>
        <div className="month-nav">
          {idx > 0 && (
            <button className="icon-btn" onClick={() => onNavigateMonth(ids[idx - 1])}>
              ← {monthLabel(ids[idx - 1])}
            </button>
          )}
          {idx < ids.length - 1 && (
            <button className="icon-btn" onClick={() => onNavigateMonth(ids[idx + 1])}>
              {monthLabel(ids[idx + 1])} →
            </button>
          )}
          <button
            className="icon-btn"
            onClick={() => {
              if (confirm(`Delete ${monthLabel(monthId)} and all its data?`)) onDeleteMonth(monthId)
            }}
          >
            🗑 Delete Month
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Income</div>
          <div className="value positive">{fmt(totals.income)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expenses</div>
          <div className="value negative">{fmt(totals.expense)}</div>
        </div>
        <div className="stat-card">
          <div className="label">{pnlLabel}</div>
          <div className={`value ${totals.net >= 0 ? 'positive' : 'negative'}`}>
            {fmt(totals.net)}
          </div>
          <div className="sub">
            {totals.income > 0 ? `${((totals.net / totals.income) * 100).toFixed(1)}% of income` : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Net Worth (this month)</div>
          <div className={`value ${netWorth >= 0 ? 'positive' : 'negative'}`}>
            {fmt(netWorth)}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'transactions' ? 'active' : ''} onClick={() => setTab('transactions')}>
          Transactions
        </button>
        <button className={tab === 'breakdown' ? 'active' : ''} onClick={() => setTab('breakdown')}>
          Breakdown
        </button>
        {ws.kind === 'business' && (
          <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>
            Invoices
          </button>
        )}
        <button className={tab === 'owed' ? 'active' : ''} onClick={() => setTab('owed')}>
          Owed to You
        </button>
      </div>

      {tab === 'transactions' && <TransactionsPanel data={data} ws={ws} setData={setData} monthId={monthId} />}
      {tab === 'breakdown' && <SummaryPanel ws={ws} monthId={monthId} setData={setData} />}
      {tab === 'invoices' && ws.kind === 'business' && (
        <MonthInvoicesPanel ws={ws} monthId={monthId} setData={setData} />
      )}
      {tab === 'owed' && <ReceivablesPanel ws={ws} setData={setData} monthId={monthId} />}
    </div>
  )
}

function MonthInvoicesPanel({
  ws,
  monthId,
  setData,
}: {
  ws: WorkspaceData
  monthId: string
  setData: React.Dispatch<React.SetStateAction<AppData>>
}) {
  const allInvoices = ws.invoices ?? []
  const monthInvoices = allInvoices.filter((i) => i.date.startsWith(monthId))
  const incomeInvs = monthInvoices.filter((i) => i.type === 'income')
  const expenseInvs = monthInvoices.filter((i) => i.type === 'expense')
  const totalIncome = incomeInvs.reduce((s, i) => s + i.amount, 0)
  const totalExpenses = expenseInvs.reduce((s, i) => s + i.amount, 0)
  const outstanding = monthInvoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + (i.type === 'income' ? i.amount : -i.amount), 0)

  const { fmt, curr } = useCurrency()

  function addInvoice(type: InvoiceType) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        invoices: [
          ...(w.invoices ?? []),
          {
            id: uuid(),
            type,
            party: type === 'income' ? 'New Client' : 'New Vendor',
            description: '',
            amount: 0,
            date: `${monthId}-01`,
            status: 'unpaid' as InvoiceStatus,
          },
        ],
      })),
    )
  }

  function updateInvoice(id: string, updates: Partial<Invoice>) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        invoices: (w.invoices ?? []).map((i) => (i.id === id ? { ...i, ...updates } : i)),
      })),
    )
  }

  function removeInvoice(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({ ...w, invoices: (w.invoices ?? []).filter((i) => i.id !== id) })),
    )
  }

  return (
    <div>
      {monthInvoices.length > 0 && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="label">Income Invoices</div>
            <div className="value positive">{fmt(totalIncome)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Expense Invoices</div>
            <div className="value negative">{fmt(totalExpenses)}</div>
          </div>
          <div className="stat-card">
            <div className="label">Outstanding</div>
            <div className={`value ${outstanding >= 0 ? 'positive' : 'negative'}`}>{fmt(outstanding)}</div>
          </div>
        </div>
      )}

      <div className="panel panel-assets">
        <div className="panel-header">
          <h2>Income Invoices</h2>
          <p>Money owed to the business by clients this month.</p>
          <button className="btn secondary small" onClick={() => addInvoice('income')}>+ Add Income Invoice</button>
        </div>
        <InvoiceTable invoices={incomeInvs} partyLabel="Client" currency={curr} onUpdate={updateInvoice} onRemove={removeInvoice} />
      </div>

      <div className="panel panel-liabilities">
        <div className="panel-header">
          <h2>Expense Invoices</h2>
          <p>Money the business owes to vendors this month.</p>
          <button className="btn secondary small" onClick={() => addInvoice('expense')}>+ Add Expense Invoice</button>
        </div>
        <InvoiceTable invoices={expenseInvs} partyLabel="Vendor" currency={curr} onUpdate={updateInvoice} onRemove={removeInvoice} />
      </div>
    </div>
  )
}

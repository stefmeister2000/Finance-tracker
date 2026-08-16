import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { AppData, AssetType, NetWorthAccount, WorkspaceData } from '../types'
import { guessNetWorthCategory } from '../categorize'
import { currentMonthId, monthLabel, updateActiveWorkspace } from '../storage'
import {
  accountValueAt,
  allMonthIds,
  formatCurrency,
  liquidNetWorth,
  netWorthAtMonth,
  netWorthByCategory,
  netWorthHistory,
} from '../utils'
import type { NetWorthCategoryGroup } from '../utils'
import NetWorthCategoryModal from './NetWorthCategoryModal'

interface Props {
  data: AppData
  ws: WorkspaceData
  setData: React.Dispatch<React.SetStateAction<AppData>>
}

export default function NetWorthPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const months = allMonthIds(ws)
  const [monthId, setMonthId] = useState(() => {
    const cur = currentMonthId()
    if (months.includes(cur)) return cur
    return months.length ? months[months.length - 1] : cur
  })
  const [managingCategories, setManagingCategories] = useState<AssetType | null>(null)

  const allMonths = months.includes(monthId) ? months : [...months, monthId].sort()
  const idx = allMonths.indexOf(monthId)
  const prevMonthId = idx > 0 ? allMonths[idx - 1] : undefined

  const totalAssets = ws.netWorthAccounts
    .filter((a) => a.type === 'asset')
    .reduce((s, a) => s + accountValueAt(a, monthId), 0)
  const totalLiabilities = ws.netWorthAccounts
    .filter((a) => a.type === 'liability')
    .reduce((s, a) => s + accountValueAt(a, monthId), 0)
  const netWorth = totalAssets - totalLiabilities
  const liquid = liquidNetWorth(ws, monthId)
  const prevNetWorth = prevMonthId ? netWorthAtMonth(ws, prevMonthId) : undefined
  const change = prevNetWorth !== undefined ? netWorth - prevNetWorth : undefined
  const changePct = change !== undefined && prevNetWorth ? (change / Math.abs(prevNetWorth)) * 100 : undefined

  const history = netWorthHistory(ws).map((d) => ({ ...d, label: monthLabel(d.month) }))

  const assetGroups = netWorthByCategory(ws, 'asset', monthId)
  const liabilityGroups = netWorthByCategory(ws, 'liability', monthId)

  const categoryIds = new Set(ws.netWorthCategories.map((c) => c.id))
  const ungroupedAssets = ws.netWorthAccounts.filter((a) => a.type === 'asset' && !categoryIds.has(a.category))
  const ungroupedLiabilities = ws.netWorthAccounts.filter(
    (a) => a.type === 'liability' && !categoryIds.has(a.category),
  )

  function addAccount(type: AssetType, categoryId = '') {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthAccounts: [
          ...w.netWorthAccounts,
          {
            id: uuid(),
            name: type === 'asset' ? 'New Asset' : 'New Liability',
            type,
            category: categoryId,
            values: {},
          },
        ],
      })),
    )
  }

  function removeAccount(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthAccounts: w.netWorthAccounts.filter((a) => a.id !== id),
      })),
    )
  }

  function updateAccount(id: string, updates: { name?: string; category?: string; notes?: string }) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthAccounts: w.netWorthAccounts.map((a) => (a.id === id ? { ...a, ...updates } : a)),
      })),
    )
  }

  function setAccountValue(id: string, value: number) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthAccounts: w.netWorthAccounts.map((a) =>
          a.id === id ? { ...a, values: { ...a.values, [monthId]: value } } : a,
        ),
      })),
    )
  }

  function autoCategorize() {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => ({
        ...w,
        netWorthAccounts: w.netWorthAccounts.map((a) => ({
          ...a,
          category: guessNetWorthCategory(a, w.netWorthCategories) ?? a.category,
        })),
      })),
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0 }}>Net Worth</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn secondary small" onClick={autoCategorize} title="Re-suggest categories for all accounts based on their names">
            ✨ Auto-categorize
          </button>
          <div className="field" style={{ minWidth: 180 }}>
            <input type="month" value={monthId} onChange={(e) => setMonthId(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Total Assets</div>
          <div className="value positive">{fmt(totalAssets)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Liabilities</div>
          <div className="value negative">{fmt(totalLiabilities)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net Worth</div>
          <div className={`value ${netWorth >= 0 ? 'positive' : 'negative'}`}>
            {fmt(netWorth)}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Liquid Net Worth</div>
          <div className={`value ${liquid >= 0 ? 'positive' : 'negative'}`}>
            {fmt(liquid)}
          </div>
          <div className="sub">Cash &amp; liquid investments minus liabilities</div>
        </div>
        <div className="stat-card">
          <div className="label">Change vs Previous Month</div>
          {change !== undefined ? (
            <div className={`value ${change >= 0 ? 'positive' : 'negative'}`}>
              {change >= 0 ? '+' : ''}
              {fmt(change)}
              {changePct !== undefined && (
                <span className="sub" style={{ marginLeft: 6, fontWeight: 700 }}>
                  ({change >= 0 ? '+' : ''}
                  {changePct.toFixed(1)}%)
                </span>
              )}
            </div>
          ) : (
            <div className="value">—</div>
          )}
        </div>
      </div>

      {history.length > 1 && (
        <div className="panel">
          <div className="panel-header">
            <h2>Net Worth Over Time</h2>
          </div>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" stroke="var(--text-muted)" fontSize={12} />
                <YAxis stroke="var(--text-muted)" fontSize={12} />
                <Tooltip
                  formatter={(value: number) => fmt(value)}
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Line type="monotone" dataKey="netWorth" name="Net Worth" stroke="#ff5a36" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="panel panel-assets">
        <div className="panel-header">
          <h2>Assets</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost small" onClick={() => setManagingCategories('asset')}>
              ⚙ Categories
            </button>
            <button className="btn secondary small" onClick={() => addAccount('asset')}>
              + Add Asset
            </button>
          </div>
        </div>
        {assetGroups.length === 0 && ungroupedAssets.length === 0 ? (
          <div className="empty-state">None added yet.</div>
        ) : (
          <div className="category-cards">
            {assetGroups.map((group) => (
              <CategoryCard
                key={group.category.id}
                group={group}
                allCategories={ws.netWorthCategories.filter((c) => c.type === 'asset')}
                monthId={monthId}
                prevMonthId={prevMonthId}
                currency={curr}
                onUpdate={updateAccount}
                onSetValue={setAccountValue}
                onRemove={removeAccount}
                onAdd={() => addAccount('asset', group.category.id)}
              />
            ))}
            {ungroupedAssets.map((account) => (
              <StandaloneCard
                key={account.id}
                account={account}
                allCategories={ws.netWorthCategories.filter((c) => c.type === 'asset')}
                monthId={monthId}
                currency={curr}
                onUpdate={updateAccount}
                onSetValue={setAccountValue}
                onRemove={removeAccount}
              />
            ))}
          </div>
        )}
      </div>

      <div className="panel panel-liabilities">
        <div className="panel-header">
          <h2>Liabilities</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost small" onClick={() => setManagingCategories('liability')}>
              ⚙ Categories
            </button>
            <button className="btn secondary small" onClick={() => addAccount('liability')}>
              + Add Liability
            </button>
          </div>
        </div>
        {liabilityGroups.length === 0 && ungroupedLiabilities.length === 0 ? (
          <div className="empty-state">None added yet.</div>
        ) : (
          <div className="category-cards">
            {liabilityGroups.map((group) => (
              <CategoryCard
                key={group.category.id}
                group={group}
                allCategories={ws.netWorthCategories.filter((c) => c.type === 'liability')}
                monthId={monthId}
                prevMonthId={prevMonthId}
                currency={curr}
                onUpdate={updateAccount}
                onSetValue={setAccountValue}
                onRemove={removeAccount}
                onAdd={() => addAccount('liability', group.category.id)}
              />
            ))}
            {ungroupedLiabilities.map((account) => (
              <StandaloneCard
                key={account.id}
                account={account}
                allCategories={ws.netWorthCategories.filter((c) => c.type === 'liability')}
                monthId={monthId}
                currency={curr}
                onUpdate={updateAccount}
                onSetValue={setAccountValue}
                onRemove={removeAccount}
              />
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Breakdown by Category</h2>
          <p>How your net worth is split across categories this month.</p>
        </div>
        <CategoryBreakdown assetGroups={assetGroups} liabilityGroups={liabilityGroups} currency={curr} />
      </div>

      {managingCategories && (
        <NetWorthCategoryModal
          ws={ws}
          type={managingCategories}
          setData={setData}
          onClose={() => setManagingCategories(null)}
        />
      )}
    </div>
  )
}

function CategoryCard({
  group,
  allCategories,
  monthId,
  prevMonthId,
  currency,
  onUpdate,
  onSetValue,
  onRemove,
  onAdd,
}: {
  group: NetWorthCategoryGroup
  allCategories: { id: string; name: string }[]
  monthId: string
  prevMonthId: string | undefined
  currency: string
  onUpdate: (id: string, updates: { name?: string; category?: string; notes?: string }) => void
  onSetValue: (id: string, value: number) => void
  onRemove: (id: string) => void
  onAdd: () => void
}) {
  const { fmt, curr } = useCurrency()
  const color = group.category.color
  const prevTotal =
    prevMonthId !== undefined
      ? group.accounts.reduce((s, a) => s + accountValueAt(a, prevMonthId), 0)
      : undefined
  const diff = prevTotal !== undefined ? group.total - prevTotal : undefined

  return (
    <div className="category-card" style={{ borderTopColor: color }}>
      <div className="category-card-header">
        <span className="tag" style={{ background: `${color}22`, color }}>
          <span className="dot" style={{ background: color }} />
          {group.category.name}
          {group.category.liquid && <span className="liquid-badge" title="Counts toward liquid net worth">💧</span>}
        </span>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="category-card-total">{fmt(group.total)}</div>
            {diff !== undefined && diff !== 0 && (
              <div className={`category-card-diff ${diff >= 0 ? 'positive' : 'negative'}`}>
                {diff >= 0 ? '▲' : '▼'} {fmt(Math.abs(diff))} vs last month
              </div>
            )}
          </div>
          <button className="btn ghost small category-card-add" onClick={onAdd} title={`Add to ${group.category.name}`}>
            +
          </button>
        </div>
      </div>
      <div className="category-card-rows">
        {group.accounts.map((a) => {
          const value = accountValueAt(a, monthId)
          const prevValue = prevMonthId !== undefined ? accountValueAt(a, prevMonthId) : undefined
          const accDiff = prevValue !== undefined ? value - prevValue : undefined
          const accPct = accDiff !== undefined && prevValue ? (accDiff / Math.abs(prevValue)) * 100 : undefined
          return (
            <div className="category-card-row" key={a.id}>
              <div className="category-card-row-top">
                <input
                  type="text"
                  className="table-input account-name-input"
                  value={a.name}
                  title={a.name}
                  onChange={(e) => onUpdate(a.id, { name: e.target.value })}
                />
                <button className="btn ghost small" onClick={() => onRemove(a.id)}>
                  ✕
                </button>
              </div>
              <input
                type="text"
                className="table-input"
                value={a.notes ?? ''}
                placeholder="Description (optional)…"
                onChange={(e) => onUpdate(a.id, { notes: e.target.value })}
                style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, width: '100%' }}
              />
              <div className="category-card-row-bottom">
                <select
                  className="table-input"
                  value={a.category}
                  onChange={(e) => onUpdate(a.id, { category: e.target.value })}
                >
                  {allCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="table-input amount-input"
                  value={value}
                  onChange={(e) => onSetValue(a.id, parseFloat(e.target.value) || 0)}
                />
              </div>
              {accDiff !== undefined && accDiff !== 0 && (
                <div className={`account-diff ${accDiff >= 0 ? 'positive' : 'negative'}`}>
                  {accDiff >= 0 ? '▲' : '▼'} {fmt(Math.abs(accDiff))}
                  {accPct !== undefined && ` (${accDiff >= 0 ? '+' : '-'}${Math.abs(accPct).toFixed(1)}%)`}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function StandaloneCard({
  account,
  allCategories,
  monthId,
  currency,
  onUpdate,
  onSetValue,
  onRemove,
}: {
  account: NetWorthAccount
  allCategories: { id: string; name: string }[]
  monthId: string
  currency: string
  onUpdate: (id: string, updates: { name?: string; category?: string; notes?: string }) => void
  onSetValue: (id: string, value: number) => void
  onRemove: (id: string) => void
}) {
  const { fmt, curr } = useCurrency()
  const value = accountValueAt(account, monthId)
  return (
    <div className={`standalone-card type-${account.type}`}>
      <div className="standalone-card-header">
        <span className="standalone-card-badge">New {account.type === 'asset' ? 'Asset' : 'Liability'}</span>
        <div style={{ textAlign: 'right' }}>
          <div className="category-card-total">{fmt(value)}</div>
        </div>
      </div>
      <div className="standalone-card-rows">
        <div className="category-card-row-top">
          <input
            type="text"
            className="table-input account-name-input"
            value={account.name}
            title={account.name}
            onChange={(e) => onUpdate(account.id, { name: e.target.value })}
          />
          <button className="btn ghost small" onClick={() => onRemove(account.id)}>
            ✕
          </button>
        </div>
        <input
          type="text"
          className="table-input"
          value={account.notes ?? ''}
          placeholder="Description (optional)…"
          onChange={(e) => onUpdate(account.id, { notes: e.target.value })}
          style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, width: '100%' }}
        />
        <div className="category-card-row-bottom">
          <select
            className="table-input"
            value=""
            onChange={(e) => onUpdate(account.id, { category: e.target.value })}
          >
            <option value="" disabled>
              Choose category…
            </option>
            {allCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            className="table-input amount-input"
            value={value}
            onChange={(e) => onSetValue(account.id, parseFloat(e.target.value) || 0)}
          />
        </div>
      </div>
    </div>
  )
}

function CategoryBreakdown({
  assetGroups,
  liabilityGroups,
  currency,
}: {
  assetGroups: NetWorthCategoryGroup[]
  liabilityGroups: NetWorthCategoryGroup[]
  currency: string
}) {
  if (assetGroups.length === 0 && liabilityGroups.length === 0) {
    return <div className="empty-state">No accounts yet.</div>
  }

  const assetTotal = assetGroups.reduce((s, g) => s + g.total, 0)
  const liabilityTotal = liabilityGroups.reduce((s, g) => s + g.total, 0)

  const { fmt, curr } = useCurrency()

  return (
    <div className="breakdown-grid">
      <BreakdownSection
        title="Assets"
        groups={assetGroups}
        total={assetTotal}
        currency={currency}
        className="assets"
      />
      <BreakdownSection
        title="Liabilities"
        groups={liabilityGroups}
        total={liabilityTotal}
        currency={currency}
        className="liabilities"
      />
    </div>
  )
}

function BreakdownSection({
  title,
  groups,
  total,
  currency,
  className,
}: {
  title: string
  groups: NetWorthCategoryGroup[]
  total: number
  currency: string
  className: string
}) {
  const { fmt, curr } = useCurrency()
  return (
    <div className={`breakdown-section ${className}`}>
      <div className="breakdown-section-header">
        <h3>{title}</h3>
        <span className="total">{fmt(total)}</span>
      </div>
      {groups.length === 0 ? (
        <div className="empty-state">None added yet.</div>
      ) : (
        <div className="breakdown-list">
          {groups.map((group) => {
            const color = group.category.color
            const pct = total !== 0 ? (group.total / total) * 100 : 0
            return (
              <div className="breakdown-row" key={group.category.id}>
                <div className="breakdown-row-top">
                  <span className="tag" style={{ background: `${color}22`, color }}>
                    <span className="dot" style={{ background: color }} />
                    {group.category.name}
                    {group.category.liquid && (
                      <span className="liquid-badge" title="Counts toward liquid net worth">
                        💧
                      </span>
                    )}
                  </span>
                  <span className="amount">{fmt(group.total)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="breakdown-bar">
                    <div
                      className="breakdown-bar-fill"
                      style={{ width: `${Math.max(0, Math.min(100, Math.abs(pct)))}%`, background: color }}
                    />
                  </div>
                  <span className="pct">{pct.toFixed(1)}%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

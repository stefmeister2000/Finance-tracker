import { useCurrency } from '../CurrencyContext'
import { useState } from 'react'
import { v4 as uuid } from 'uuid'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { AppData, AssetType, NetWorthAccount, WorkspaceData } from '../types'
import { currentMonthId, monthLabel, updateActiveWorkspace } from '../storage'
import { accountValueAt, allMonthIds, liquidNetWorth, netWorthAtMonth, netWorthHistory } from '../utils'
import NetWorthCategoryModal from './NetWorthCategoryModal'

interface Props { data: AppData; ws: WorkspaceData; setData: React.Dispatch<React.SetStateAction<AppData>> }
type Draft = { id: string; name: string; category: string; notes: string; type: AssetType; balance: string; isNew?: boolean }

export default function NetWorthPage({ ws, setData }: Props) {
  const { fmt } = useCurrency()
  const months = allMonthIds(ws)
  const [monthId, setMonthId] = useState(() => months.includes(currentMonthId()) ? currentMonthId() : months[months.length - 1] ?? currentMonthId())
  const [tab, setTab] = useState<'accounts' | 'allocation' | 'history'>('accounts')
  const [kind, setKind] = useState<AssetType>('asset')
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [managing, setManaging] = useState<AssetType | null>(null)
  const allMonths = [...new Set([...months, monthId])].sort()
  const previous = allMonths[allMonths.indexOf(monthId) - 1]
  const accounts = ws.netWorthAccounts
  const totalFor = (type: AssetType) => accounts.filter(a => a.type === type).reduce((sum, a) => sum + accountValueAt(a, monthId), 0)
  const assets = totalFor('asset'), debts = totalFor('liability'), net = assets - debts
  const liquid = liquidNetWorth(ws, monthId)
  const change = previous ? net - netWorthAtMonth(ws, previous) : undefined
  const history = netWorthHistory(ws).map(d => ({ ...d, label: monthLabel(d.month) }))
  const categories = ws.netWorthCategories.filter(c => c.type === kind)
  const visible = accounts.filter(a => a.type === kind && `${a.name} ${a.notes ?? ''}`.toLowerCase().includes(search.toLowerCase()))
  const groups = [...categories.map(c => ({ id: c.id, name: c.name, color: c.color, liquid: c.liquid, accounts: visible.filter(a => a.category === c.id) })),
    { id: '', name: 'Uncategorised', color: '#94a3b8', liquid: false, accounts: visible.filter(a => !categories.some(c => c.id === a.category)) }]
    .filter(g => g.accounts.length > 0)
  const allocation = ws.netWorthCategories.filter(c => c.type === 'asset').map(c => ({ ...c, value: accounts.filter(a => a.type === 'asset' && a.category === c.id).reduce((s,a) => s + accountValueAt(a,monthId),0) }))
  const unassigned = accounts.filter(a => a.type === 'asset' && !allocation.some(c => c.id === a.category)).reduce((s,a) => s + accountValueAt(a,monthId),0)
  if (unassigned) allocation.push({ id: 'unassigned', name: 'Uncategorised', color: '#94a3b8', type: 'asset', liquid: false, value: unassigned })
  allocation.sort((a,b) => b.value - a.value)

  function edit(account?: NetWorthAccount, category = '') {
    setDraft(account ? { id: account.id, name: account.name, category: account.category, notes: account.notes ?? '', type: account.type, balance: String(accountValueAt(account,monthId)) }
      : { id: uuid(), name: '', category, notes: '', type: kind, balance: '', isNew: true })
  }
  function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft || !draft.name.trim() || draft.balance.trim() === '' || !Number.isFinite(Number(draft.balance)) || Number(draft.balance) < 0) return
    const saved = draft
    setData(prev => updateActiveWorkspace(prev, w => {
      const old = w.netWorthAccounts.find(a => a.id === saved.id)
      const account: NetWorthAccount = { ...old, id: saved.id, name: saved.name.trim(), category: saved.category, notes: saved.notes.trim(), type: saved.type, values: { ...(old?.values ?? {}), [monthId]: Number(saved.balance) } }
      return { ...w, netWorthAccounts: saved.isNew ? [...w.netWorthAccounts, account] : w.netWorthAccounts.map(a => a.id === saved.id ? account : a) }
    }))
    setDraft(null)
  }
  function remove() {
    if (!draft || !confirm(`Remove “${draft.name}” and its monthly balances? You can undo this change.`)) return
    const id = draft.id
    setData(prev => updateActiveWorkspace(prev,w => ({ ...w, netWorthAccounts: w.netWorthAccounts.filter(a => a.id !== id) })))
    setDraft(null)
  }
  const chart = <ResponsiveContainer width="100%" height="100%"><LineChart data={history} margin={{top: 16,right: 20,left: 12,bottom: 0}}><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 5"/><XAxis dataKey="label" axisLine={false} tickLine={false} fontSize={11} minTickGap={30}/><YAxis width={65} axisLine={false} tickLine={false} fontSize={11} tickFormatter={v => `${Math.round(v/1000)}k`}/><Tooltip formatter={(v: number) => fmt(v)} contentStyle={{borderRadius:12,border:'1px solid var(--border)'}}/><Line dataKey="netWorth" name="Net worth" stroke="#228877" strokeWidth={3} dot={false} activeDot={{r:5}} /></LineChart></ResponsiveContainer>

  return <div className="wealth-page">
    <div className="wealth-toolbar"><div><span className="wealth-eyebrow">YOUR FINANCIAL PICTURE</span><p>What you own, what you owe, and how it changes.</p></div><label>Snapshot month<input aria-label="Snapshot month" type="month" required value={monthId} onChange={e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) setMonthId(e.target.value) }} /></label></div>
    <section className="wealth-hero">
      <div className="wealth-headline"><span>Net worth · {monthLabel(monthId)}</span><strong>{fmt(net)}</strong><div className={`wealth-change ${change !== undefined && change < 0 ? 'down' : ''}`}>{change === undefined ? 'Your first snapshot' : `${change >= 0 ? '+' : ''}${fmt(change)} since ${monthLabel(previous)}`}</div><p>Assets minus liabilities</p></div>
      <div className="wealth-summary"><div><span>Assets</span><strong>{fmt(assets)}</strong><small>Everything you own</small></div><div><span>Liabilities</span><strong>{fmt(debts)}</strong><small>Everything you owe</small></div><div><span>Liquid net worth</span><strong>{fmt(liquid)}</strong><small>Cash and liquid investments, minus debt</small></div></div>
    </section>
    <nav className="wealth-tabs" aria-label="Net worth views">{(['accounts','allocation','history'] as const).map(t => <button key={t} aria-pressed={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t === 'accounts' ? 'Accounts & balances' : t === 'allocation' ? 'Asset allocation' : 'History'}</button>)}</nav>
    {tab === 'accounts' && <section className="wealth-register">
      <div className="wealth-register-head"><div className="wealth-kind"><button className={kind === 'asset' ? 'active' : ''} onClick={() => setKind('asset')}>Assets <span>{accounts.filter(a=>a.type==='asset').length}</span></button><button className={kind === 'liability' ? 'active' : ''} onClick={() => setKind('liability')}>Liabilities <span>{accounts.filter(a=>a.type==='liability').length}</span></button></div><div className="wealth-actions"><button className="btn ghost small" onClick={() => setManaging(kind)}>Manage categories</button><button className="btn accent small" onClick={() => edit()}>+ Add {kind === 'asset' ? 'asset' : 'liability'}</button></div></div>
      <div className="wealth-search"><input aria-label="Search accounts" placeholder="Search accounts…" value={search} onChange={e=>setSearch(e.target.value)}/><span>Balances for {monthLabel(monthId)}</span></div>
      <div className="wealth-column-head"><span>Account</span><span>Change{previous ? ` vs ${monthLabel(previous)}` : ''}</span><span>Balance</span><span/></div>
      {groups.map(g => <div className="wealth-group" key={g.id} style={{ '--group-color': g.color } as React.CSSProperties}>
        <div className="wealth-group-head"><button aria-expanded={!collapsed.has(g.id)} onClick={() => setCollapsed(old => { const next = new Set(old); next.has(g.id) ? next.delete(g.id) : next.add(g.id); return next })}><span className="wealth-dot" style={{background:g.color}}/>{g.name}<small>{g.accounts.length} {g.accounts.length === 1 ? 'account' : 'accounts'}</small><span className="wealth-chevron">{collapsed.has(g.id) ? '▸' : '▾'}</span></button>{g.liquid && <span className="wealth-liquid">Liquid</span>}<strong>{fmt(g.accounts.reduce((s,a)=>s+accountValueAt(a,monthId),0))}</strong></div>
        {!collapsed.has(g.id) && g.accounts.map(a => { const value = accountValueAt(a,monthId); const delta = previous ? value-accountValueAt(a,previous) : undefined; return <div className="wealth-account" key={a.id}><div className="wealth-account-name"><strong>{a.name}</strong>{a.notes && <small>{a.notes}</small>}</div><span className={`wealth-delta ${delta && (a.type === 'asset' ? delta > 0 : delta < 0) ? 'positive' : delta ? 'negative' : ''}`}>{delta ? `${delta>0?'+':''}${fmt(delta)}` : '—'}</span><button className="wealth-balance" title={`Edit ${a.name} balance`} onClick={()=>edit(a)}>{fmt(value)}</button><button className="btn ghost small" aria-label={`Edit ${a.name}`} onClick={()=>edit(a)}>Edit</button></div> })}
      </div>)}
      {!groups.length && <div className="empty-state">{search ? 'No accounts match your search.' : kind === 'liability' ? 'No liabilities recorded.' : 'Add your first asset to start tracking your net worth.'}</div>}
      <div className="wealth-total"><span>Total {kind === 'asset' ? 'assets' : 'liabilities'}{search ? ' · filtered' : ''}</span><strong>{fmt(visible.reduce((s,a)=>s+accountValueAt(a,monthId),0))}</strong></div>
      <p className="wealth-footnote">Click a balance or Edit to update an account. The latest recorded balance carries forward until you enter a new one.</p>
    </section>}
    {tab === 'allocation' && <section className="wealth-register wealth-allocation"><h2>Where your assets are held</h2><p className="drive-muted">Share of {fmt(assets)} in assets · {monthLabel(monthId)}</p>{allocation.filter(c=>c.value!==0).map(c=><div className="wealth-allocation-row" key={c.id}><div><span><i className="wealth-dot" style={{background:c.color}}/>{c.name}</span><strong>{fmt(c.value)} <small>{assets > 0 ? `${(c.value/assets*100).toFixed(1)}%` : '—'}</small></strong></div><div className="wealth-bar"><span style={{width:`${assets>0?Math.max(0,Math.min(100,c.value/assets*100)):0}%`,background:c.color}}/></div></div>)}{!assets && <div className="empty-state">Add asset balances to see your allocation.</div>}</section>}
    {tab === 'history' && <section className="wealth-register wealth-history"><h2>Your net worth over time</h2><p className="drive-muted">Recorded monthly snapshots across all accounts.</p>{history.length>1 ? <div className="wealth-chart">{chart}</div> : <div className="empty-state">Record balances in another month to see your trend.</div>}</section>}
    {draft && <div className="modal-backdrop" onClick={()=>setDraft(null)}><form className="wealth-editor" role="dialog" aria-modal="true" aria-labelledby="wealth-editor-title" onClick={e=>e.stopPropagation()} onSubmit={save} onKeyDown={e=>{if(e.key==='Escape')setDraft(null)}}><div className="wealth-editor-heading"><div><h2 id="wealth-editor-title">{draft.isNew?'Add':'Edit'} {draft.type === 'asset'?'asset':'liability'}</h2><p>{monthLabel(monthId)} · amounts in {ws.currency}</p></div><button type="button" className="btn ghost small" aria-label="Close editor" onClick={()=>setDraft(null)}>✕</button></div><label>Account name<input autoFocus required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="e.g. Savings account"/></label><div className="wealth-editor-grid"><label>Category<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}><option value="">Uncategorised</option>{ws.netWorthCategories.filter(c=>c.type===draft.type).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Balance ({ws.currency})<input required type="number" min="0" step="0.01" value={draft.balance} onChange={e=>setDraft({...draft,balance:e.target.value})}/></label></div><label>Notes <span className="drive-muted">(optional)</span><input value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} placeholder="Add a short note"/></label><div className="wealth-editor-actions">{!draft.isNew && <button type="button" className="btn ghost small danger" onClick={remove}>Remove account</button>}<button type="button" className="btn secondary" onClick={()=>setDraft(null)}>Cancel</button><button className="btn accent" type="submit">Save changes</button></div></form></div>}
    {managing && <NetWorthCategoryModal ws={ws} type={managing} setData={setData} onClose={()=>setManaging(null)}/>}
  </div>
}

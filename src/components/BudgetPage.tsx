import { useState } from 'react'
import { useCurrency } from '../CurrencyContext'
import { v4 as uuid } from 'uuid'
import type { AppData, FixedCostItem, WorkspaceData } from '../types'
import { updateActiveWorkspace } from '../storage'
import { totalsByCategoryRange } from '../utils'
import CategoryTag from './CategoryTag'

type Section = 'income' | 'fixed' | 'variable' | 'partner'
const sections = {
  income: { title: 'Fixed income', description: 'Money you expect to receive every month, such as salary or recurring client work.', action: 'Add income', color: '#159578' },
  fixed: { title: 'Fixed costs', description: 'Regular monthly commitments, such as rent, subscriptions and loan payments.', action: 'Add fixed cost', color: '#d64d65' },
  variable: { title: 'Variable budget', description: 'Your monthly allowance for costs that change, such as groceries, travel or advertising.', action: 'Add budget item', color: '#ba7819' },
  partner: { title: 'Partner expenses', description: 'Tracked separately. These amounts are not deducted from your monthly balance.', action: 'Add partner expense', color: '#8060bb' },
}
interface Props { data: AppData; ws: WorkspaceData; setData: React.Dispatch<React.SetStateAction<AppData>> }
export default function BudgetPage({ ws, setData }: Props) {
  const { fmt, curr } = useCurrency()
  const [section, setSection] = useState<Section>('income')
  const [draft, setDraft] = useState<{ section: Section; item: FixedCostItem; amount: string; existing: boolean } | null>(null)
  const [search, setSearch] = useState('')
  const clients = ws.kind === 'personal' ? ws.freelanceClients ?? [] : []
  const linked = clients.filter(c => c.fixedIncome)
  const lists: Record<Section, FixedCostItem[]> = { income: ws.fixedIncome ?? [], fixed: (ws.fixedCosts ?? []).filter(i => i.type === 'fixed'), variable: (ws.fixedCosts ?? []).filter(i => i.type === 'variable'), partner: ws.partnerExpenses ?? [] }
  const totals = Object.fromEntries(Object.entries(lists).map(([key, items]) => [key, items.reduce((sum, i) => sum + i.monthlyCost, 0)])) as Record<Section, number>
  const freelanceTotal = linked.reduce((sum, c) => sum + c.amount, 0)
  totals.income += freelanceTotal
  const remaining = totals.income - totals.fixed - totals.variable
  const meta = sections[section]
  const visibleItems = lists[section].filter(i => `${i.name} ${i.category}`.toLowerCase().includes(search.toLowerCase()))
  const groups = Array.from(new Set(visibleItems.map(i => i.category.trim() || 'Other'))).sort()
  const months = Object.keys(ws.months)
  const dismissed = new Set(ws.dismissedEstimates ?? [])
  const estimates = Array.from(totalsByCategoryRange(ws, months, 'expense')).map(([id, total]) => ({ cat: ws.categories.find(c => c.id === id), amount: total / (months.length || 1) })).filter(e => e.cat && e.amount > 0 && !dismissed.has(e.cat.id)).sort((a,b) => b.amount-a.amount)
  function edit(target: Section, item?: FixedCostItem) {
    setDraft({ section: target, item: item ?? { id: uuid(), type: target === 'variable' ? 'variable' : 'fixed', name: '', category: '', monthlyCost: 0 }, amount: item ? String(item.monthlyCost) : '', existing: !!item })
  }
  function save() {
    if (!draft || !draft.item.name.trim() || draft.amount.trim() === '' || !Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0) return
    const item = { ...draft.item, name: draft.item.name.trim(), category: draft.item.category.trim() || 'Other', monthlyCost: Number(draft.amount) }
    const field = draft.section === 'income' ? 'fixedIncome' : draft.section === 'partner' ? 'partnerExpenses' : 'fixedCosts'
    setData(prev => updateActiveWorkspace(prev, w => ({ ...w, [field]: draft.existing ? (w[field] ?? []).map(i => i.id === item.id ? item : i) : [...(w[field] ?? []), item] })))
    setDraft(null)
  }
  function remove() {
    if (!draft || !window.confirm(`Remove “${draft.item.name}” from your monthly plan?`)) return
    const field = draft.section === 'income' ? 'fixedIncome' : draft.section === 'partner' ? 'partnerExpenses' : 'fixedCosts'
    setData(prev => updateActiveWorkspace(prev, w => ({ ...w, [field]: (w[field] ?? []).filter(i => i.id !== draft.item.id) })))
    setDraft(null)
  }
  return <div className="clear-page budget-page monthly-plan">
    <section className="plan-summary" aria-label="Monthly plan summary">
      <div className="plan-calculation"><div className="plan-eyebrow">Your monthly plan</div><h2>A clear view of what’s left</h2><p>Expected income minus your planned expenses. Actual transactions are tracked separately.</p>
        <div className="plan-equation">
          <button onClick={() => {setSection('income'); setSearch('')}}><span>Money in</span><strong className="positive">{fmt(totals.income)}</strong><small>Fixed income</small></button>
          <span aria-hidden="true">−</span><button onClick={() => {setSection('fixed'); setSearch('')}}><span>Regular bills</span><strong>{fmt(totals.fixed)}</strong><small>Fixed costs</small></button>
          <span aria-hidden="true">−</span><button onClick={() => {setSection('variable'); setSearch('')}}><span>Flexible spending</span><strong>{fmt(totals.variable)}</strong><small>Variable budget</small></button>
        </div>
      </div>
      <div className={`plan-balance ${remaining < 0 ? 'is-short' : ''}`}><span>{remaining < 0 ? 'Monthly shortfall' : 'Left each month'}</span><strong>{fmt(Math.abs(remaining))}</strong><p>{remaining < 0 ? 'Planned expenses exceed your recurring income.' : 'Available after all planned costs.'}</p><small>Total planned costs: {fmt(totals.fixed + totals.variable)} / month</small></div>
    </section>
    <div className="plan-tabs" role="tablist" aria-label="Monthly plan sections">{(Object.keys(sections) as Section[]).filter(s => s !== 'partner' || ws.kind === 'personal').map(s => <button key={s} role="tab" aria-selected={section === s} onClick={() => {setSection(s);setSearch('')}} className={section === s ? 'active' : ''} style={{'--plan-color': sections[s].color} as React.CSSProperties}><span>{sections[s].title}</span><strong>{fmt(totals[s])}<small> / mo</small></strong></button>)}</div>
    <section className="plan-register" aria-label={meta.title} style={{'--plan-color': meta.color} as React.CSSProperties}>
      <div className="plan-register-head"><div><h2>{meta.title}</h2><p>{meta.description}</p></div><button className="btn primary" onClick={() => edit(section)}>+ {meta.action}</button></div>
      {section === 'income' && clients.length > 0 && <div className="plan-clients">
        <details><summary><span><strong>Linked freelance income</strong><small>{linked.length} recurring client{linked.length === 1 ? '' : 's'} · Manage clients</small></span><strong className="positive">{fmt(freelanceTotal)} / mo</strong></summary>
          <p>Select only clients who pay you every month. Their amounts stay in sync with Freelance Clients. Don’t add these again as manual income.</p>
          {clients.map(c => <label className="plan-client" key={c.id}><input type="checkbox" checked={!!c.fixedIncome} onChange={e => { const checked = e.target.checked;setData(prev => updateActiveWorkspace(prev, w => ({...w, freelanceClients:(w.freelanceClients ?? []).map(x => x.id === c.id ? {...x,fixedIncome:checked} : x)})))}}/><span><strong>{c.client || 'Unnamed client'}</strong><small>{c.description || 'Recurring client payment'}</small></span><strong>{fmt(c.amount)} / mo</strong></label>)}
        </details>
        {linked.length > 0 && <div className="plan-linked-names">Included: {linked.map(c => c.client || 'Unnamed client').join(', ')}</div>}
      </div>}
      <div className="plan-list-toolbar"><input type="search" aria-label="Search plan items" placeholder="Search items or categories…" value={search} onChange={e => setSearch(e.target.value)}/><span>{section === 'income' ? 'Manually added income' : `${lists[section].length} planned item${lists[section].length === 1 ? '' : 's'}`} · {curr} / month</span></div>
      {groups.length === 0 && <div className="empty-state">{search ? 'No matching items.' : `No ${section === 'income' ? 'manual income' : 'items'} yet. Use “${meta.action}” to get started.`}</div>}
      {groups.map(category => {const group = visibleItems.filter(i => (i.category.trim() || 'Other') === category);return <div className="plan-group" key={category}><div className="plan-group-title"><strong>{category}</strong><span>{fmt(group.reduce((s,i) => s+i.monthlyCost,0))} / mo</span></div>{group.map(item => <div className="plan-row" key={item.id}><strong>{item.name || 'Unnamed item'}</strong><span className="plan-row-amount">{fmt(item.monthlyCost)}<small> / mo</small></span><button className="btn secondary small" aria-label={`Edit ${item.name}`} onClick={() => edit(section,item)}>Edit</button></div>)}</div>})}
      <div className="plan-total"><span>Total {meta.title.toLowerCase()}{section === 'income' && linked.length > 0 ? ' · including linked clients' : ''}</span><strong>{fmt(totals[section])} / month</strong></div>
    </section>
    {(estimates.length > 0 || dismissed.size > 0) && <details className="plan-estimates"><summary>Past spending · optional planning reference</summary><p>Monthly averages across {months.length} months. These are not included in your plan unless you add them.</p>{dismissed.size > 0 && <button className="btn secondary small" onClick={() => setData(prev => updateActiveWorkspace(prev,w => ({...w,dismissedEstimates:[]})))}>Restore hidden categories ({dismissed.size})</button>}{estimates.map(({cat,amount}) => <div className="plan-estimate-row" key={cat!.id}><CategoryTag category={cat!}/><strong>{fmt(amount)} / mo</strong><button className="btn secondary small" onClick={() => {edit('fixed');setDraft(d => d && ({...d,item:{...d.item,name:cat!.name,category:cat!.name},amount:amount.toFixed(2)}))}}>Add fixed cost</button><button className="btn secondary small" onClick={() => {edit('variable');setDraft(d => d && ({...d,item:{...d.item,name:cat!.name,category:cat!.name},amount:amount.toFixed(2)}))}}>Add variable budget</button><button className="btn ghost small" aria-label={`Hide ${cat!.name} estimate`} onClick={() => setData(prev => updateActiveWorkspace(prev,w => ({...w,dismissedEstimates:[...(w.dismissedEstimates ?? []),cat!.id]})))}>Hide</button></div>)}</details>}
    {draft && <div className="plan-modal-backdrop" onClick={() => setDraft(null)}><form role="dialog" aria-modal="true" aria-label={draft.existing ? 'Edit monthly item' : sections[draft.section].action} className="plan-editor" onClick={e => e.stopPropagation()} onSubmit={e => {e.preventDefault();save()}} onKeyDown={e => {if(e.key === 'Escape')setDraft(null)}}><div className="plan-register-head"><h2>{draft.existing ? 'Edit monthly item' : sections[draft.section].action}</h2><button type="button" className="btn ghost" aria-label="Close editor" onClick={() => setDraft(null)}>✕</button></div><p>{sections[draft.section].description}</p><label>Name<input autoFocus required placeholder={draft.section === 'income' ? 'e.g. Monthly salary' : 'e.g. House rent'} value={draft.item.name} onChange={e => setDraft({...draft,item:{...draft.item,name:e.target.value}})}/></label><label>Category<input placeholder="e.g. Housing" list="plan-category-options" value={draft.item.category} onChange={e => setDraft({...draft,item:{...draft.item,category:e.target.value}})}/><datalist id="plan-category-options">{Array.from(new Set(lists[draft.section].map(i => i.category))).map(c => <option key={c} value={c}/>)}</datalist></label><label>Monthly amount ({curr})<input required type="number" min="0" step="0.01" value={draft.amount} onChange={e => setDraft({...draft,amount:e.target.value})}/></label><div className="plan-editor-actions">{draft.existing && <button type="button" className="btn ghost danger" onClick={remove}>Remove item</button>}<button type="button" className="btn secondary" onClick={() => setDraft(null)}>Cancel</button><button className="btn primary" type="submit">Save {draft.existing ? 'changes' : 'item'}</button></div></form></div>}
  </div>
}

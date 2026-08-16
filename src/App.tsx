import { useEffect, useRef, useState } from 'react'
import type { AppData } from './types'
import {
  activeWorkspace,
  addBusinessWorkspace,
  currentMonthId,
  emptyMonth,
  loadData,
  removeWorkspace,
  renameWorkspace,
  reorderWorkspaces,
  setWorkspaceIcon,
  setWorkspaceHidden,
  saveData,
  flushDataBeacon,
  sortedMonthIds,
  updateActiveWorkspace,
} from './storage'
import { accountValueAt, reconcileAdSpendTransactions, reconcileStartupCostTransactions } from './utils'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import OverviewPage from './components/OverviewPage'
import MonthPage from './components/MonthPage'
import NetWorthPage from './components/NetWorthPage'
import SubscriptionsPage from './components/SubscriptionsPage'
import BudgetPage from './components/BudgetPage'
import InvoicesPage from './components/InvoicesPage'
import AdSpendPage from './components/AdSpendPage'
import InfluencersPage from './components/InfluencersPage'
import RetailPage from './components/RetailPage'
import FundingPage from './components/FundingPage'
import FinancialModelPage from './components/FinancialModelPage'
import InventoryPage from './components/InventoryPage'
import StartupCostsPage from './components/StartupCostsPage'
import BusinessToolsPage from './components/BusinessToolsPage'
import ContractsPage from './components/ContractsPage'
import SettingsModal from './components/SettingsModal'

export type View =
  | { type: 'overview' }
  | { type: 'month'; id: string }
  | { type: 'networth' }
  | { type: 'subscriptions' }
  | { type: 'budget' }
  | { type: 'invoices' }
  | { type: 'adspend' }
  | { type: 'influencers' }
  | { type: 'retail' }
  | { type: 'funding' }
  | { type: 'model' }
  | { type: 'inventory' }
  | { type: 'startup' }
  | { type: 'tools' }
  | { type: 'contracts' }

export default function App() {
  const [data, setDataRaw] = useState<AppData | null>(null)
  const setData: React.Dispatch<React.SetStateAction<AppData>> = (value) => {
    setDataRaw((prev) => {
      if (prev === null) return prev
      return typeof value === 'function' ? (value as (p: AppData) => AppData)(prev) : value
    })
  }
  const [rawView, setView] = useState<View>({ type: 'overview' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const skipNextSave = useRef(true)

  // Undo / redo history. Rapid-fire edits (e.g. typing) are coalesced into a
  // single step by deferring the push onto `past` until things settle.
  const [past, setPast] = useState<AppData[]>([])
  const [future, setFuture] = useState<AppData[]>([])
  const prevDataRef = useRef<AppData | null>(null)
  const pendingSnapshot = useRef<AppData | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUndoRedo = useRef(false)

  function flushPending() {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    if (pendingSnapshot.current) {
      const snapshot = pendingSnapshot.current
      pendingSnapshot.current = null
      setPast((p) => [...p, snapshot].slice(-50))
    }
  }

  function undo() {
    flushPending()
    setPast((p) => {
      if (p.length === 0 || !data) return p
      const previous = p[p.length - 1]
      setFuture((f) => [data, ...f].slice(0, 50))
      isUndoRedo.current = true
      setDataRaw(previous)
      return p.slice(0, -1)
    })
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0 || !data) return f
      const next = f[0]
      setPast((p) => [...p, data].slice(-50))
      isUndoRedo.current = true
      setDataRaw(next)
      return f.slice(1)
    })
  }

  useEffect(() => {
    loadData().then((loaded) => {
      // Reconcile ad spend + startup costs → transactions for all business workspaces on startup
      let reconciled = loaded
      for (const [wsId, ws] of Object.entries(loaded.workspaces)) {
        if (ws.kind === 'business') {
          let updated = ws
          if ((ws.adSpendEntries ?? []).length > 0) updated = reconcileAdSpendTransactions(updated)
          if ((ws.startupCosts ?? []).length > 0) updated = reconcileStartupCostTransactions(updated)
          if (updated !== ws) reconciled = { ...reconciled, workspaces: { ...reconciled.workspaces, [wsId]: updated } }
        }
      }
      setDataRaw(reconciled)
      const ws = activeWorkspace(reconciled)
      const ids = sortedMonthIds(ws.months)
      const cur = currentMonthId()
      if (ids.includes(cur)) setView({ type: 'month', id: cur })
      else if (ids.length) setView({ type: 'month', id: ids[ids.length - 1] })
      else setView({ type: 'overview' })
    })
  }, [])

  // Debounced persistence: rapid-fire edits (typing) only hit localStorage +
  // the API once things settle, instead of a full serialize + PUT per keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unsavedData = useRef<AppData | null>(null)

  useEffect(() => {
    function flushSave() {
      if (unsavedData.current) {
        // sendBeacon survives the unload; a plain fetch would be cancelled.
        flushDataBeacon(unsavedData.current)
        unsavedData.current = null
      }
    }
    window.addEventListener('pagehide', flushSave)
    window.addEventListener('beforeunload', flushSave)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      window.removeEventListener('beforeunload', flushSave)
    }
  }, [])

  useEffect(() => {
    if (!data) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      prevDataRef.current = data
      return
    }
    unsavedData.current = data
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      if (unsavedData.current) {
        const toSave = unsavedData.current
        unsavedData.current = null
        saveData(toSave).then((ok) => {
          setSaveFailed(!ok)
          if (ok) setLastSaved(new Date())
        })
      }
    }, 600)

    if (isUndoRedo.current) {
      isUndoRedo.current = false
    } else {
      if (!pendingSnapshot.current) pendingSnapshot.current = prevDataRef.current
      setFuture([])
      if (flushTimer.current) clearTimeout(flushTimer.current)
      flushTimer.current = setTimeout(() => {
        if (pendingSnapshot.current) {
          const snapshot = pendingSnapshot.current
          pendingSnapshot.current = null
          setPast((p) => [...p, snapshot].slice(-50))
        }
        flushTimer.current = null
      }, 800)
    }
    prevDataRef.current = data
  }, [data])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  if (!data) {
    return <div className="app-loading">Loading…</div>
  }

  const ws = activeWorkspace(data)

  function addMonth(id: string, copyFromPrev: boolean) {
    if (ws.months[id]) {
      setView({ type: 'month', id })
      return
    }
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const month = emptyMonth(id)
        const priorIds = sortedMonthIds(w.months).filter((m) => m < id)
        const prevId = priorIds[priorIds.length - 1]
        if (copyFromPrev && prevId) {
          const prevMonth = w.months[prevId]
          month.transactions = prevMonth.transactions
            .filter((t) => t.recurring)
            .map((t) => ({ ...t, id: crypto.randomUUID(), date: `${id}-01` }))
        }
        // Snapshot each net worth account's last known balance into this new
        // month so net worth history has a recorded point for every month.
        const netWorthAccounts = w.netWorthAccounts.map((acc) =>
          acc.values[id] !== undefined ? acc : { ...acc, values: { ...acc.values, [id]: accountValueAt(acc, prevId ?? id) } },
        )
        return { ...w, months: { ...w.months, [id]: month }, netWorthAccounts }
      }),
    )
    setView({ type: 'month', id })
  }

  function deleteMonth(id: string) {
    setData((prev) =>
      updateActiveWorkspace(prev, (w) => {
        const months = { ...w.months }
        delete months[id]
        return { ...w, months }
      }),
    )
    setView({ type: 'overview' })
  }

  function setWorkspace(workspace: string) {
    setData((prev) => ({ ...prev, activeWorkspace: workspace }))
    const newWs = data!.workspaces[workspace]
    const ids = sortedMonthIds(newWs.months)
    const cur = currentMonthId()
    if (ids.includes(cur)) setView({ type: 'month', id: cur })
    else if (ids.length) setView({ type: 'month', id: ids[ids.length - 1] })
    else setView({ type: 'overview' })
  }

  // Net Worth is personal-only, Invoices is business-only — fall back to Overview
  // if the current view doesn't make sense for the active workspace.
  const view: View =
    (rawView.type === 'networth' && ws.kind !== 'personal') ||
    (rawView.type === 'invoices' && ws.kind !== 'business') ||
    (rawView.type === 'adspend' && ws.kind !== 'business') ||
    (rawView.type === 'influencers' && ws.kind !== 'business') ||
    (rawView.type === 'retail' && ws.kind !== 'business') ||
    (rawView.type === 'funding' && ws.kind !== 'business') ||
    (rawView.type === 'model' && ws.kind !== 'business') ||
    (rawView.type === 'inventory' && ws.kind !== 'business') ||
    (rawView.type === 'startup' && ws.kind !== 'business') ||
    (rawView.type === 'tools' && ws.kind !== 'business') ||
    (rawView.type === 'contracts' && ws.kind !== 'business')
      ? { type: 'overview' }
      : rawView

  function addBusiness(name: string) {
    const { data: next, id } = addBusinessWorkspace(data!, name)
    setData({ ...next, activeWorkspace: id })
    setView({ type: 'overview' })
  }

  function deleteWorkspace(id: string) {
    setData((prev) => removeWorkspace(prev, id))
    if (data!.activeWorkspace === id) setView({ type: 'overview' })
  }

  function renameWs(id: string, name: string) {
    setData((prev) => renameWorkspace(prev, id, name))
  }

  function reorderWs(newOrder: string[]) {
    setData((prev) => reorderWorkspaces(prev, newOrder))
  }

  function setWsIcon(id: string, icon: string) {
    setData((prev) => setWorkspaceIcon(prev, id, icon))
  }

  function setWsHidden(id: string, hidden: boolean) {
    setData((prev) => setWorkspaceHidden(prev, id, hidden))
  }

  return (
    <div className="app">
      <Sidebar
        data={data}
        ws={ws}
        view={view}
        setView={setView}
        onAddMonth={addMonth}
        onOpenSettings={() => setSettingsOpen(true)}
        onSetWorkspace={setWorkspace}
        onAddBusiness={addBusiness}
        onRemoveWorkspace={deleteWorkspace}
        onRenameWorkspace={renameWs}
        onReorderWorkspaces={reorderWs}
        onSetWorkspaceIcon={setWsIcon}
        onSetWorkspaceHidden={setWsHidden}
        lastSaved={lastSaved}
        saveFailed={saveFailed}
      />
      <div className="main-area">
        <Topbar
          data={data}
          setData={setData}
          view={view}
          onUndo={undo}
          onRedo={redo}
          canUndo={past.length > 0 || pendingSnapshot.current !== null}
          canRedo={future.length > 0}
        />
        <div className="main">
          {view.type === 'overview' && <OverviewPage data={data} ws={ws} setData={setData} setView={setView} onAddMonth={addMonth} />}
          {view.type === 'month' && ws.months[view.id] && (
            <MonthPage
              key={view.id}
              data={data}
              ws={ws}
              setData={setData}
              monthId={view.id}
              onDeleteMonth={deleteMonth}
              onNavigateMonth={(id) => setView({ type: 'month', id })}
            />
          )}
          {view.type === 'networth' && <NetWorthPage data={data} ws={ws} setData={setData} />}
          {view.type === 'subscriptions' && <SubscriptionsPage data={data} ws={ws} setData={setData} />}
          {view.type === 'budget' && <BudgetPage data={data} ws={ws} setData={setData} />}
          {view.type === 'invoices' && <InvoicesPage data={data} ws={ws} setData={setData} />}
          {view.type === 'adspend' && <AdSpendPage data={data} ws={ws} setData={setData} />}
          {view.type === 'influencers' && <InfluencersPage data={data} ws={ws} setData={setData} />}
          {view.type === 'retail' && <RetailPage data={data} ws={ws} setData={setData} />}
          {view.type === 'funding' && <FundingPage data={data} ws={ws} setData={setData} />}
          {view.type === 'model' && <FinancialModelPage data={data} ws={ws} setData={setData} />}
          {view.type === 'inventory' && <InventoryPage data={data} ws={ws} setData={setData} />}
          {view.type === 'startup' && <StartupCostsPage data={data} ws={ws} setData={setData} />}
          {view.type === 'tools' && <BusinessToolsPage data={data} ws={ws} setData={setData} />}
          {view.type === 'contracts' && <ContractsPage data={data} ws={ws} setData={setData} />}
        </div>
      </div>
      {settingsOpen && <SettingsModal data={data} setData={setData} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

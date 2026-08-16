import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, 'data.sqlite'))

db.exec(`
  CREATE TABLE IF NOT EXISTS app_data (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

const app = express()
app.use(cors())
app.use(express.json({ limit: '200mb' }))

// Serve the production build (dist/) so the app runs without the Vite dev server.
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

app.get('/api/data', (req, res) => {
  const row = db.prepare('SELECT data FROM app_data WHERE id = 1').get()
  if (!row) return res.json(null)
  res.json(JSON.parse(row.data))
})

// Persist app data, but only if it actually looks like app data — this prevents a
// malformed or stray request from clobbering the whole database.
function writeAppData(body) {
  if (!body || typeof body !== 'object' || !body.workspaces || !body.workspaces.personal) {
    return false
  }
  const json = JSON.stringify(body)
  db.prepare(
    `INSERT INTO app_data (id, data, updated_at) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(json)
  return true
}

app.put('/api/data', (req, res) => {
  if (!writeAppData(req.body)) return res.status(400).json({ error: 'invalid app data' })
  res.json({ ok: true })
})

// POST accepts the same payload — used by navigator.sendBeacon on tab close (beacons are POST-only).
app.post('/api/data', (req, res) => {
  if (!writeAppData(req.body)) return res.status(400).json({ error: 'invalid app data' })
  res.json({ ok: true })
})

app.post('/api/sync/meta', async (req, res) => {
  const { accessToken, adAccountIds: rawIds, adAccountId: legacyId, datePreset = 'this_month', workspaceId = 'business' } = req.body
  // Support both old single-account and new multi-account format
  const adAccountIds = rawIds?.length ? rawIds : legacyId ? [legacyId] : []
  if (!accessToken || adAccountIds.length === 0) {
    return res.status(400).json({ error: 'accessToken and at least one adAccountId are required' })
  }

  try {
    // Fetch insights + statuses from all accounts, merge results
    const allInsights = []
    const statusById = new Map()

    for (const adAccountId of adAccountIds) {
      // Fetch campaign-level insights broken down by month
      const insightsUrl =
        `https://graph.facebook.com/v21.0/act_${adAccountId}/insights` +
        `?level=campaign&fields=campaign_id,campaign_name,spend,clicks,impressions,date_start` +
        `&date_preset=${datePreset}&time_increment=monthly&limit=500&access_token=${encodeURIComponent(accessToken)}`
      const insightsJson = await fetch(insightsUrl).then((r) => r.json())
      if (insightsJson.error) return res.status(400).json({ error: `Account ${adAccountId}: ${insightsJson.error.message}` })
      allInsights.push(...(insightsJson.data ?? []))

      // Fetch campaign statuses
      const statusUrl =
        `https://graph.facebook.com/v21.0/act_${adAccountId}/campaigns` +
        `?fields=id,name,status&limit=100&access_token=${encodeURIComponent(accessToken)}`
      const statusJson = await fetch(statusUrl).then((r) => r.json())
      for (const c of statusJson.data ?? []) {
        statusById.set(c.id, (c.status ?? 'ACTIVE').toLowerCase())
      }
    }

    const insights = allInsights
    const row = db.prepare('SELECT data FROM app_data WHERE id = 1').get()
    if (!row) return res.status(404).json({ error: 'No app data found' })
    const appData = JSON.parse(row.data)

    const ws = appData.workspaces[workspaceId]
    if (!ws) return res.status(404).json({ error: `Workspace "${workspaceId}" not found` })

    const campaigns = [...(ws.adCampaigns ?? [])]
    const entries = [...(ws.adSpendEntries ?? [])]

    for (const insight of insights) {
      const spend = parseFloat(insight.spend) || 0
      const clicks = parseInt(insight.clicks) || 0
      // Use the actual month from the insight row (time_increment=monthly gives date_start per row)
      const entryDate = insight.date_start ?? new Date().toISOString().slice(0, 10)

      let campaign = campaigns.find((c) => c.name === insight.campaign_name)
      if (!campaign) {
        campaign = { id: randomUUID(), name: insight.campaign_name, platform: 'Meta', status: 'active' }
        campaigns.push(campaign)
      }
      if (statusById.has(insight.campaign_id)) {
        campaign.status = statusById.get(insight.campaign_id)
      }

      const existingIdx = entries.findIndex(
        (e) => e.campaignId === campaign.id && e.date.slice(0, 7) === entryDate.slice(0, 7)
      )
      const updated = {
        id: existingIdx >= 0 ? entries[existingIdx].id : randomUUID(),
        campaignId: campaign.id,
        date: entryDate,
        spend,
        revenue: existingIdx >= 0 ? entries[existingIdx].revenue : 0,
        conversions: existingIdx >= 0 ? entries[existingIdx].conversions : 0,
        clicks,
      }

      if (existingIdx >= 0) entries[existingIdx] = updated
      else entries.push(updated)
    }

    // Reconcile adSpendEntries → expense transactions in months
    const campaignMap = new Map(campaigns.map((c) => [c.id, c]))
    const adCat = (ws.categories ?? []).find((c) =>
      c.type === 'expense' && (
        c.name.toLowerCase().includes('market') ||
        c.name.toLowerCase().includes('advert') ||
        c.name.toLowerCase().includes('ad')
      )
    ) ?? (ws.categories ?? []).find((c) => c.type === 'expense')
    const cardId = ws.cards?.[0]?.id ?? ''
    const months = { ...ws.months }
    const keepTxIds = new Set()

    for (const entry of entries) {
      if (entry.spend <= 0) continue
      const monthId = entry.date.slice(0, 7)
      const campaign = campaignMap.get(entry.campaignId)
      const tag = `[adspend:${entry.id}]`
      const desc = `Ad Spend: ${campaign?.name ?? 'Campaign'} ${tag}`

      if (!months[monthId]) months[monthId] = { id: monthId, transactions: [] }

      const existing = months[monthId].transactions.find((t) => t.description.includes(tag))
      if (existing) {
        months[monthId].transactions = months[monthId].transactions.map((t) =>
          t.id === existing.id ? { ...t, amount: entry.spend, description: desc, date: entry.date } : t
        )
        keepTxIds.add(existing.id)
      } else {
        const newTx = {
          id: randomUUID(),
          date: entry.date,
          description: desc,
          amount: entry.spend,
          type: 'expense',
          categoryId: adCat?.id ?? '',
          cardId,
        }
        months[monthId].transactions.push(newTx)
        keepTxIds.add(newTx.id)
      }
    }

    // Remove stale adspend transactions
    for (const monthId of Object.keys(months)) {
      months[monthId].transactions = months[monthId].transactions.filter(
        (t) => !t.description.includes('[adspend:') || keepTxIds.has(t.id)
      )
    }

    appData.workspaces[workspaceId] = { ...ws, adCampaigns: campaigns, adSpendEntries: entries, months }
    const json = JSON.stringify(appData)
    db.prepare(
      `INSERT INTO app_data (id, data, updated_at) VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).run(json)

    res.json({ ok: true, synced: insights.length, accounts: adAccountIds.length })
  } catch (err) {
    console.error('Meta sync error:', err)
    res.status(500).json({ error: String(err) })
  }
})

// Fixed conversion rates to EUR for non-EUR Stripe charges (workspace amounts are always stored in EUR).
const FX_TO_EUR = { eur: 1, aed: 1 / 3.984, usd: 0.92, gbp: 1.17 }

async function syncStripeForWorkspace(apiKey, workspaceId, { createMissingMonths = true, sinceDays } = {}) {
  // Fetch succeeded charges with pagination (up to 500), optionally limited to the last N days
  const allCharges = []
  const createdGte = sinceDays ? Math.floor(Date.now() / 1000) - sinceDays * 86400 : null
  let url = `https://api.stripe.com/v1/charges?limit=100&expand[]=data.customer&expand[]=data.payment_intent${createdGte ? `&created[gte]=${createdGte}` : ''}`
  for (let page = 0; page < 5; page++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
    const stripeData = await response.json()
    if (stripeData.error) throw new Error(stripeData.error.message)
    const batch = (stripeData.data ?? []).filter((c) => c.status === 'succeeded' && !c.refunded)
    allCharges.push(...batch)
    if (!stripeData.has_more) break
    const lastId = stripeData.data[stripeData.data.length - 1]?.id
    if (!lastId) break
    url = `https://api.stripe.com/v1/charges?limit=100&expand[]=data.customer&expand[]=data.payment_intent&starting_after=${lastId}${createdGte ? `&created[gte]=${createdGte}` : ''}`
  }
  const charges = allCharges

  // For charges made via Checkout Session, look up what was actually purchased (product/plan name).
  const sessionProductCache = new Map()
  async function productNameForCharge(charge) {
    const sessionId = charge.payment_intent?.payment_details?.order_reference
    if (!sessionId || !sessionId.startsWith('cs_')) return null
    if (sessionProductCache.has(sessionId)) return sessionProductCache.get(sessionId)
    try {
      const res = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?expand[]=data.price.product`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
      )
      const json = await res.json()
      const names = (json.data ?? [])
        .map((item) => (typeof item.price?.product === 'object' ? item.price.product.name : item.description))
        .filter(Boolean)
      const name = names.join(', ') || null
      sessionProductCache.set(sessionId, name)
      return name
    } catch {
      sessionProductCache.set(sessionId, null)
      return null
    }
  }

  const row = db.prepare('SELECT data FROM app_data WHERE id = 1').get()
  if (!row) throw new Error('No app data found')
  const appData = JSON.parse(row.data)
  const ws = appData.workspaces[workspaceId]
  if (!ws) throw new Error(`Workspace "${workspaceId}" not found`)

  const incomeCat = ws.categories.find((c) => c.type === 'income')
  const defaultCardId = ws.cards[0]?.id ?? ''
  const months = { ...ws.months }
  let imported = 0

  for (const charge of charges) {
    const date = new Date(charge.created * 1000)
    const monthId = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const dateStr = date.toISOString().slice(0, 10)
    const rate = FX_TO_EUR[charge.currency] ?? 1
    const amount = Math.round((charge.amount / 100) * rate * 100) / 100
    const chargeRef = `stripe:${charge.id}`
    // Build a useful description: which product/plan was purchased, by whom.
    const customerName = charge.billing_details?.name || charge.customer?.name || charge.customer?.email || charge.billing_details?.email || ''
    const productName = await productNameForCharge(charge)
    const genericDesc = !charge.description || charge.description === 'Subscription update' || charge.description === 'Subscription creation'
    const rawDesc = productName
      ? (customerName ? `${productName} — ${customerName}` : productName)
      : genericDesc
        ? (customerName || charge.id)
        : charge.description
    const fullDesc = `${rawDesc} (${chargeRef})`

    if (!months[monthId]) {
      if (!createMissingMonths) continue
      months[monthId] = { id: monthId, transactions: [] }
    }

    // Dedup by Stripe charge ID
    const exists = months[monthId].transactions.some((t) => t.description.includes(chargeRef))
    if (exists) continue

    months[monthId].transactions.push({
      id: randomUUID(),
      date: dateStr,
      description: fullDesc,
      amount,
      type: 'income',
      categoryId: incomeCat?.id ?? '',
      cardId: defaultCardId,
    })
    imported++
  }

  appData.workspaces[workspaceId] = { ...ws, months }
  db.prepare(
    `INSERT INTO app_data (id, data, updated_at) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(JSON.stringify(appData))

  return { imported, total: charges.length }
}

app.post('/api/sync/stripe', async (req, res) => {
  const { apiKey, workspaceId = 'business', createMissingMonths = true, sinceDays } = req.body
  if (!apiKey) return res.status(400).json({ error: 'Stripe API key required' })

  try {
    const result = await syncStripeForWorkspace(apiKey, workspaceId, { createMissingMonths, sinceDays })
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('Stripe sync error:', err)
    res.status(500).json({ error: String(err.message ?? err) })
  }
})

// Automatically pull fresh Stripe data every 15 minutes for any business workspace
// that has a saved API key, so income stays current without a manual "Sync Stripe" click.
const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000
async function autoSyncAllStripeWorkspaces() {
  try {
    const row = db.prepare('SELECT data FROM app_data WHERE id = 1').get()
    if (!row) return
    const appData = JSON.parse(row.data)
    for (const [workspaceId, ws] of Object.entries(appData.workspaces ?? {})) {
      const apiKey = ws.stripeConfig?.apiKey
      if (ws.kind !== 'business' || !apiKey) continue
      try {
        const result = await syncStripeForWorkspace(apiKey, workspaceId, { sinceDays: 3 })
        if (result.imported > 0) console.log(`Auto-synced Stripe for "${workspaceId}": ${result.imported} new`)
      } catch (err) {
        console.error(`Auto Stripe sync failed for "${workspaceId}":`, err.message ?? err)
      }
    }
  } catch (err) {
    console.error('Auto Stripe sync error:', err)
  }
}
setInterval(autoSyncAllStripeWorkspaces, AUTO_SYNC_INTERVAL_MS)
autoSyncAllStripeWorkspaces()

// SPA fallback: any non-API GET serves the app shell.
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(distDir, 'index.html'))
  }
  next()
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Finance tracker API running on http://localhost:${PORT}`)
})

import type { WorkspaceData } from './types'

/** Keep every campaign metric and spend-log row on the same month/account scope. */
export function adReportingWorkspace(ws: WorkspaceData, month: string, accountId: string): WorkspaceData {
  const campaigns = (ws.adCampaigns ?? []).filter((c) => accountId === 'all' || (c.accountId ?? '__none__') === accountId)
  const ids = new Set(campaigns.map((c) => c.id))
  return {
    ...ws,
    adCampaigns: campaigns,
    adSpendEntries: (ws.adSpendEntries ?? []).filter((e) =>
      (month === 'all' || e.date.slice(0, 7) === month) && (accountId === 'all' || ids.has(e.campaignId))),
  }
}

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

export interface UpstreamQuotaItem {
  id: number
  name: string
  type: number
  base_url: string
  status: number
  response_time: number
  test_time: number
  used_quota: number
  balance: number
  upstream: Record<string, unknown> | null
  note: string
}

export type UpstreamQuotaItemMap = Record<string, unknown>

export async function getUpstreamQuotaMonitor(): Promise<UpstreamQuotaItem[]> {
  const res = await api.get('/api/user/quota_monitor')
  return requireServerSuccess(res.data as { data: UpstreamQuotaItem[] }).data
}

import { formatCurrencyUSD } from '@/lib/format'

export interface UpstreamQuotaWindow {
  unit: number
  number: number
  total: number
  remaining: number
  percentage: number
  next_reset_time: number
}

// 把后端探测到的上游额度信息压成一行可读摘要。
// 独立成模块是为了单测：不同 kind 的展示契约在这里固定下来。
export function summarizeUpstreamQuota(upstream: Record<string, unknown> | null): {
  parts: string[]
  modelCount: number | null
  planLevel: string | null
  windows: UpstreamQuotaWindow[]
} {
  if (!upstream) {
    return { parts: [], modelCount: null, planLevel: null, windows: [] }
  }
  if (upstream.kind === 'zhipu_coding_plan') {
    const count = typeof upstream.plan_models === 'number' ? upstream.plan_models : 0
    const rawWindows = Array.isArray(upstream.windows) ? upstream.windows : []
    const windows = rawWindows.filter(
      (w): w is UpstreamQuotaWindow =>
        typeof w === 'object' &&
        w !== null &&
        typeof (w as UpstreamQuotaWindow).remaining === 'number'
    )
    const planLevel =
      typeof upstream.plan_level === 'string' ? upstream.plan_level : null
    return { parts: [String(count)], modelCount: count, planLevel, windows }
  }
  if (upstream.kind === 'openai_billing') {
    const parts: string[] = []
    if (typeof upstream.hard_limit_usd === 'number') {
      parts.push(formatCurrencyUSD(upstream.hard_limit_usd))
    }
    if (typeof upstream.month_used_usd === 'number') {
      parts.push(formatCurrencyUSD(upstream.month_used_usd))
    }
    return { parts, modelCount: null, planLevel: null, windows: [] }
  }
  return { parts: [], modelCount: null, planLevel: null, windows: [] }
}

import { formatCurrencyUSD } from '@/lib/format'

// 把后端探测到的上游额度信息压成一行可读摘要。
// 独立成模块是为了单测：不同 kind 的展示契约在这里固定下来。
export function summarizeUpstreamQuota(upstream: Record<string, unknown> | null): {
  parts: string[]
  modelCount: number | null
} {
  if (!upstream) {
    return { parts: [], modelCount: null }
  }
  if (upstream.kind === 'zhipu_coding_plan') {
    const count = typeof upstream.plan_models === 'number' ? upstream.plan_models : 0
    return { parts: [String(count)], modelCount: count }
  }
  if (upstream.kind === 'openai_billing') {
    const parts: string[] = []
    if (typeof upstream.hard_limit_usd === 'number') {
      parts.push(formatCurrencyUSD(upstream.hard_limit_usd))
    }
    if (typeof upstream.month_used_usd === 'number') {
      parts.push(formatCurrencyUSD(upstream.month_used_usd))
    }
    return { parts, modelCount: null }
  }
  return { parts: [], modelCount: null }
}

import { describe, expect, it } from 'vitest'

import { summarizeUpstreamQuota } from '../summary'

describe('summarizeUpstreamQuota', () => {
  it('returns empty parts when upstream is null', () => {
    const result = summarizeUpstreamQuota(null)
    expect(result.parts).toEqual([])
    expect(result.modelCount).toBeNull()
  })

  it('summarizes zhipu coding plan with model count', () => {
    const result = summarizeUpstreamQuota({
      kind: 'zhipu_coding_plan',
      plan_models: 11,
      model_list: ['glm-5.3', 'glm-5.2'],
    })
    expect(result.parts).toEqual(['11'])
    expect(result.modelCount).toBe(11)
  })

  it('treats non-numeric plan_models as zero models', () => {
    const result = summarizeUpstreamQuota({
      kind: 'zhipu_coding_plan',
      plan_models: 'many',
    })
    expect(result.modelCount).toBe(0)
  })

  it('exposes dual quota windows and plan level for zhipu coding plan', () => {
    const result = summarizeUpstreamQuota({
      kind: 'zhipu_coding_plan',
      plan_models: 11,
      plan_level: 'pro',
      windows: [
        { unit: 3, number: 5, total: 12000, remaining: 11986, percentage: 1, next_reset_time: 1792083155776 },
        { unit: 6, number: 1, total: 60000, remaining: 59986, percentage: 1, next_reset_time: 1792667529969 },
      ],
    })
    expect(result.windows).toHaveLength(2)
    expect(result.windows[0]).toMatchObject({ remaining: 11986, total: 12000, percentage: 1 })
    expect(result.planLevel).toBe('pro')
  })

  it('drops malformed windows and keeps valid ones', () => {
    const result = summarizeUpstreamQuota({
      kind: 'zhipu_coding_plan',
      windows: [
        { unit: 3, number: 5, total: 12000, remaining: 100, percentage: 1 },
        'garbage',
        null,
      ],
    })
    expect(result.windows).toHaveLength(1)
    expect(result.windows[0].remaining).toBe(100)
  })

  it('returns no windows for zhipu plan without windows field', () => {
    const result = summarizeUpstreamQuota({
      kind: 'zhipu_coding_plan',
      plan_models: 11,
    })
    expect(result.windows).toEqual([])
    expect(result.planLevel).toBeNull()
  })

  it('summarizes openai billing with limit and monthly usage', () => {
    const result = summarizeUpstreamQuota({
      kind: 'openai_billing',
      hard_limit_usd: 100,
      month_used_usd: 2.5,
    })
    expect(result.parts).toHaveLength(2)
    expect(result.modelCount).toBeNull()
  })

  it('omits monthly usage when the upstream does not report it', () => {
    const result = summarizeUpstreamQuota({
      kind: 'openai_billing',
      hard_limit_usd: 100,
    })
    expect(result.parts).toHaveLength(1)
  })

  it('returns empty parts for an unknown kind', () => {
    const result = summarizeUpstreamQuota({ kind: 'something_else' })
    expect(result.parts).toEqual([])
    expect(result.modelCount).toBeNull()
  })
})

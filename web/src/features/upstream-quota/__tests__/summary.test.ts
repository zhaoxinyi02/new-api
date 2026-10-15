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

import { describe, expect, it } from 'vitest'
import { createMissionTestPlan, missionTestAlignment } from './missionTesting'
import type { MetricComparison, PlanetaryLocation } from './model'

const fieldSite: PlanetaryLocation = {
  id: 'haughton',
  name: 'Haughton Impact Crater',
  body: 'Earth',
  latitude: 75.37,
  longitude: -89.68,
  region: 'Devon Island',
  terrainClass: 'Arctic impact structure',
  description: 'A polar-desert impact crater.',
}

function comparison(key: MetricComparison['key'], similarity: number | null, comparable = true): MetricComparison {
  return {
    key,
    referenceValue: 1,
    targetValue: 2,
    difference: 1,
    similarity,
    unit: '',
    comparable,
  }
}

describe('mission test planning', () => {
  it('creates location-specific field options even when terrain scores are unavailable', () => {
    const plan = createMissionTestPlan(fieldSite, [])

    expect(plan.some((test) => test.title === 'Rock, lava, or impact-material mapping')).toBe(true)
    expect(plan.some((test) => test.title === 'Ice and permafrost sampling protocol')).toBe(true)
    expect(plan.some((test) => test.title === 'Instrument and operations rehearsal')).toBe(true)
    expect(plan.every((test) => missionTestAlignment(test) === null)).toBe(true)
  })

  it('averages only available metrics and preserves a valid zero-percent match', () => {
    const plan = createMissionTestPlan(fieldSite, [
      comparison('slope', 0),
      comparison('localRelief', null, false),
      comparison('roughness', 40),
    ])
    const routePlanning = plan.find((test) => test.id === 'traverse-planning')
    const terrainMapping = plan.find((test) => test.id === 'terrain-mapping')

    expect(routePlanning?.scoredMetrics).toHaveLength(1)
    expect(missionTestAlignment(routePlanning!)).toBe(0)
    expect(terrainMapping?.scoredMetrics).toHaveLength(2)
    expect(missionTestAlignment(terrainMapping!)).toBe(20)
  })
})

import { describe, expect, it } from 'vitest'
import {
  boundedSimilarity,
  calculateOverallSimilarity,
  calculateTerrainMetrics,
  compareTerrainMetrics,
  isAllZeroElevationWindow,
  symmetricDifferenceSimilarity,
  withholdTerrainScores,
} from './metrics'
import type { TerrainMetrics } from './model'
import { buildComparisonCsv } from './report'

describe('terrain metric derivation', () => {
  it('flags only complete all-zero windows for data-quality review', () => {
    expect(isAllZeroElevationWindow(Array(9).fill(0))).toBe(true)
    expect(isAllZeroElevationWindow([0, 0, 0, 0, 0, 0, 0, 0, null])).toBe(false)
    expect(isAllZeroElevationWindow([0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe(false)
  })

  it('withholds terrain scores for a flagged zero window without changing missing environment metrics', () => {
    const zeroTerrain = calculateTerrainMetrics(Array(9).fill(0))
    const comparisons = compareTerrainMetrics('Earth', 'Mars', zeroTerrain, zeroTerrain, {
      Earth: [-427, 8612],
      Mars: [-8210, 21241],
    })
    const safeComparisons = withholdTerrainScores(comparisons, ['All DEM cells are zero.'])

    expect(safeComparisons.find((metric) => metric.key === 'slope')?.similarity).toBeNull()
    expect(safeComparisons.find((metric) => metric.key === 'roughness')?.comparable).toBe(false)
    expect(safeComparisons.find((metric) => metric.key === 'pressure')?.similarity).toBeNull()
    expect(calculateOverallSimilarity(safeComparisons)).toBeNull()
  })

  it('derives slope, population roughness, and relief from a 1 km 3×3 sample grid', () => {
    const metrics = calculateTerrainMetrics([
      20, 10, 0,
      30, 20, 10,
      40, 30, 20,
    ])

    expect(metrics.elevationMeters).toBe(20)
    expect(metrics.slopeDegrees).toBeCloseTo(Math.atan(Math.hypot(0.02, 0.02)) * 180 / Math.PI)
    expect(metrics.roughnessMeters).toBeCloseTo(Math.sqrt(400 / 3))
    expect(metrics.localReliefMeters).toBe(40)
    expect(metrics.validSampleCount).toBe(9)
  })

  it('keeps unavailable values missing when the sample grid contains NoData', () => {
    const metrics = calculateTerrainMetrics([null, null, null, 2, null, 4, null, 6, null])

    expect(metrics.elevationMeters).toBeNull()
    expect(metrics.slopeDegrees).toBeNull()
    expect(metrics.roughnessMeters).toBeCloseTo(Math.sqrt(8 / 3))
    expect(metrics.localReliefMeters).toBe(4)
  })

  it('does not infer zero roughness from a single valid cell', () => {
    const metrics = calculateTerrainMetrics([null, null, null, null, 5, null, null, null, null])

    expect(metrics.elevationMeters).toBe(5)
    expect(metrics.roughnessMeters).toBeNull()
    expect(metrics.localReliefMeters).toBeNull()
  })

  it('accepts valid negative elevation without treating it as missing', () => {
    expect(calculateTerrainMetrics([-3, -3, -3, -3, -5, -3, -3, -3, -3]).elevationMeters).toBe(-5)
  })

  it('rejects invalid sample windows and spacing', () => {
    expect(() => calculateTerrainMetrics([1, 2, 3])).toThrow(RangeError)
    expect(() => calculateTerrainMetrics(Array(9).fill(1), 0)).toThrow(RangeError)
  })
})

describe('similarity scoring', () => {
  it('handles equal zero, one zero, negative values, and invalid numbers', () => {
    expect(symmetricDifferenceSimilarity(0, 0)).toBe(100)
    expect(symmetricDifferenceSimilarity(0, 10)).toBe(0)
    expect(symmetricDifferenceSimilarity(-10, -5)).toBe(50)
    expect(symmetricDifferenceSimilarity(Number.NaN, 1)).toBeNull()
  })

  it('scores bounded parameters against their defined physical range', () => {
    expect(boundedSimilarity(30, 60, 0, 90)).toBeCloseTo(66.6667, 3)
    expect(boundedSimilarity(-1, 20, 0, 90)).toBeNull()
  })

  it('does not score elevation across planetary datums or invent unavailable parameters', () => {
    const metrics: TerrainMetrics = {
      elevationMeters: 100,
      slopeDegrees: 10,
      roughnessMeters: 3,
      localReliefMeters: 8,
      validSampleCount: 9,
    }
    const comparisons = compareTerrainMetrics('Earth', 'Mars', metrics, metrics, {
      Earth: [-427, 8612],
      Mars: [-8210, 21241],
    })

    expect(comparisons.find((metric) => metric.key === 'elevation')?.similarity).toBeNull()
    expect(comparisons.find((metric) => metric.key === 'slope')?.similarity).toBe(100)
    expect(comparisons.find((metric) => metric.key === 'albedo')?.similarity).toBeNull()
    expect(calculateOverallSimilarity(comparisons)).toBe(100)
  })

  it('returns no overall score when there are no comparable measurements', () => {
    expect(calculateOverallSimilarity([])).toBeNull()
  })

  it('scores same-body elevation and averages only the valid comparable terrain metrics', () => {
    const reference: TerrainMetrics = {
      elevationMeters: 0,
      slopeDegrees: 0,
      roughnessMeters: 2,
      localReliefMeters: 8,
      validSampleCount: 9,
    }
    const target: TerrainMetrics = {
      elevationMeters: 100,
      slopeDegrees: 90,
      roughnessMeters: 4,
      localReliefMeters: 8,
      validSampleCount: 9,
    }
    const comparisons = compareTerrainMetrics('Earth', 'Earth', reference, target, { Earth: [0, 100] })

    expect(comparisons.find((metric) => metric.key === 'elevation')?.similarity).toBe(0)
    expect(calculateOverallSimilarity(comparisons)).toBe(37.5)
  })

  it('supports all six directional cross-body paths without scoring cross-datum elevation', () => {
    const terrain: TerrainMetrics = {
      elevationMeters: 100,
      slopeDegrees: 12,
      roughnessMeters: 4,
      localReliefMeters: 15,
      validSampleCount: 9,
    }
    const bodies = ['Earth', 'Moon', 'Mars'] as const
    const directions = bodies.flatMap((reference) => bodies
      .filter((target) => target !== reference)
      .map((target) => [reference, target] as const))

    for (const [referenceBody, targetBody] of directions) {
      const comparisons = compareTerrainMetrics(referenceBody, targetBody, terrain, terrain, {
        Earth: [-427, 8612],
        Moon: [-9128, 10784],
        Mars: [-8210, 21241],
      })
      expect(comparisons.find((metric) => metric.key === 'elevation')?.similarity).toBeNull()
      expect(comparisons.find((metric) => metric.key === 'slope')?.similarity).toBe(100)
      expect(calculateOverallSimilarity(comparisons)).toBe(100)
    }
  })
})

describe('comparison report CSV', () => {
  it('escapes quoted fields and includes unavailable status and the calculation timestamp', () => {
    const csv = buildComparisonCsv({
      reference: {
        id: 'shore',
        name: 'Shore, "north"',
        body: 'Earth',
        latitude: 12.5,
        longitude: -4,
        region: 'Coast',
        terrainClass: 'Shoreline',
        description: '',
      },
      target: {
        id: 'gale',
        name: 'Gale Crater',
        body: 'Mars',
        latitude: -4.5,
        longitude: 137.4,
        region: 'Aeolis',
        terrainClass: 'Crater',
        description: '',
      },
      comparisons: [{
        key: 'elevation',
        referenceValue: 4,
        targetValue: -10,
        difference: null,
        similarity: null,
        unit: 'm',
        comparable: false,
        unavailableReason: 'Different vertical datums',
      }],
      referenceSample: null,
      targetSample: null,
      overall: null,
      generatedAt: new Date('2025-01-02T03:04:05.000Z'),
    })

    expect(csv).toContain('"Shore, ""north"""')
    expect(csv).toContain('"Different vertical datums"')
    expect(csv).toContain('"2025-01-02T03:04:05.000Z"')
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})

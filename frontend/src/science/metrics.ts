import type { MetricComparison, MetricKey, PlanetaryBody, TerrainMetrics } from './model'

export const metricWeights: Record<MetricKey, number> = {
  elevation: 1,
  slope: 1,
  roughness: 1,
  localRelief: 1,
  pressure: 1,
  albedo: 1,
  thermalInertia: 1,
  grainSize: 1,
}

export function isAllZeroElevationWindow(elevations: readonly (number | null)[]): boolean {
  return elevations.length === 9
    && elevations.every((value) => value !== null && Number.isFinite(value) && Math.abs(value) < 1e-6)
}

export function calculateTerrainMetrics(
  elevations: readonly (number | null)[],
  sampleSpacingMeters = 500,
): TerrainMetrics {
  if (elevations.length !== 9) {
    throw new RangeError('Terrain calculation requires a 3×3 elevation sample grid.')
  }
  if (!Number.isFinite(sampleSpacingMeters) || sampleSpacingMeters <= 0) {
    throw new RangeError('Sample spacing must be a positive finite distance.')
  }

  const valid = elevations.filter((value): value is number => value !== null && Number.isFinite(value))
  const center = elevations[4]
  const north = elevations[1]
  const west = elevations[3]
  const east = elevations[5]
  const south = elevations[7]
  const mean = valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null
  const variance = mean === null
    ? null
    : valid.reduce((total, value) => total + (value - mean) ** 2, 0) / valid.length
  const slopeDegrees = north !== null
    && Number.isFinite(north)
    && west !== null
    && Number.isFinite(west)
    && east !== null
    && Number.isFinite(east)
    && south !== null
    && Number.isFinite(south)
    ? Math.atan(Math.hypot(
      (east - west) / (2 * sampleSpacingMeters),
      (south - north) / (2 * sampleSpacingMeters),
    )) * (180 / Math.PI)
    : null

  return {
    elevationMeters: center !== null && Number.isFinite(center) ? center : null,
    slopeDegrees,
    roughnessMeters: valid.length < 2 || variance === null ? null : Math.sqrt(variance),
    localReliefMeters: valid.length < 2
      ? null
      : Math.max(...valid) - Math.min(...valid),
    validSampleCount: valid.length,
  }
}

export function symmetricDifferenceSimilarity(reference: number, target: number): number | null {
  if (!Number.isFinite(reference) || !Number.isFinite(target)) return null
  if (reference === 0 && target === 0) return 100
  const denominator = Math.max(Math.abs(reference), Math.abs(target))
  if (denominator === 0) return 100
  return Math.max(0, 100 * (1 - Math.abs(reference - target) / denominator))
}

export function boundedSimilarity(reference: number, target: number, minimum: number, maximum: number): number | null {
  if (
    !Number.isFinite(reference)
    || !Number.isFinite(target)
    || !Number.isFinite(minimum)
    || !Number.isFinite(maximum)
    || maximum <= minimum
    || reference < minimum
    || reference > maximum
    || target < minimum
    || target > maximum
  ) {
    return null
  }

  return 100 * (1 - Math.abs(reference - target) / (maximum - minimum))
}

export function compareTerrainMetrics(
  referenceBody: PlanetaryBody,
  targetBody: PlanetaryBody,
  reference: TerrainMetrics,
  target: TerrainMetrics,
  sourceElevationRanges: Partial<Record<PlanetaryBody, [number, number]>>,
): MetricComparison[] {
  const rawMetrics: Array<{
    key: MetricKey
    referenceValue: number | null
    targetValue: number | null
    unit: string
    unavailableReason?: string
    score: (a: number, b: number) => number | null
  }> = [
    {
      key: 'elevation',
      referenceValue: reference.elevationMeters,
      targetValue: target.elevationMeters,
      unit: 'm',
      unavailableReason: referenceBody === targetBody
        ? undefined
        : 'Planetary elevation datums differ; raw elevations are shown but not scored across bodies.',
      score: (a, b) => {
        if (referenceBody !== targetBody) return null
        const range = sourceElevationRanges[referenceBody]
        if (!range) return null
        return boundedSimilarity(a, b, range[0], range[1])
      },
    },
    {
      key: 'slope',
      referenceValue: reference.slopeDegrees,
      targetValue: target.slopeDegrees,
      unit: '°',
      score: (a, b) => boundedSimilarity(a, b, 0, 90),
    },
    {
      key: 'roughness',
      referenceValue: reference.roughnessMeters,
      targetValue: target.roughnessMeters,
      unit: 'm',
      score: symmetricDifferenceSimilarity,
    },
    {
      key: 'localRelief',
      referenceValue: reference.localReliefMeters,
      targetValue: target.localReliefMeters,
      unit: 'm',
      score: symmetricDifferenceSimilarity,
    },
    {
      key: 'pressure',
      referenceValue: null,
      targetValue: null,
      unit: 'kPa',
      unavailableReason: referenceBody === 'Moon' || targetBody === 'Moon'
        ? 'The Moon has no comparable conventional atmosphere; surface pressure comparison is not applicable.'
        : 'A comparable, location- and season-specific pressure source is not integrated.',
      score: () => null,
    },
    {
      key: 'albedo',
      referenceValue: null,
      targetValue: null,
      unit: '',
      unavailableReason: 'No wavelength-compatible albedo products are integrated.',
      score: () => null,
    },
    {
      key: 'thermalInertia',
      referenceValue: null,
      targetValue: null,
      unit: 'J m⁻² K⁻¹ s⁻½',
      unavailableReason: 'No method- and season-compatible thermal inertia products are integrated.',
      score: () => null,
    },
    {
      key: 'grainSize',
      referenceValue: null,
      targetValue: null,
      unit: 'mm',
      unavailableReason: 'No comparable in-situ grain-size measurements are integrated.',
      score: () => null,
    },
  ]

  return rawMetrics.map((metric) => {
    const hasValues = metric.referenceValue !== null && metric.targetValue !== null
    const similarity = metric.referenceValue !== null
      && metric.targetValue !== null
      && metric.unavailableReason === undefined
      ? metric.score(metric.referenceValue, metric.targetValue)
      : null
    const comparable = similarity !== null
    return {
      key: metric.key,
      referenceValue: metric.referenceValue,
      targetValue: metric.targetValue,
      difference: metric.referenceValue !== null
        && metric.targetValue !== null
        && metric.unavailableReason === undefined
        ? Math.abs(metric.referenceValue - metric.targetValue)
        : null,
      similarity,
      unit: metric.unit,
      comparable,
      unavailableReason: metric.unavailableReason
        ?? (hasValues
          ? similarity === null ? 'The values are outside the comparison range.' : undefined
          : 'A required measurement is missing.'),
    }
  })
}

export function calculateOverallSimilarity(metrics: readonly MetricComparison[]): number | null {
  const available = metrics.filter(
    (metric): metric is MetricComparison & { similarity: number } =>
      metric.comparable && metric.similarity !== null && metricWeights[metric.key] > 0,
  )
  if (!available.length) return null

  const totalWeight = available.reduce((total, metric) => total + metricWeights[metric.key], 0)
  return available.reduce(
    (total, metric) => total + (metric.similarity as number) * metricWeights[metric.key],
    0,
  ) / totalWeight
}

export function withholdTerrainScores(
  metrics: readonly MetricComparison[],
  qualityWarnings: readonly string[],
): MetricComparison[] {
  if (!qualityWarnings.length) return [...metrics]
  return metrics.map((metric) => {
    if (!['elevation', 'slope', 'roughness', 'localRelief'].includes(metric.key)) return metric
    return {
      ...metric,
      difference: null,
      similarity: null,
      comparable: false,
      unavailableReason: `${qualityWarnings.join(' ')} Terrain scores are withheld until the samples can be verified.`,
    }
  })
}

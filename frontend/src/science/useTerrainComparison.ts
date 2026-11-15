import { useEffect, useMemo, useState } from 'react'
import { calculateOverallSimilarity, compareTerrainMetrics, withholdTerrainScores } from './metrics'
import { sampleTerrain, sourceElevationRanges } from './dataSources'
import type { PlanetaryLocation, TerrainMetrics, TerrainSample } from './model'

export const emptyTerrainMetrics: TerrainMetrics = {
  elevationMeters: null,
  slopeDegrees: null,
  roughnessMeters: null,
  localReliefMeters: null,
  validSampleCount: 0,
}

type SampleState = {
  key: string
  referenceSample: TerrainSample | null
  targetSample: TerrainSample | null
  referenceError: string | null
  targetError: string | null
}

export function useTerrainComparison(reference: PlanetaryLocation, target: PlanetaryLocation) {
  const requestKey = [
    reference.id, reference.body, reference.latitude, reference.longitude,
    target.id, target.body, target.latitude, target.longitude,
  ].join('|')
  const [sampleState, setSampleState] = useState<SampleState | null>(null)
  const loading = sampleState?.key !== requestKey
  const referenceSample = loading ? null : sampleState?.referenceSample ?? null
  const targetSample = loading ? null : sampleState?.targetSample ?? null
  const referenceError = loading ? null : sampleState?.referenceError ?? null
  const targetError = loading ? null : sampleState?.targetError ?? null

  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([
      sampleTerrain(reference.body, reference, controller.signal),
      sampleTerrain(target.body, target, controller.signal),
    ]).then(([referenceResult, targetResult]) => {
      if (controller.signal.aborted) return
      setSampleState({
        key: requestKey,
        referenceSample: referenceResult.status === 'fulfilled' ? referenceResult.value : null,
        targetSample: targetResult.status === 'fulfilled' ? targetResult.value : null,
        referenceError: referenceResult.status === 'rejected'
          ? referenceResult.reason instanceof Error ? referenceResult.reason.message : String(referenceResult.reason)
          : null,
        targetError: targetResult.status === 'rejected'
          ? targetResult.reason instanceof Error ? targetResult.reason.message : String(targetResult.reason)
          : null,
      })
    })
    return () => controller.abort()
  }, [reference, requestKey, target])

  const comparisons = useMemo(() => {
    const calculated = compareTerrainMetrics(
      reference.body,
      target.body,
      referenceSample?.metrics ?? emptyTerrainMetrics,
      targetSample?.metrics ?? emptyTerrainMetrics,
      sourceElevationRanges,
    )
    const warnings = [
      ...((referenceSample?.qualityWarnings ?? []).map((warning) => `${reference.name}: ${warning}`)),
      ...((targetSample?.qualityWarnings ?? []).map((warning) => `${target.name}: ${warning}`)),
    ]
    return withholdTerrainScores(calculated, warnings)
  }, [reference.body, reference.name, referenceSample, target.body, target.name, targetSample])

  const overall = calculateOverallSimilarity(comparisons)
  const availableCount = comparisons.filter((item) => item.comparable && item.similarity !== null).length

  return {
    loading,
    referenceSample,
    targetSample,
    referenceError,
    targetError,
    comparisons,
    overall,
    availableCount,
    unavailableCount: comparisons.length - availableCount,
    requestKey,
  }
}

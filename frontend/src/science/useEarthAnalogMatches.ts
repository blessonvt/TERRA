import { useEffect, useMemo, useState } from 'react'
import { calculateOverallSimilarity, compareTerrainMetrics, withholdTerrainScores } from './metrics'
import { sampleTerrain, sourceElevationRanges } from './dataSources'
import type { PlanetaryLocation } from './model'

export type EarthAnalogMatch = {
  location: PlanetaryLocation
  similarity: number
  comparableMetrics: number
}

export type EarthAnalogMatchState = {
  key: string
  status: 'idle' | 'loading' | 'ready' | 'unavailable'
  matches: EarthAnalogMatch[]
  processed: number
  total: number
  failedCount: number
  error: string | null
}

const emptyState: EarthAnalogMatchState = {
  key: '',
  status: 'idle',
  matches: [],
  processed: 0,
  total: 0,
  failedCount: 0,
  error: null,
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useEarthAnalogMatches(
  target: PlanetaryLocation | null,
  locations: readonly PlanetaryLocation[],
): EarthAnalogMatchState {
  const candidates = useMemo(
    () => locations.filter((location) => location.body === 'Earth'),
    [locations],
  )
  const requestKey = target && target.body !== 'Earth'
    ? [
      target.id,
      target.body,
      target.latitude,
      target.longitude,
      candidates.map((location) => location.id).join(','),
    ].join('|')
    : 'no-planetary-target'
  const [state, setState] = useState<EarthAnalogMatchState>(emptyState)

  useEffect(() => {
    if (!target || target.body === 'Earth') return

    const controller = new AbortController()
    let active = true

    const calculateMatches = async () => {
      try {
        const targetSample = await sampleTerrain(target.body, target, controller.signal)
        const matches: EarthAnalogMatch[] = []
        let nextCandidate = 0
        let processed = 0
        let failedCount = 0

        const sampleCandidate = async () => {
          while (active && !controller.signal.aborted) {
            const candidateIndex = nextCandidate
            nextCandidate += 1
            const candidate = candidates[candidateIndex]
            if (!candidate) return

            try {
              const candidateSample = await sampleTerrain('Earth', candidate, controller.signal)
              const comparisons = compareTerrainMetrics(
                target.body,
                'Earth',
                targetSample.metrics,
                candidateSample.metrics,
                sourceElevationRanges,
              )
              const safeComparisons = withholdTerrainScores(comparisons, [
                ...targetSample.qualityWarnings,
                ...candidateSample.qualityWarnings,
              ])
              const similarity = calculateOverallSimilarity(safeComparisons)
              if (similarity !== null) {
                matches.push({
                  location: candidate,
                  similarity,
                  comparableMetrics: safeComparisons.filter((metric) => metric.comparable).length,
                })
              }
            } catch {
              if (controller.signal.aborted) return
              failedCount += 1
            } finally {
              processed += 1
              if (active && !controller.signal.aborted) {
                setState((current) => current.key === requestKey
                  ? {
                    ...current,
                    matches: [...matches].sort((a, b) => b.similarity - a.similarity),
                    processed,
                    failedCount,
                  }
                  : current)
              }
            }
          }
        }

        await Promise.all(Array.from(
          { length: Math.min(4, candidates.length) },
          () => sampleCandidate(),
        ))
        if (!active || controller.signal.aborted) return
        setState({
          key: requestKey,
          status: 'ready',
          matches: [...matches].sort((a, b) => b.similarity - a.similarity),
          processed,
          total: candidates.length,
          failedCount,
          error: null,
        })
      } catch (error) {
        if (!active || controller.signal.aborted) return
        setState({
          key: requestKey,
          status: 'unavailable',
          matches: [],
          processed: 0,
          total: candidates.length,
          failedCount: 0,
          error: errorText(error),
        })
      }
    }

    void calculateMatches()
    return () => {
      active = false
      controller.abort()
    }
  }, [candidates, requestKey, target])

  if (state.key === requestKey) return state
  if (target && target.body !== 'Earth') {
    return {
      key: requestKey,
      status: 'loading',
      matches: [],
      processed: 0,
      total: candidates.length,
      failedCount: 0,
      error: null,
    }
  }
  return { ...emptyState, key: requestKey }
}

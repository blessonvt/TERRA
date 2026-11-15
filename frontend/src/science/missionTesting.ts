import type { MetricComparison, MetricKey, PlanetaryLocation } from './model'

export type MissionTestPlanItem = {
  id: string
  title: string
  earthExercise: string
  explorationUse: string
  metricKeys: MetricKey[]
  scoredMetrics: Array<{ key: MetricKey; similarity: number }>
}

type TestDefinition = Omit<MissionTestPlanItem, 'scoredMetrics'>

const terrainTestDefinitions: TestDefinition[] = [
  {
    id: 'traverse-planning',
    title: 'Slope-aware traverse planning',
    earthExercise: 'Map candidate walking or rover routes, flag steep cells, and compare route choices with field observations.',
    explorationUse: 'Rehearse DEM-based route ranking and hazard annotation for robotic or crewed traverses.',
    metricKeys: ['slope', 'localRelief'],
  },
  {
    id: 'roughness-survey',
    title: 'Roughness and obstacle-survey workflow',
    earthExercise: 'Compare the sampled roughness and relief with a ground survey of rocks, ledges, and small-scale obstacles.',
    explorationUse: 'Check how map resolution and terrain summaries affect mobility screening; actual wheel or foot safety needs field-scale data.',
    metricKeys: ['roughness', 'localRelief'],
  },
  {
    id: 'terrain-mapping',
    title: 'Terrain mapping and localization workflow',
    earthExercise: 'Practice matching a DEM-derived terrain profile to field maps and documenting where coarse elevation data miss local features.',
    explorationUse: 'Rehearse map-to-ground interpretation and navigation handoffs without treating the Earth site as a physical environment match.',
    metricKeys: ['slope', 'roughness', 'localRelief'],
  },
]

function siteTestDefinitions(location: PlanetaryLocation): TestDefinition[] {
  const context = `${location.terrainClass} ${location.region} ${location.description}`.toLowerCase()
  const tests: TestDefinition[] = []

  if (/\b(dune|aeolian|sand|desert|dust|evaporite|salt|saline|dry|hyperarid)\b/.test(context)) {
    tests.push({
      id: 'dust-and-sediment',
      title: 'Dust, sediment, and abrasion field study',
      earthExercise: 'Measure grain size, dust adhesion, abrasion, and sediment movement at the selected site with field instruments.',
      explorationUse: 'Inform dust-handling, seal, optics, and mobility test design; TERRA has no dust, grain-size, or abrasion measurements.',
      metricKeys: [],
    })
  }
  if (/\b(volcan|basalt|lava|igneous|impact|crater|ejecta)\b/.test(context)) {
    tests.push({
      id: 'rock-and-ejecta-mapping',
      title: 'Rock, lava, or impact-material mapping',
      earthExercise: 'Map rock abundance, block sizes, outcrops, and surface units, then compare them with orbital imagery and the DEM footprint.',
      explorationUse: 'Practice geologic mapping and instrument-target selection; composition and lunar/Martian regolith mechanics remain unmeasured.',
      metricKeys: [],
    })
  }
  if (/\b(ice|glacier|permafrost|cold|polar|snow)\b/.test(context)) {
    tests.push({
      id: 'cryosphere-protocol',
      title: 'Ice and permafrost sampling protocol',
      earthExercise: 'Rehearse clean sampling, thermal logging, and subsurface access procedures where field evidence confirms ice or frozen ground.',
      explorationUse: 'Prepare resource-survey procedures; this terrain comparison does not measure subsurface ice, temperature, or volatile content.',
      metricKeys: [],
    })
  }
  if (/\b(sediment|fluvial|erosion|valley|wadi|basin)\b/.test(context)) {
    tests.push({
      id: 'stratigraphy-and-erosion',
      title: 'Layered sediment and erosion survey',
      earthExercise: 'Document outcrop layers, sediment textures, and erosion forms, and collect samples for independent mineralogical or chemical analysis.',
      explorationUse: 'Rehearse selecting targets for past-water and habitability investigations; TERRA does not detect water, minerals, or biosignatures.',
      metricKeys: [],
    })
  }
  if (tests.length === 0) {
    tests.push({
      id: 'surface-materials',
      title: 'Surface-material reconnaissance',
      earthExercise: 'Ground-truth local rock and regolith types, grain-size distribution, cohesion, and hydration with appropriate instruments.',
      explorationUse: 'Scope a field campaign for material and resource questions; none of those properties are scored by the integrated DEM.',
      metricKeys: [],
    })
  }

  tests.push({
    id: 'operations-rehearsal',
    title: 'Instrument and operations rehearsal',
    earthExercise: 'Practice instrument deployment, sample documentation, team communications, and safe traverse procedures at the site.',
    explorationUse: 'Rehearse workflows and identify operational risks; Earth gravity, atmosphere, temperature, and surface mechanics are not reproduced.',
    metricKeys: [],
  })
  return tests
}

export function createMissionTestPlan(
  location: PlanetaryLocation,
  comparisons: readonly MetricComparison[],
): MissionTestPlanItem[] {
  const definitions = [...terrainTestDefinitions, ...siteTestDefinitions(location)]
  const comparisonsByKey = new Map(comparisons.map((comparison) => [comparison.key, comparison]))

  return definitions.map((definition) => ({
    ...definition,
    scoredMetrics: definition.metricKeys.flatMap((key) => {
      const comparison = comparisonsByKey.get(key)
      return comparison?.comparable && comparison.similarity !== null
        ? [{ key, similarity: comparison.similarity }]
        : []
    }),
  }))
}

export function missionTestAlignment(test: MissionTestPlanItem): number | null {
  if (test.scoredMetrics.length === 0) return null
  return test.scoredMetrics.reduce((total, metric) => total + metric.similarity, 0) / test.scoredMetrics.length
}

import { useState } from 'react'
import { AlertCircle, BarChart3, Database, Download, RefreshCw, Satellite, Scale } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import LocationImages from './LocationImages'
import { downloadComparisonCsv, downloadComparisonPdf } from './science/report'
import { useTerrainComparison, emptyTerrainMetrics } from './science/useTerrainComparison'
import { sourceDefinitions, sourceElevationRanges } from './science/dataSources'
import { createMissionTestPlan, missionTestAlignment } from './science/missionTesting'
import type { MetricKey, PlanetaryBody, PlanetaryLocation, TerrainMetrics, TerrainSample } from './science/model'

type Props = {
  locations: PlanetaryLocation[]
  reference: PlanetaryLocation
  target: PlanetaryLocation
  freeRoamLocation: PlanetaryLocation | null
  onChangeReference: (id: string) => void
  onChangeTarget: (id: string) => void
  onSelectRandomLocation: (side: 'reference' | 'target', body: PlanetaryBody) => boolean
}

const randomLocationOptions: Array<{ value: string; body: PlanetaryBody }> = [
  { value: '__random_earth__', body: 'Earth' },
  { value: '__random_moon__', body: 'Moon' },
  { value: '__random_mars__', body: 'Mars' },
]

const metricDetails: Record<MetricKey, {
  label: string
  category: 'Terrain' | 'Environment'
  description: string
  formula: string
}> = {
  elevation: {
    label: 'Elevation',
    category: 'Terrain',
    description: 'DEM center-cell elevation; cross-body values are displayed but never scored because vertical datums differ.',
    formula: 'Same-body: 100 × (1 − |A − B| / source elevation range). Cross-body: no score.',
  },
  slope: {
    label: 'Slope',
    category: 'Terrain',
    description: 'Central-difference slope in a 1 km window; cross-body values remain sensitive to native DEM resolution.',
    formula: 'p = (zE − zW) / 2d; q = (zS − zN) / 2d; θ = arctan(√(p² + q²)); similarity = 100 × (1 − |A − B| / 90°).',
  },
  roughness: {
    label: 'Local roughness',
    category: 'Terrain',
    description: 'Population standard deviation of valid elevations in the 3×3 sample window.',
    formula: 'R = √(Σ(zᵢ − z̄)² / n); similarity = 100 × (1 − |A − B| / max(|A|, |B|)).',
  },
  localRelief: {
    label: 'Local relief',
    category: 'Terrain',
    description: 'Maximum minus minimum valid elevation in the 1 km sample window.',
    formula: 'LR = zmax − zmin; similarity = 100 × (1 − |A − B| / max(|A|, |B|)).',
  },
  pressure: {
    label: 'Surface pressure',
    category: 'Environment',
    description: 'The Moon has no comparable conventional atmosphere. Earth/Mars pressure is unavailable until a location- and season-matched source is integrated.',
    formula: 'Not calculated: no compatible pressure measurements.',
  },
  albedo: {
    label: 'Albedo',
    category: 'Environment',
    description: 'A wavelength-compatible reflectance product is not integrated.',
    formula: 'Not calculated: no wavelength-compatible measurements.',
  },
  thermalInertia: {
    label: 'Thermal inertia',
    category: 'Environment',
    description: 'A method- and season-compatible thermal inertia product is not integrated.',
    formula: 'Not calculated: no method- and season-compatible measurements.',
  },
  grainSize: {
    label: 'Grain size',
    category: 'Environment',
    description: 'Comparable in-situ grain-size measurements are not integrated.',
    formula: 'Not calculated: no comparable grain-size measurements.',
  },
}

function valueForMetric(metrics: TerrainMetrics, key: MetricKey): number | null {
  switch (key) {
    case 'elevation': return metrics.elevationMeters
    case 'slope': return metrics.slopeDegrees
    case 'roughness': return metrics.roughnessMeters
    case 'localRelief': return metrics.localReliefMeters
    default: return null
  }
}

function metricUnit(key: MetricKey): string {
  return key === 'slope' ? '°' : key === 'elevation' || key === 'roughness' || key === 'localRelief' ? 'm' : ''
}

function sourceForMetric(key: MetricKey, sample: TerrainSample | null): string {
  if (!['elevation', 'slope', 'roughness', 'localRelief'].includes(key)) return 'No compatible source integrated'
  return sample?.source.title ?? 'Source unavailable'
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  return `${value.toFixed(unit === '°' ? 2 : 1)}${unit ? ` ${unit}` : ''}`
}

function normalizeForRadar(key: MetricKey, value: number, body: PlanetaryLocation['body']): number | null {
  if (key === 'slope') return value >= 0 && value <= 90 ? value / 90 : null
  const [minimum, maximum] = sourceElevationRanges[body]
  const span = maximum - minimum
  if (key === 'elevation') return Math.min(1, Math.max(0, (value - minimum) / span))
  if (key === 'roughness') return Math.min(1, Math.max(0, value / (span / 2)))
  if (key === 'localRelief') return Math.min(1, Math.max(0, value / span))
  return null
}

type RadarDimension = {
  label: string
  reference: number | null
  target: number | null
}

function TerrainRadar({
  values,
  referenceName,
  targetName,
}: {
  values: Array<RadarDimension & { reference: number; target: number }>
  referenceName: string
  targetName: string
}) {
  const centerX = 300
  const centerY = 205
  const radius = 135
  const angleFor = (index: number) => (Math.PI * 2 * index / values.length) - Math.PI / 2
  const pointFor = (index: number, value: number, scale = radius) => ({
    x: centerX + Math.cos(angleFor(index)) * scale * value,
    y: centerY + Math.sin(angleFor(index)) * scale * value,
  })
  const pointsAttribute = (series: 'reference' | 'target') => values
    .map((item, index) => {
      const point = pointFor(index, item[series])
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <svg className="terrain-radar" viewBox="0 0 600 410" role="img" aria-label="Normalized terrain profile comparison">
      <title>Normalized terrain profile for {referenceName} and {targetName}</title>
      {[0.25, 0.5, 0.75, 1].map((scale) => (
        <circle key={scale} cx={centerX} cy={centerY} r={radius * scale} fill="none" stroke="rgba(223,234,245,0.16)" />
      ))}
      {values.map((item, index) => {
        const outer = pointFor(index, 1)
        const label = pointFor(index, 1.25, radius)
        return (
          <g key={item.label}>
            <line x1={centerX} y1={centerY} x2={outer.x} y2={outer.y} stroke="rgba(223,234,245,0.2)" />
            <text x={label.x} y={label.y} textAnchor={label.x < centerX - 10 ? 'end' : label.x > centerX + 10 ? 'start' : 'middle'} dominantBaseline="middle">
              {item.label}
            </text>
          </g>
        )
      })}
      <polygon points={pointsAttribute('reference')} fill="rgba(109,169,213,0.2)" stroke="#6da9d5" strokeWidth="2" />
      <polygon points={pointsAttribute('target')} fill="rgba(215,139,87,0.16)" stroke="#d78b57" strokeWidth="2" />
      {values.map((item, index) => {
        const referencePoint = pointFor(index, item.reference)
        const targetPoint = pointFor(index, item.target)
        return (
          <g key={`${item.label}-points`}>
            <circle cx={referencePoint.x} cy={referencePoint.y} r="4" fill="#6da9d5">
              <title>{referenceName} · {item.label}: {(item.reference * 100).toFixed(1)}% normalized</title>
            </circle>
            <circle cx={targetPoint.x} cy={targetPoint.y} r="4" fill="#d78b57">
              <title>{targetName} · {item.label}: {(item.target * 100).toFixed(1)}% normalized</title>
            </circle>
          </g>
        )
      })}
      <g className="terrain-radar-legend">
        <circle cx="185" cy="382" r="5" fill="#6da9d5" />
        <text x="198" y="386">{referenceName}</text>
        <circle cx="385" cy="382" r="5" fill="#d78b57" />
        <text x="398" y="386">{targetName}</text>
      </g>
    </svg>
  )
}

export default function ComparisonPage({
  locations,
  reference,
  target,
  freeRoamLocation,
  onChangeReference,
  onChangeTarget,
  onSelectRandomLocation,
}: Props) {
  const [filter, setFilter] = useState<'All' | 'Terrain' | 'Environment'>('All')
  const [sortAlphabetically, setSortAlphabetically] = useState(true)
  const [selectionMessage, setSelectionMessage] = useState('')
  const [exportMessage, setExportMessage] = useState('')
  const {
    loading,
    referenceSample,
    targetSample,
    referenceError,
    targetError,
    comparisons,
    overall,
    availableCount,
    unavailableCount,
  } = useTerrainComparison(reference, target)
  const visibleComparisons = comparisons
    .filter((item) => filter === 'All' || metricDetails[item.key].category === filter)
    .sort((a, b) => sortAlphabetically
      ? metricDetails[a.key].label.localeCompare(metricDetails[b.key].label)
      : comparisons.indexOf(a) - comparisons.indexOf(b))
  const handleLocationChange = (side: 'reference' | 'target', id: string) => {
    const randomOption = randomLocationOptions.find((option) => option.value === id)
    if (randomOption) {
      const selected = onSelectRandomLocation(side, randomOption.body)
      setSelectionMessage(selected
        ? ''
        : `No sampleable ${randomOption.body} catalog location is currently available.`)
      return
    }
    setSelectionMessage('')
    if (side === 'reference') onChangeReference(id)
    else onChangeTarget(id)
  }
  const radarKeys = comparisons
    .filter((item) => ['elevation', 'slope', 'roughness', 'localRelief'].includes(item.key))
    .filter((item) => {
      const a = valueForMetric(referenceSample?.metrics ?? emptyTerrainMetrics, item.key)
      const b = valueForMetric(targetSample?.metrics ?? emptyTerrainMetrics, item.key)
      return a !== null && b !== null
        && normalizeForRadar(item.key, a, reference.body) !== null
        && normalizeForRadar(item.key, b, target.body) !== null
        && !referenceSample?.qualityWarnings.length
        && !targetSample?.qualityWarnings.length
    })
  const radarDimensions: RadarDimension[] = radarKeys.map((item) => {
    const referenceValue = valueForMetric(referenceSample?.metrics ?? emptyTerrainMetrics, item.key)
    const targetValue = valueForMetric(targetSample?.metrics ?? emptyTerrainMetrics, item.key)
    return {
      label: metricDetails[item.key].label,
      reference: referenceValue === null ? null : normalizeForRadar(item.key, referenceValue, reference.body),
      target: targetValue === null ? null : normalizeForRadar(item.key, targetValue, target.body),
    }
  })
  const chartValues = radarDimensions.filter(
    (item): item is RadarDimension & { reference: number; target: number } =>
      item.reference !== null && item.target !== null,
  )
  const scoredComparisons = comparisons.filter((item) => item.similarity !== null)
  const strongestMatch = [...scoredComparisons].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))[0]
  const largestDifference = [...scoredComparisons].sort((a, b) => (a.similarity ?? 0) - (b.similarity ?? 0))[0]
  const exportData = { reference, target, comparisons, referenceSample, targetSample, overall }
  const selectedEarthAnalog = reference.body === 'Earth'
    ? reference
    : target.body === 'Earth' ? target : null
  const earthLocations = locations.filter((location) => location.body === 'Earth')
  const missionSite = selectedEarthAnalog ?? earthLocations[0] ?? null
  const missionPlan = missionSite
    ? createMissionTestPlan(missionSite, selectedEarthAnalog ? comparisons : [])
    : []
  const missionSiteOptions = selectedEarthAnalog
    ? [selectedEarthAnalog, ...earthLocations.filter((location) => location.id !== selectedEarthAnalog.id)]
    : earthLocations
  const selectMissionSite = (id: string) => {
    if (reference.body === 'Earth') onChangeReference(id)
    else if (target.body === 'Earth') onChangeTarget(id)
    else onChangeReference(id)
  }
  const handleExport = (format: 'csv' | 'pdf') => {
    try {
      if (format === 'csv') downloadComparisonCsv(exportData)
      else downloadComparisonPdf(exportData)
      setExportMessage(`${format.toUpperCase()} report downloaded.`)
    } catch (error) {
      setExportMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <main className="page-shell">
      <section className="overall-score-card" aria-label="Overall terrain similarity" aria-live="polite">
        <div className="overall-score-value">
          <span>Overall similarity</span>
          <strong>{loading ? 'Sampling…' : overall === null ? 'Unavailable' : `${overall.toFixed(1)}%`}</strong>
        </div>
        <div className="overall-score-context">
          <h2>{reference.name} <span>vs</span> {target.name}</h2>
          <p>
            {loading
              ? 'Sampling both selected locations.'
              : overall === null
                ? 'No comparable terrain measurements are available for this pair.'
                : `Calculated from ${availableCount} available comparable terrain measurements. This index is descriptive, not a probability.`}
          </p>
        </div>
      </section>
      <div className="section-header">
        <p className="eyebrow accent">Measured terrain comparison</p>
        <h2>Compare locations across worlds</h2>
        <p>Elevation and terrain descriptors are sampled from public DEM services at the selected coordinates.</p>
        <div className="comparison-export-actions">
          <button type="button" className="btn btn-secondary" disabled={loading || (!referenceSample && !targetSample)} onClick={() => handleExport('csv')}>
            <Download size={16} /> Download CSV
          </button>
          <button type="button" className="btn btn-secondary" disabled={loading || (!referenceSample && !targetSample)} onClick={() => handleExport('pdf')}>
            <Download size={16} /> Download PDF
          </button>
        </div>
        {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
      </div>

      <div className="comparison-layout science-comparison-layout">
        <aside className="filters-card">
          <label>
            Reference location
            <select value={reference.id} onChange={(event) => handleLocationChange('reference', event.target.value)}>
              <optgroup label="Current selection">
                <option value={reference.id}>{freeRoamLocation?.id === reference.id ? 'Free Roam point · ' : ''}{reference.name} · {reference.body}</option>
              </optgroup>
              {freeRoamLocation && freeRoamLocation.id !== reference.id && (
                <optgroup label="Free Roam point">
                  <option value={freeRoamLocation.id}>{freeRoamLocation.name} · {freeRoamLocation.body}</option>
                </optgroup>
              )}
              <optgroup label="Catalog locations">
                {locations
                  .filter((location) => location.id !== reference.id && location.id !== freeRoamLocation?.id)
                  .map((location) => <option key={location.id} value={location.id}>{location.name} · {location.body}</option>)}
              </optgroup>
              <optgroup label="Random sampleable site">
                {randomLocationOptions.map((option) => (
                  <option key={option.value} value={option.value}>Random {option.body} site</option>
                ))}
              </optgroup>
            </select>
          </label>
          <label>
            Target location
            <select value={target.id} onChange={(event) => handleLocationChange('target', event.target.value)}>
              <optgroup label="Current selection">
                <option value={target.id}>{freeRoamLocation?.id === target.id ? 'Free Roam point · ' : ''}{target.name} · {target.body}</option>
              </optgroup>
              {freeRoamLocation && freeRoamLocation.id !== target.id && (
                <optgroup label="Free Roam point">
                  <option value={freeRoamLocation.id}>{freeRoamLocation.name} · {freeRoamLocation.body}</option>
                </optgroup>
              )}
              <optgroup label="Catalog locations">
                {locations
                  .filter((location) => location.id !== target.id && location.id !== freeRoamLocation?.id)
                  .map((location) => <option key={location.id} value={location.id}>{location.name} · {location.body}</option>)}
              </optgroup>
              <optgroup label="Random sampleable site">
                {randomLocationOptions.map((option) => (
                  <option key={option.value} value={option.value}>Random {option.body} site</option>
                ))}
              </optgroup>
            </select>
          </label>
          <div className="free-roam-picker">
            <p>
              {freeRoamLocation
                ? `Latest Free Roam point: ${freeRoamLocation.name} · ${freeRoamLocation.body}. It can be selected as either side above.`
                : 'To compare any map coordinate, pick it in Free Roam; that point will appear in both location selectors.'}
            </p>
            <NavLink to="/free-roam" className="text-link">Pick a custom coordinate in Free Roam <span>→</span></NavLink>
            <small>Random choices use catalog coordinates within DEM coverage and are sampled live. Free Roam map picks use their exact coordinates; unsupported data remain unavailable.</small>
            {selectionMessage && <small role="status">{selectionMessage}</small>}
          </div>
          <div className="comparison-location">
            <strong>{reference.name}</strong>
            <span>{reference.body} · {reference.latitude.toFixed(3)}, {reference.longitude.toFixed(3)}</span>
            <strong>{target.name}</strong>
            <span>{target.body} · {target.latitude.toFixed(3)}, {target.longitude.toFixed(3)}</span>
          </div>
          <div className="comparison-counts">
            <span>{loading ? 'Sampling sources…' : referenceError || targetError ? 'Partial data' : availableCount ? 'Comparison ready' : 'No comparable data'}</span>
            <span>{availableCount} compared · {unavailableCount} unavailable</span>
          </div>
          <p className="comparison-note">
            Only available comparable terrain measurements contribute to the index. Missing values are excluded, never treated as zero.
          </p>
          {(reference.body !== target.body) && (
            <p className="comparison-caution">
              Cross-body terrain scores are resolution-sensitive: source products have different native resolutions and vertical references.
            </p>
          )}
        </aside>

        <section className="chart-card science-chart-card" aria-label="Terrain profile comparison">
          <div className="panel-head">
            <BarChart3 size={18} />
            <h3>Terrain profile</h3>
          </div>
          {loading && <div className="data-state"><RefreshCw className="spin" size={18} /> Sampling public elevation data…</div>}
          {!loading && chartValues.length >= 3 && (
            <>
              <TerrainRadar values={chartValues} referenceName={reference.name} targetName={target.name} />
              <p className="chart-disclaimer">
                Radar values are normalized to each source DEM’s elevation range (slope: 0–90°). They describe within-product scale, not planetary equivalence.
              </p>
            </>
          )}
          {!loading && chartValues.length < 3 && (
            <div className="data-state">
              <Database size={18} />
              <span>A radar profile needs at least three shared, valid terrain measurements. No data are filled in for unavailable sources.</span>
            </div>
          )}
          {!loading && (referenceError || targetError) && (
            <div className="source-errors">
              {referenceError && <p><AlertCircle size={16} /> {reference.body}: {referenceError}</p>}
              {targetError && <p><AlertCircle size={16} /> {target.body}: {targetError}</p>}
            </div>
          )}
        </section>
      </div>

      <section className="quick-insights panel-block">
        <div className="panel-head"><Scale size={18} /><h3>Quick insights</h3></div>
        <p>
          {overall === null
            ? 'A comparable terrain index is unavailable for this selection. Check source coverage and data-quality notes below.'
            : `${reference.name} and ${target.name} have a ${overall.toFixed(1)}% comparable terrain index from ${availableCount} available measurements. This index is descriptive, not a probability or a claim of environmental equivalence.`}
        </p>
        <div className="insight-cards">
          <article>
            <span>Strongest available match</span>
            <strong>{strongestMatch ? `${metricDetails[strongestMatch.key].label} · ${strongestMatch.similarity?.toFixed(1)}%` : 'Unavailable'}</strong>
          </article>
          <article>
            <span>Largest measured difference</span>
            <strong>{largestDifference ? `${metricDetails[largestDifference.key].label} · ${largestDifference.similarity?.toFixed(1)}% similarity` : 'Unavailable'}</strong>
          </article>
          <article>
            <span>Data coverage</span>
            <strong>{loading ? 'Sampling sources…' : `${availableCount} of ${comparisons.length} parameters scored`}</strong>
          </article>
        </div>
      </section>

      {(referenceSample?.qualityWarnings.length || targetSample?.qualityWarnings.length) && (
        <div className="quality-warning" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>Terrain score withheld pending data verification</strong>
            {[...(referenceSample?.qualityWarnings ?? []).map((warning) => `${reference.name}: ${warning}`),
              ...(targetSample?.qualityWarnings ?? []).map((warning) => `${target.name}: ${warning}`)].map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </div>
      )}

      <section className="gravity-reference panel-block">
        <div className="panel-head"><Scale size={18} /><h3>Planetary gravity context</h3></div>
        <p>These are approximate body-level reference values, not measurements at the selected locations, and are not included in the terrain similarity index.</p>
        <div className="gravity-values">
          {[{ body: 'Earth', value: '9.81 m/s²' }, { body: 'Moon', value: '1.62 m/s²' }, { body: 'Mars', value: '3.71 m/s²' }].map((item) => (
            <div key={item.body}><span>{item.body}</span><strong>{item.value}</strong></div>
          ))}
        </div>
        <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noreferrer">NASA planetary fact sheet</a>
      </section>

      <section className="visual-comparison-grid" aria-label="Location imagery">
        <LocationImages location={reference} />
        <LocationImages location={target} />
      </section>
      <p className="imagery-limit-note">
        The surface maps above are centered on each selected coordinate and visibly mark the sample point. NASA archive images are related named-location records, not georeferenced ground photos; TERRA does not have coordinate-matched ground-level imagery for arbitrary sites.
      </p>

      <section className="mission-protocol panel-block">
        <div className="panel-head"><Satellite size={18} /><h3>Mission Testing &amp; Validation Options</h3></div>
        {missionSite && (
          <>
            <label className="mission-site-picker">
              <span>Earth field site</span>
              <select value={missionSite.id} onChange={(event) => selectMissionSite(event.target.value)}>
                {missionSiteOptions.map((location) => (
                  <option key={location.id} value={location.id}>{location.name} · {location.terrainClass}</option>
                ))}
              </select>
            </label>
            <p className="mission-site">
              {selectedEarthAnalog ? 'Field site paired with the current live comparison:' : 'Example field site; select it as an Earth side of the comparison to calculate terrain-alignment scores:'}
              {' '}<strong>{missionSite.name}</strong> · {missionSite.latitude.toFixed(5)}°, {missionSite.longitude.toFixed(5)}° · {missionSite.terrainClass}
            </p>
            <p>
              These are practical candidate field exercises based on the site description and measured terrain. They are test ideas, not claims that a mission task is possible or already validated here.
            </p>
            <div className="mission-test-grid">
              {missionPlan.map((test) => {
                const alignment = missionTestAlignment(test)
                const scoredKeys = new Set(test.scoredMetrics.map((metric) => metric.key))
                const metricLabels = test.scoredMetrics.map((metric) => metricDetails[metric.key].label)
                const missingMetricLabels = test.metricKeys
                  .filter((key) => !scoredKeys.has(key))
                  .map((key) => metricDetails[key].label)
                return (
                  <article className="mission-test-card" key={test.id}>
                    <span className="tile-tag">{test.metricKeys.length ? 'DEM terrain evidence' : 'Field protocol candidate'}</span>
                    <h4>{test.title}</h4>
                    <p><strong>Earth exercise:</strong> {test.earthExercise}</p>
                    <p><strong>Exploration use:</strong> {test.explorationUse}</p>
                    <div className="mission-test-alignment">
                      <strong>{alignment === null ? 'Not scored' : `${alignment.toFixed(1)}% terrain-evidence alignment`}</strong>
                      {test.metricKeys.length > 0
                        ? <small>{test.scoredMetrics.length} of {test.metricKeys.length} relevant DEM metrics available{metricLabels.length ? ` · scored: ${metricLabels.join(', ')}` : ''}{missingMetricLabels.length ? ` · unavailable: ${missingMetricLabels.join(', ')}` : ''}. Mean of available metric similarity scores; missing metrics are excluded.</small>
                        : <small>No integrated measurement directly scores this field activity. Gather the site-specific measurements described above.</small>}
                    </div>
                  </article>
                )
              })}
            </div>
            {missionSite.id === 'atacama' && (
              <p className="mission-reference">
                Published operations-rehearsal example: Woods &amp; Shaw, “Simulating Remote Mars Rover Operations in the Atacama Desert for Future ESA Missions” (2014).{' '}
                <a href="https://doi.org/10.2514/6.2014-1861" target="_blank" rel="noreferrer">Open citation</a>
              </p>
            )}
            <p className="mission-limit">
              Percentages report agreement in the listed DEM-derived terrain metrics only. They are not percentages of activities that can be performed, mission success probabilities, or passability estimates. A low score can still make a site useful as a contrast or control. Temperature, illumination, soil mechanics, mineralogy, water/ice, dust, biology, subsurface features, and instrument performance require separate, site- and season-specific measurements.
            </p>
          </>
        )}
      </section>

      <section className="panel-block metric-panel">
        <div className="panel-head">
          <Scale size={18} />
          <h3>Parameter diagnostics</h3>
        </div>
        <div className="diagnostic-controls">
          <label>
            Show
            <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option>All</option>
              <option>Terrain</option>
              <option>Environment</option>
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => setSortAlphabetically(!sortAlphabetically)}>
            {sortAlphabetically ? 'A–Z order' : 'Source order'}
          </button>
        </div>
        <div className="diagnostic-grid">
          {visibleComparisons.map((item) => (
            <article className="diagnostic-card" key={item.key}>
              <div className="diagnostic-title">
                <span className="tile-tag">{metricDetails[item.key].category}</span>
                <h4>{metricDetails[item.key].label}</h4>
              </div>
              <div className="diagnostic-values">
                <div><small>{reference.body}</small><strong>{formatValue(valueForMetric(referenceSample?.metrics ?? emptyTerrainMetrics, item.key), metricUnit(item.key))}</strong></div>
                <div><small>{target.body}</small><strong>{formatValue(valueForMetric(targetSample?.metrics ?? emptyTerrainMetrics, item.key), metricUnit(item.key))}</strong></div>
              </div>
              {item.similarity === null
                ? <p className="unavailable-label">{loading ? 'Sampling…' : item.unavailableReason}</p>
                : (
                  <>
                    <div className="diagnostic-score"><span>Similarity</span><strong>{item.similarity.toFixed(1)}%</strong></div>
                    <div className="diagnostic-progress" role="meter" aria-label={`${metricDetails[item.key].label} similarity`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.similarity}>
                      <span style={{ width: `${item.similarity}%` }} />
                    </div>
                  </>
                )}
              <div className="diagnostic-difference">
                <span>Absolute difference</span>
                <strong>{item.difference === null ? 'Not comparable' : formatValue(item.difference, metricUnit(item.key))}</strong>
              </div>
              <details className="diagnostic-details">
                <summary>Method, sources &amp; status</summary>
                <p>{metricDetails[item.key].description}</p>
                <p><strong>Formula:</strong> {metricDetails[item.key].formula}</p>
                <p><strong>Reference source:</strong> {sourceForMetric(item.key, referenceSample)}</p>
                <p><strong>Target source:</strong> {sourceForMetric(item.key, targetSample)}</p>
                <p><strong>Status:</strong> {item.similarity === null ? item.unavailableReason ?? 'Not scored; a required measurement is missing or the values are not comparable.' : 'Compared from available measurements.'}</p>
              </details>
            </article>
          ))}
        </div>
        <div className="source-provenance">
          <h4><Database size={16} /> Sample provenance</h4>
          {[
            { label: 'Reference', location: reference, sample: referenceSample },
            { label: 'Target', location: target, sample: targetSample },
          ].map(({ label, location, sample }) => sample && (
            <p key={`${label}-${sample.body}-${sample.coordinate.latitude}-${sample.coordinate.longitude}`}>
              <strong>{label} · {location.name} ({sample.body})</strong>
              {' · sampled at '}{sample.coordinate.latitude.toFixed(5)}°, {sample.coordinate.longitude.toFixed(5)}°
              {' · source: '}<a href={sample.source.url} target="_blank" rel="noreferrer">{sample.source.title}</a>
              {' · catalog reference: '}{sample.source.catalogId}
              {' · upstream catalog: '}<a href={sample.source.catalogUrl} target="_blank" rel="noreferrer">product record</a>
              {' · '}~{sample.source.pixelSpacingMeters.toFixed(0)} m service pixel spacing at this latitude
              {' · '}product nominal ~{sample.source.nominalResolutionMeters} m
              {' · '}sample window: 1 km, 3×3 nearest-neighbour samples
              {' · '}{sample.source.verticalReference}
              {' · '}{sample.metrics.validSampleCount}/9 valid cells
              {' · '}{sample.source.lineageNote}
            </p>
          ))}
        </div>
      </section>

      <section className="panel-block evidence-panel">
        <div className="panel-head"><Database size={18} /><h3>Evidence &amp; Data Traceability</h3></div>
        <p>
          Each comparison point below identifies the selected place or arbitrary coordinate, the exact DEM sample coordinate, and the live service response. A catalog reference is not proof of per-pixel lineage: the hosted lunar and Mars layers are blends, and they do not return a contributing PDS file ID for each sample.
        </p>
        <div className="evidence-point-grid">
          {[
            { label: 'Reference point', location: reference, sample: referenceSample, error: referenceError },
            { label: 'Target point', location: target, sample: targetSample, error: targetError },
          ].map(({ label, location, sample, error }) => (
            <article key={label}>
              <span className="tile-tag">{label} · {location.body}</span>
              <h4>{location.name}</h4>
              <p><strong>Selected coordinates:</strong> {location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°</p>
              <p><strong>Selection:</strong> {location.isCoordinatePick ? 'Map-picked coordinate; sampled live' : 'Catalog location coordinate; sampled live'}</p>
              <p><strong>Sample status:</strong> {error ? `Unavailable · ${error}` : loading ? 'Request in progress' : sample ? `${sample.metrics.validSampleCount}/9 valid DEM cells` : 'No sample returned'}</p>
              {sample && (
                <>
                  <p><strong>Sample-window center:</strong> {sample.coordinate.latitude.toFixed(5)}°, {sample.coordinate.longitude.toFixed(5)}° · 1 km window, 3×3 samples at 500 m spacing</p>
                  <p><strong>Sample service:</strong> <a href={sample.source.url} target="_blank" rel="noreferrer">{sample.source.dataset}</a></p>
                  {sample.source.sampledTileIds.length > 0
                    ? <p><strong>DEM tiles read:</strong> {sample.source.sampledTileIds.map((tileId) => (
                        <a className="evidence-tile-link" key={tileId} href={`${sample.source.url}/tile/${tileId}`} target="_blank" rel="noreferrer">{tileId}</a>
                      ))}</p>
                    : <p><strong>Tile lineage:</strong> The Earth point-sampling service does not return a source-granule or tile ID for the sampled coordinate.</p>}
                </>
              )}
            </article>
          ))}
        </div>
        <div className="evidence-source-grid">
          {(Object.keys(sourceDefinitions) as Array<keyof typeof sourceDefinitions>).map((body) => {
            const source = sourceDefinitions[body]
            return (
              <article key={body}>
                <span className="tile-tag">{body}</span>
                <h4>{source.title}</h4>
                <p><strong>Catalog reference:</strong> {source.catalogId}</p>
                <p><strong>Catalog / product record:</strong> <a href={source.catalogUrl} target="_blank" rel="noreferrer">Open source record</a></p>
                <p><strong>Sampled service:</strong> <a href={source.url} target="_blank" rel="noreferrer">{source.dataset}</a></p>
                <p>{source.lineageNote}</p>
              </article>
            )
          })}
        </div>
        <div className="evidence-formula-grid">
          {(['elevation', 'slope', 'roughness', 'localRelief'] as MetricKey[]).map((key) => (
            <article key={key}>
              <h4>{metricDetails[key].label}</h4>
              <p>{metricDetails[key].description}</p>
              <p><strong>Derivation / score:</strong> {metricDetails[key].formula}</p>
            </article>
          ))}
        </div>
        <p className="evidence-caveat">
          Pure PDS LRO LOLA and MGS MOLA MEGDR sampling is not integrated in this browser-only app. The public PDS raster endpoints support byte ranges but do not advertise browser CORS access; a controlled server-side proxy or data service is required before TERRA can claim strict PDS-only provenance. Current planetary metrics and analog rankings must therefore be read as blended-service results.
        </p>
      </section>
    </main>
  )
}

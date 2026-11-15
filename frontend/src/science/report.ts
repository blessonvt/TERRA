import { jsPDF } from 'jspdf'
import { metricWeights } from './metrics'
import type { MetricComparison, MetricKey, PlanetaryLocation, TerrainSample } from './model'

export type ComparisonReportData = {
  reference: PlanetaryLocation
  target: PlanetaryLocation
  comparisons: MetricComparison[]
  referenceSample: TerrainSample | null
  targetSample: TerrainSample | null
  overall: number | null
  generatedAt?: Date
}

const parameterNames: Record<MetricKey, string> = {
  elevation: 'Elevation',
  slope: 'Slope',
  roughness: 'Local roughness',
  localRelief: 'Local relief',
  pressure: 'Surface pressure',
  albedo: 'Albedo',
  thermalInertia: 'Thermal inertia',
  grainSize: 'Grain size',
}

const formulas: Record<MetricKey, string> = {
  elevation: 'Same-body elevation: 100 x (1 - abs(A-B) / source range); cross-body elevation is not scored.',
  slope: 'Slope similarity: 100 x (1 - abs(A-B) / 90 degrees).',
  roughness: 'Roughness/relief similarity: 100 x (1 - abs(A-B) / max(abs(A), abs(B))).',
  localRelief: 'Roughness/relief similarity: 100 x (1 - abs(A-B) / max(abs(A), abs(B))).',
  pressure: 'Not calculated: no comparable pressure source is integrated.',
  albedo: 'Not calculated: no wavelength-compatible albedo products are integrated.',
  thermalInertia: 'Not calculated: no method- and season-compatible products are integrated.',
  grainSize: 'Not calculated: no comparable in-situ grain-size measurements are integrated.',
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

export function buildComparisonCsv(data: ComparisonReportData): string {
  const generatedAt = (data.generatedAt ?? new Date()).toISOString()
  const header = [
    'reference_body',
    'reference_location',
    'reference_latitude_deg',
    'reference_longitude_deg',
    'target_body',
    'target_location',
    'target_latitude_deg',
    'target_longitude_deg',
    'parameter',
    'reference_value',
    'target_value',
    'unit',
    'absolute_difference',
    'similarity_percent',
    'weight',
    'reference_dataset',
    'target_dataset',
    'reference_catalog_id',
    'target_catalog_id',
    'reference_lineage_note',
    'target_lineage_note',
    'data_availability',
    'calculation_timestamp_utc',
  ]
  const rows = data.comparisons.map((metric) => [
    data.reference.body,
    data.reference.name,
    data.reference.latitude,
    data.reference.longitude,
    data.target.body,
    data.target.name,
    data.target.latitude,
    data.target.longitude,
    parameterNames[metric.key],
    metric.referenceValue,
    metric.targetValue,
    metric.unit,
    metric.difference,
    metric.similarity,
    metricWeights[metric.key],
    data.referenceSample?.source.title ?? '',
    data.targetSample?.source.title ?? '',
    data.referenceSample?.source.catalogId ?? '',
    data.targetSample?.source.catalogId ?? '',
    data.referenceSample?.source.lineageNote ?? '',
    data.targetSample?.source.lineageNote ?? '',
    metric.comparable && metric.similarity !== null ? 'Available and comparable' : metric.unavailableReason ?? 'Unavailable',
    generatedAt,
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadComparisonCsv(data: ComparisonReportData): void {
  const csv = buildComparisonCsv(data)
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `terra-comparison-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  return `${value.toFixed(unit === '°' ? 2 : 1)}${unit ? ` ${unit}` : ''}`
}

function safeText(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '?')
}

export function downloadComparisonPdf(data: ComparisonReportData): void {
  const document = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const pageWidth = document.internal.pageSize.getWidth()
  const pageHeight = document.internal.pageSize.getHeight()
  const usableWidth = pageWidth - margin * 2
  let y = margin

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - margin) {
      document.addPage()
      y = margin
    }
  }
  const writeParagraph = (text: string, size = 10, color: [number, number, number] = [55, 66, 75]) => {
    document.setFont('helvetica', 'normal')
    document.setFontSize(size)
    document.setTextColor(...color)
    const lines = document.splitTextToSize(safeText(text), usableWidth) as string[]
    const height = Math.max(5, lines.length * (size * 0.44))
    ensureSpace(height + 2)
    document.text(lines, margin, y)
    y += height + 2
  }
  const writeSection = (title: string) => {
    ensureSpace(12)
    document.setFont('helvetica', 'bold')
    document.setFontSize(12)
    document.setTextColor(31, 55, 72)
    document.text(safeText(title), margin, y)
    y += 7
  }
  const writeLocation = (label: string, location: PlanetaryLocation) => {
    writeParagraph(`${label}: ${location.name} (${location.body})`, 11, [31, 55, 72])
    writeParagraph(`Coordinates: ${location.latitude.toFixed(5)} deg latitude, ${location.longitude.toFixed(5)} deg longitude`)
  }

  document.setFillColor(18, 35, 48)
  document.rect(0, 0, pageWidth, 36, 'F')
  document.setFont('helvetica', 'bold')
  document.setFontSize(12)
  document.setTextColor(202, 221, 233)
  document.text('TERRA  /  PLANETARY ANALOG EXPLORER', margin, 14)
  document.setFontSize(19)
  document.setTextColor(255, 255, 255)
  document.text('Terrain comparison report', margin, 26)
  y = 44

  const generatedAt = data.generatedAt ?? new Date()
  writeParagraph(`Generated ${generatedAt.toLocaleString()} · Calculation version: terrain-metrics-v1`, 9, [105, 115, 124])
  writeLocation('Reference', data.reference)
  writeLocation('Target', data.target)

  writeSection('Quick findings')
  writeParagraph(
    data.overall === null
      ? 'Overall comparable terrain index: unavailable. No valid comparable measurements were available for this pair.'
      : `Overall comparable terrain index: ${data.overall.toFixed(1)}%. This is a descriptive index, not a probability or measure of geological equivalence.`,
    11,
    [31, 55, 72],
  )
  const scores = data.comparisons
    .filter((metric) => metric.similarity !== null)
    .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  writeParagraph(scores.length
    ? `Strongest available match: ${parameterNames[scores[0].key]} (${scores[0].similarity?.toFixed(1)}%).`
    : 'Strongest match: unavailable.')
  writeParagraph(scores.length > 1
    ? `Largest measured difference: ${parameterNames[scores[scores.length - 1].key]} (${scores[scores.length - 1].similarity?.toFixed(1)}% similarity).`
    : 'Largest measured difference: unavailable.')

  writeSection('Parameter comparison')
  const columns = [
    { title: 'Parameter', x: margin, width: 42 },
    { title: 'Reference', x: margin + 42, width: 36 },
    { title: 'Target', x: margin + 78, width: 36 },
    { title: 'Difference', x: margin + 114, width: 35 },
    { title: 'Similarity', x: margin + 149, width: 29 },
  ]
  const drawTableHeader = () => {
    ensureSpace(10)
    document.setFillColor(232, 238, 242)
    document.rect(margin, y - 5, usableWidth, 9, 'F')
    document.setFont('helvetica', 'bold')
    document.setFontSize(8)
    document.setTextColor(45, 59, 69)
    columns.forEach((column) => document.text(column.title, column.x + 1, y))
    y += 7
  }
  drawTableHeader()
  data.comparisons.forEach((metric, index) => {
    const cells = [
      parameterNames[metric.key],
      formatValue(metric.referenceValue, metric.unit),
      formatValue(metric.targetValue, metric.unit),
      formatValue(metric.difference, metric.unit),
      metric.similarity === null ? 'Unavailable' : `${metric.similarity.toFixed(1)}%`,
    ]
    const wrapped = cells.map((cell, cellIndex) => document.splitTextToSize(safeText(cell), columns[cellIndex].width - 2) as string[])
    const rowHeight = Math.max(6, ...wrapped.map((lines) => lines.length * 3.8))
    ensureSpace(rowHeight + 2)
    if (y === margin) drawTableHeader()
    if (index % 2 === 0) {
      document.setFillColor(247, 249, 250)
      document.rect(margin, y - 4, usableWidth, rowHeight + 2, 'F')
    }
    document.setFont('helvetica', 'normal')
    document.setFontSize(7.5)
    document.setTextColor(50, 60, 68)
    wrapped.forEach((lines, cellIndex) => document.text(lines, columns[cellIndex].x + 1, y))
    y += rowHeight + 2
  })

  ensureSpace(35)
  writeSection('Score visualization')
  scores.forEach((metric) => {
    ensureSpace(9)
    document.setFont('helvetica', 'normal')
    document.setFontSize(8)
    document.setTextColor(55, 66, 75)
    document.text(parameterNames[metric.key], margin, y)
    const barX = margin + 42
    const barY = y - 3.4
    const barWidth = 94
    document.setFillColor(231, 236, 240)
    document.roundedRect(barX, barY, barWidth, 4, 1, 1, 'F')
    document.setFillColor(76, 134, 168)
    document.roundedRect(barX, barY, barWidth * (metric.similarity ?? 0) / 100, 4, 1, 1, 'F')
    document.text(`${metric.similarity?.toFixed(1)}%`, barX + barWidth + 4, y)
    y += 7
  })

  ensureSpace(50)
  writeSection('Sources and calculation')
  writeParagraph(`Reference dataset: ${data.referenceSample?.source.title ?? 'Unavailable'}.`)
  if (data.referenceSample) {
    writeParagraph(`Reference source URL: ${data.referenceSample.source.url}`)
    writeParagraph(`Reference catalog reference: ${data.referenceSample.source.catalogId}`)
    writeParagraph(`Reference catalog URL: ${data.referenceSample.source.catalogUrl}`)
    writeParagraph(`Reference lineage note: ${data.referenceSample.source.lineageNote}`)
  }
  writeParagraph(`Target dataset: ${data.targetSample?.source.title ?? 'Unavailable'}.`)
  if (data.targetSample) {
    writeParagraph(`Target source URL: ${data.targetSample.source.url}`)
    writeParagraph(`Target catalog reference: ${data.targetSample.source.catalogId}`)
    writeParagraph(`Target catalog URL: ${data.targetSample.source.catalogUrl}`)
    writeParagraph(`Target lineage note: ${data.targetSample.source.lineageNote}`)
  }
  writeParagraph(`Reference sample coverage: ${data.referenceSample?.metrics.validSampleCount ?? 0}/9 cells; target sample coverage: ${data.targetSample?.metrics.validSampleCount ?? 0}/9 cells.`)
  writeParagraph('A 3 x 3 nearest-neighbour elevation sample is taken over a nominal 1 km window. Slope uses four-neighbour central differences; roughness is the population standard deviation; local relief is maximum minus minimum elevation.')
  writeSection('Formulas and weights')
  data.comparisons.forEach((metric) => {
    writeParagraph(`${parameterNames[metric.key]} (weight ${metricWeights[metric.key]}): ${formulas[metric.key]}`, 8)
  })
  writeParagraph('The overall index is the equally weighted mean of available comparable terrain scores. Cross-body elevation is not scored because vertical datums differ or are unspecified. Pressure, albedo, thermal inertia, and grain-size scores are not integrated.')
  writeParagraph('DEM sources are dynamic services; service retrieval dates are recorded in this report, but exact source tile versions are not pinned. Terrain scores are sensitive to DEM resolution, source coverage, sample placement, and product uncertainty.')

  const pageCount = document.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page)
    document.setFont('helvetica', 'normal')
    document.setFontSize(8)
    document.setTextColor(120, 128, 135)
    document.text(`TERRA · Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
  }

  document.save(`terra-comparison-${generatedAt.toISOString().slice(0, 10)}.pdf`)
}

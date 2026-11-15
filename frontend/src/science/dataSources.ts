import lercWasmUrl from 'lerc/lerc-wasm.wasm?url'
import { calculateTerrainMetrics, isAllZeroElevationWindow } from './metrics'
import type { Coordinate, PlanetaryBody, TerrainSample } from './model'
import type { LercData } from 'lerc'

type ArcGisTileInfo = {
  rows: number
  cols: number
  origin: { x: number; y: number }
  lods: Array<{ level: number; resolution: number }>
}

type ArcGisImageMetadata = { tileInfo?: ArcGisTileInfo; error?: { message?: string } }

type ArcGisSample = {
  locationId: number
  value: string
  resolution: number
}

type ArcGisSamplesResponse = {
  samples?: ArcGisSample[]
  error?: { message?: string }
}

const sourceDefinitions: Record<PlanetaryBody, {
  title: string
  url: string
  provider: string
  dataset: string
  verticalReference: string
  catalogId: string
  catalogUrl: string
  lineageNote: string
  radiusMeters: number
  imageServiceUrl: string
  spatialReference: number
  nominalResolutionMeters: number
}> = {
  Earth: {
    title: 'Copernicus DEM GLO-30',
    url: 'https://di-elevation.img.arcgis.com/arcgis/rest/services/copdemglo30/ImageServer',
    provider: 'ESA, DLR, Airbus; distributed by Esri from Microsoft Planetary Computer',
    dataset: 'Copernicus DEM GLO-30 digital surface model',
    verticalReference: 'EGM2008 orthometric heights, per product specification',
    catalogId: 'COP-DEM_GLO-30 product family; source granule ID is not exposed by the hosted service',
    catalogUrl: 'https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model',
    lineageNote: 'The service returns sampled values but does not expose a source granule or tile identifier for each coordinate.',
    radiusMeters: 6371008.8,
    imageServiceUrl: 'https://di-elevation.img.arcgis.com/arcgis/rest/services/copdemglo30/ImageServer',
    spatialReference: 4326,
    nominalResolutionMeters: 30,
  },
  Moon: {
    title: 'LRO LOLA + SELENE/Kaguya TC merged DEM',
    url: 'https://astro.arcgis.com/arcgis/rest/services/OnMoon/LOLA_Kaguya/ImageServer',
    provider: 'USGS, NASA, ESA; hosted by Esri',
    dataset: 'LOLA–SELENE/Kaguya merged DEM, limited to 60°N–60°S',
    verticalReference: 'Moon 2000 geographic reference; vertical datum not specified by the service metadata',
    catalogId: 'LRO-L-LOLA-4-GDR-V1.0 is an upstream LOLA archive reference; the sampled service is a LOLA–SELENE/Kaguya blend, not a pure LOLA product.',
    catalogUrl: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/gdr_ds.cat',
    lineageNote: 'The hosted layer documents a LOLA + SELENE/Kaguya merged DEM. It does not expose per-pixel source lineage or a matching PDS product ID.',
    radiusMeters: 1737400,
    imageServiceUrl: 'https://astro.arcgis.com/arcgis/rest/services/OnMoon/LOLA_Kaguya/ImageServer',
    spatialReference: 104903,
    nominalResolutionMeters: 59,
  },
  Mars: {
    title: 'Mars HRSC–MOLA Blended DEM Global Mosaic v2',
    url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer',
    provider: 'USGS Astrogeology, NASA/JPL, ESA; hosted by Esri',
    dataset: 'Global 200 m HRSC and MOLA blended elevation model',
    verticalReference: 'Mars 2000 geographic reference; the service metadata does not specify a vertical datum',
    catalogId: 'MGS-M-MOLA-5-MEGDR-L3-V1.0 is an upstream MOLA archive reference; the sampled service is an HRSC–MOLA blend, not a pure MEGDR product.',
    catalogUrl: 'https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg032/megt90n000fb.lbl',
    lineageNote: 'The hosted layer documents a blended HRSC + MOLA DEM. It does not expose per-pixel source lineage or a matching PDS product ID.',
    radiusMeters: 3396190,
    imageServiceUrl: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer',
    spatialReference: 104971,
    nominalResolutionMeters: 200,
  },
}

const sourceElevationRanges: Record<PlanetaryBody, [number, number]> = {
  Earth: [-427, 8612.01],
  Moon: [-9128, 10784],
  Mars: [-8210, 21241],
}

const earthSampleUrl = `${sourceDefinitions.Earth.imageServiceUrl}/getSamples`
let lercModule: Promise<typeof import('lerc')> | undefined

async function getMetadata(body: PlanetaryBody, signal?: AbortSignal): Promise<ArcGisImageMetadata> {
  const response = await fetch(`${sourceDefinitions[body].imageServiceUrl}?f=json`, { signal })
  if (!response.ok) throw new Error(`${body} elevation metadata request failed (${response.status}).`)
  const metadata = await response.json() as ArcGisImageMetadata
  if (metadata.error) throw new Error(metadata.error.message ?? `${body} elevation metadata is unavailable.`)
  return metadata
}

function createSampleCoordinates(center: Coordinate, radiusMeters: number): Coordinate[] {
  const metersPerDegree = Math.PI * radiusMeters / 180
  const cosLatitude = Math.cos(center.latitude * Math.PI / 180)
  if (Math.abs(cosLatitude) < 0.01) {
    throw new RangeError('Terrain sampling is not supported within 0.01 cosine latitude of a pole.')
  }

  const halfWindowDegrees = 500 / metersPerDegree
  const longitudeOffset = halfWindowDegrees / cosLatitude
  const points: Coordinate[] = []
  for (const latitudeOffset of [halfWindowDegrees, 0, -halfWindowDegrees]) {
    for (const longitudeMultiplier of [-1, 0, 1]) {
      points.push({
        latitude: center.latitude + latitudeOffset,
        longitude: center.longitude + longitudeMultiplier * longitudeOffset,
      })
    }
  }
  return points
}

function parseSampleValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '' || /nodata|null/i.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function sampleEarth(coordinate: Coordinate, signal?: AbortSignal): Promise<TerrainSample> {
  const points = createSampleCoordinates(coordinate, sourceDefinitions.Earth.radiusMeters)
  const url = new URL(earthSampleUrl)
  url.searchParams.set('geometry', JSON.stringify({
    points: points.map((point) => [point.longitude, point.latitude]),
    spatialReference: { wkid: 4326 },
  }))
  url.searchParams.set('geometryType', 'esriGeometryMultipoint')
  url.searchParams.set('sampleCount', '1')
  url.searchParams.set('returnFirstValueOnly', 'true')
  url.searchParams.set('interpolation', 'RSP_NearestNeighbor')
  url.searchParams.set('f', 'json')

  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Copernicus DEM request failed (${response.status}).`)
  const body = await response.json() as ArcGisSamplesResponse
  if (body.error) throw new Error(body.error.message ?? 'Copernicus DEM returned an error.')
  if (!body.samples?.length) throw new Error('Copernicus DEM returned no samples for this location.')

  const valuesById = new Map<number, number | null>()
  for (const sample of body.samples) {
    if (!valuesById.has(sample.locationId)) valuesById.set(sample.locationId, parseSampleValue(sample.value))
  }
  const elevations = points.map((_, index) => valuesById.get(index) ?? null)
  const qualityWarnings = isAllZeroElevationWindow(elevations)
    ? ['The DEM returned 0 m for all nine cells. This may indicate water, a fill value, or a flat-value artifact; terrain scores are withheld.']
    : []
  const centerSample = body.samples.find((sample) => sample.locationId === 4)
  const resolutionDegrees = centerSample?.resolution ?? 0.0002777777777777778
  const latitudeResolution = resolutionDegrees * Math.PI / 180 * sourceDefinitions.Earth.radiusMeters
  const longitudeResolution = latitudeResolution * Math.cos(coordinate.latitude * Math.PI / 180)

  return {
    body: 'Earth',
    coordinate,
    metrics: calculateTerrainMetrics(elevations),
    qualityWarnings,
    source: {
      ...sourceDefinitions.Earth,
      pixelSpacingMeters: (Math.abs(latitudeResolution) + Math.abs(longitudeResolution)) / 2,
    },
  }
}

async function getPlanetaryTile(
  body: Exclude<PlanetaryBody, 'Earth'>,
  level: number,
  row: number,
  col: number,
  signal?: AbortSignal,
): Promise<LercData> {
  const url = `${sourceDefinitions[body].imageServiceUrl}/tile/${level}/${row}/${col}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`${body} DEM tile request failed (${response.status}).`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const decoder = await (lercModule ??= import('lerc'))
  await decoder.load({ locateFile: () => lercWasmUrl })
  return decoder.decode(bytes)
}

async function samplePlanetaryBody(
  body: Exclude<PlanetaryBody, 'Earth'>,
  coordinate: Coordinate,
  signal?: AbortSignal,
): Promise<TerrainSample> {
  if (body === 'Moon' && Math.abs(coordinate.latitude) > 60) {
    throw new Error('The selected LOLA/Kaguya DEM product covers only 60°N to 60°S.')
  }

  const metadata = await getMetadata(body, signal)
  const tileInfo = metadata.tileInfo
  const lod = tileInfo?.lods.at(-1)
  if (!tileInfo || !lod) throw new Error(`${body} DEM metadata does not include a usable tile grid.`)

  const source = sourceDefinitions[body]
  const points = createSampleCoordinates(coordinate, source.radiusMeters)
  const addressForPoint = (point: Coordinate) => {
    const row = Math.floor((tileInfo.origin.y - point.latitude) / (tileInfo.rows * lod.resolution))
    const col = Math.floor((point.longitude - tileInfo.origin.x) / (tileInfo.cols * lod.resolution))
    const x = Math.floor((point.longitude - (tileInfo.origin.x + col * tileInfo.cols * lod.resolution)) / lod.resolution)
    const y = Math.floor(((tileInfo.origin.y - row * tileInfo.rows * lod.resolution) - point.latitude) / lod.resolution)
    return { row, col, x, y }
  }

  const addresses = points.map(addressForPoint)
  const uniqueTiles = new Map<string, { row: number; col: number }>()
  addresses.forEach(({ row, col }) => uniqueTiles.set(`${row}/${col}`, { row, col }))
  const tileEntries = await Promise.all(
    [...uniqueTiles.entries()].map(async ([key, tile]) => [
      key,
      await getPlanetaryTile(body, lod.level, tile.row, tile.col, signal),
    ] as const),
  )
  const tiles = new Map(tileEntries)
  const elevations = addresses.map(({ row, col, x, y }) => {
    const tile = tiles.get(`${row}/${col}`)
    if (!tile || x < 0 || y < 0 || x >= tile.width || y >= tile.height) return null
    const index = y * tile.width + x
    if (tile.mask && tile.mask[index] === 0) return null
    const value = tile.pixels[0][index]
    return Number.isFinite(value) ? value : null
  })
  const qualityWarnings = isAllZeroElevationWindow(elevations)
    ? ['The DEM returned 0 m for all nine cells. This may indicate a fill value or a flat-value artifact; terrain scores are withheld.']
    : []

  const latitudeResolution = lod.resolution * Math.PI / 180 * source.radiusMeters
  const longitudeResolution = latitudeResolution * Math.cos(coordinate.latitude * Math.PI / 180)
  return {
    body,
    coordinate,
    metrics: calculateTerrainMetrics(elevations),
    qualityWarnings,
    source: {
      ...source,
      pixelSpacingMeters: (Math.abs(latitudeResolution) + Math.abs(longitudeResolution)) / 2,
    },
  }
}

export async function sampleTerrain(
  body: PlanetaryBody,
  coordinate: Coordinate,
  signal?: AbortSignal,
): Promise<TerrainSample> {
  if (
    !Number.isFinite(coordinate.latitude)
    || !Number.isFinite(coordinate.longitude)
    || coordinate.latitude < -90
    || coordinate.latitude > 90
    || coordinate.longitude < -180
    || coordinate.longitude > 180
  ) {
    throw new RangeError('Select a location with valid latitude and longitude coordinates.')
  }

  if (body === 'Earth' && Math.abs(coordinate.latitude) > 84.015) {
    throw new Error('Copernicus DEM GLO-30 does not cover this latitude.')
  }
  if (body === 'Earth') return sampleEarth(coordinate, signal)
  return samplePlanetaryBody(body, coordinate, signal)
}

export { sourceElevationRanges, sourceDefinitions }

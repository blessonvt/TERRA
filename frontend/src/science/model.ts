export type PlanetaryBody = 'Earth' | 'Moon' | 'Mars'

export type Coordinate = {
  latitude: number
  longitude: number
}

export type PlanetaryLocation = Coordinate & {
  id: string
  body: PlanetaryBody
  name: string
  isCoordinatePick?: boolean
  region: string
  terrainClass: string
  description: string
  country?: string
  imageQuery?: string
}

export type TerrainMetrics = {
  elevationMeters: number | null
  slopeDegrees: number | null
  roughnessMeters: number | null
  localReliefMeters: number | null
  validSampleCount: number
}

export type TerrainSample = {
  body: PlanetaryBody
  coordinate: Coordinate
  metrics: TerrainMetrics
  qualityWarnings: string[]
  source: {
    title: string
    url: string
    provider: string
    dataset: string
    nominalResolutionMeters: number
    pixelSpacingMeters: number
    verticalReference: string
    catalogId: string
    catalogUrl: string
    lineageNote: string
    sampledTileIds: string[]
  }
}

export type MetricKey =
  | 'elevation'
  | 'slope'
  | 'roughness'
  | 'localRelief'
  | 'pressure'
  | 'albedo'
  | 'thermalInertia'
  | 'grainSize'

export type MetricComparison = {
  key: MetricKey
  referenceValue: number | null
  targetValue: number | null
  difference: number | null
  similarity: number | null
  unit: string
  comparable: boolean
  unavailableReason?: string
}

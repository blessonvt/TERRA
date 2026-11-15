import type { PlanetaryLocation } from './model'

export type ComparisonSide = 'reference' | 'target'

export type ComparisonSelection = {
  reference: PlanetaryLocation
  target: PlanetaryLocation
}

export const COMPARISON_SELECTION_STORAGE_KEY = 'terra-comparison-selection-v1'

function isPlanetaryLocation(value: unknown): value is PlanetaryLocation {
  if (typeof value !== 'object' || value === null) return false
  if (!('body' in value) || !['Earth', 'Moon', 'Mars'].includes(String(value.body))) return false
  return 'id' in value
    && typeof value.id === 'string'
    && 'name' in value
    && typeof value.name === 'string'
    && 'latitude' in value
    && typeof value.latitude === 'number'
    && Number.isFinite(value.latitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && 'longitude' in value
    && typeof value.longitude === 'number'
    && Number.isFinite(value.longitude)
    && value.longitude >= -180
    && value.longitude <= 180
    && 'region' in value
    && typeof value.region === 'string'
    && 'terrainClass' in value
    && typeof value.terrainClass === 'string'
    && 'description' in value
    && typeof value.description === 'string'
    && (!('country' in value) || typeof value.country === 'string')
    && (!('imageQuery' in value) || typeof value.imageQuery === 'string')
    && (!('isCoordinatePick' in value) || typeof value.isCoordinatePick === 'boolean')
}

export function parseComparisonSelection(serialized: string | null): ComparisonSelection | null {
  if (serialized === null) return null
  try {
    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null) return null
    if (!('reference' in parsed) || !isPlanetaryLocation(parsed.reference)) return null
    if (!('target' in parsed) || !isPlanetaryLocation(parsed.target)) return null
    return { reference: parsed.reference, target: parsed.target }
  } catch {
    return null
  }
}

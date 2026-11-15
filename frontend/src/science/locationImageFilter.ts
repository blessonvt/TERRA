import type { PlanetaryLocation } from './model'

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function matchesLocationImage(location: PlanetaryLocation, title: string, description: string): boolean {
  const searchTerm = location.imageQuery ?? location.name.replace(/\s+landing site$/i, '')
  const searchableText = normalizeText(`${title} ${description}`)
  if (!searchableText.includes(normalizeText(searchTerm))) return false
  if (location.body !== 'Moon') return true

  const hasLunarSurfaceContext = searchableText.includes('lunar surface')
    || searchableText.includes('surface of the moon')
    || searchableText.includes('surface of moon')
  const isNonSurfaceMissionImage = [
    'in orbit',
    'pre launch',
    'prelaunch',
    'launch pad',
    'countdown demonstration',
    'command service module',
  ].some((term) => searchableText.includes(term))
  return hasLunarSurfaceContext && !isNonSurfaceMissionImage
}

import type { PlanetaryBody, PlanetaryLocation } from './model'

const bodyRadiiMeters: Record<PlanetaryBody, number> = {
  Earth: 6371008.8,
  Moon: 1737400,
  Mars: 3396190,
}

function isSampleableWindow(location: PlanetaryLocation): boolean {
  const halfWindowDegrees = 500 / (Math.PI * bodyRadiiMeters[location.body] / 180)
  const latitudeMargin = Math.abs(location.latitude) + halfWindowDegrees
  if (location.body === 'Earth' && latitudeMargin > 84.015) return false
  if (location.body === 'Moon' && latitudeMargin > 60) return false
  return Math.abs(Math.cos(location.latitude * Math.PI / 180)) >= 0.01
}

export function chooseRandomSampleableLocation(
  locations: readonly PlanetaryLocation[],
  body: PlanetaryBody,
  excludedId?: string,
  random: () => number = Math.random,
): PlanetaryLocation | null {
  const candidates = locations.filter((location) => location.body === body && isSampleableWindow(location))
  const alternatives = candidates.filter((location) => location.id !== excludedId)
  const choices = alternatives.length ? alternatives : candidates
  if (choices.length === 0) return null

  const index = Math.min(choices.length - 1, Math.max(0, Math.floor(random() * choices.length)))
  return choices[index]
}

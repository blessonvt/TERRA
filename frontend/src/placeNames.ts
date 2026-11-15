import type { Coordinate, PlanetaryBody } from './science/model'

export type NamedCoordinate = Coordinate & { name: string }

export type EarthPlaceResult = {
  name: string
  attributionUrl: string
}

export type NearestNamedFeature = {
  name: string
  distanceKm: number
}

type NominatimReverseResponse = {
  display_name?: string
  address?: Record<string, string>
}

const earthNameCache = new Map<string, EarthPlaceResult>()
const cacheLimit = 256
let lastEarthLookupAt = 0

function coordinateKey(coordinate: Coordinate): string {
  return `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`
}

function abortError(): Error {
  const error = new Error('Place-name lookup was cancelled.')
  error.name = 'AbortError'
  return error
}

function waitForRateLimit(signal: AbortSignal): Promise<void> {
  const delay = Math.max(0, 1100 - (Date.now() - lastEarthLookupAt))
  if (delay === 0) return Promise.resolve()
  if (signal.aborted) return Promise.reject(abortError())

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    const onAbort = () => {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function displayEarthPlace(response: NominatimReverseResponse): string | null {
  const address = response.address
  if (address) {
    const locality = address.city
      ?? address.town
      ?? address.village
      ?? address.municipality
      ?? address.hamlet
      ?? address.suburb
      ?? address.county
      ?? address.state
    const parts = [locality, address.country].filter((part): part is string => Boolean(part))
    if (parts.length) return [...new Set(parts)].join(', ')
  }
  return response.display_name?.trim() || null
}

export async function reverseGeocodeEarth(
  coordinate: Coordinate,
  signal: AbortSignal,
): Promise<EarthPlaceResult> {
  if (
    !Number.isFinite(coordinate.latitude)
    || !Number.isFinite(coordinate.longitude)
    || coordinate.latitude < -90
    || coordinate.latitude > 90
    || coordinate.longitude < -180
    || coordinate.longitude > 180
  ) {
    throw new RangeError('Place-name lookup requires valid latitude and longitude coordinates.')
  }

  const key = coordinateKey(coordinate)
  const cached = earthNameCache.get(key)
  if (cached) return cached

  await waitForRateLimit(signal)
  if (signal.aborted) throw abortError()
  lastEarthLookupAt = Date.now()

  const url = new URL('https://nominatim.openstreetmap.org/reverse')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('lat', coordinate.latitude.toFixed(6))
  url.searchParams.set('lon', coordinate.longitude.toFixed(6))
  url.searchParams.set('zoom', '10')
  url.searchParams.set('addressdetails', '1')
  const response = await fetch(url, {
    signal,
    headers: { 'Accept-Language': 'en' },
  })
  if (!response.ok) throw new Error(`Earth place-name lookup failed (${response.status}).`)

  const payload = await response.json() as NominatimReverseResponse
  const name = displayEarthPlace(payload)
  if (!name) throw new Error('No named place was returned for these Earth coordinates.')

  const result = {
    name,
    attributionUrl: 'https://www.openstreetmap.org/copyright',
  }
  if (earthNameCache.size >= cacheLimit) {
    const oldestKey = earthNameCache.keys().next().value
    if (oldestKey) earthNameCache.delete(oldestKey)
  }
  earthNameCache.set(key, result)
  return result
}

export function nearestNamedFeature(
  coordinate: Coordinate,
  candidates: readonly NamedCoordinate[],
  body: PlanetaryBody,
): NearestNamedFeature | null {
  if (!candidates.length) return null

  const radiusKm = body === 'Earth' ? 6371.009 : body === 'Moon' ? 1737.4 : 3396.19
  const latitude = coordinate.latitude * Math.PI / 180
  let nearest: NearestNamedFeature | null = null

  for (const candidate of candidates) {
    const candidateLatitude = candidate.latitude * Math.PI / 180
    const latitudeDelta = candidateLatitude - latitude
    const longitudeDelta = ((candidate.longitude - coordinate.longitude + 540) % 360 - 180) * Math.PI / 180
    const haversine = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(latitude) * Math.cos(candidateLatitude) * Math.sin(longitudeDelta / 2) ** 2
    const distanceKm = radiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    if (!nearest || distanceKm < nearest.distanceKm) nearest = { name: candidate.name, distanceKm }
  }

  return nearest
}

export function formatCoordinate(value: number): string {
  return `${value.toFixed(6)}°`
}

import { describe, expect, it } from 'vitest'
import { formatCoordinate, nearestNamedFeature } from './placeNames'

describe('coordinate labels', () => {
  it('keeps six decimal places for selected coordinates', () => {
    expect(formatCoordinate(-4.1234567)).toBe('-4.123457°')
    expect(formatCoordinate(12)).toBe('12.000000°')
  })

  it('finds the nearest feature using wrapped longitude distance', () => {
    const nearest = nearestNamedFeature(
      { latitude: 0, longitude: 179.9 },
      [
        { name: 'Far side', latitude: 0, longitude: 0 },
        { name: 'Across date line', latitude: 0, longitude: -179.9 },
      ],
      'Mars',
    )

    expect(nearest?.name).toBe('Across date line')
    expect(nearest?.distanceKm).toBeCloseTo(11.86, 1)
  })

  it('returns no nearest feature for an empty catalog', () => {
    expect(nearestNamedFeature({ latitude: 0, longitude: 0 }, [], 'Moon')).toBeNull()
  })
})

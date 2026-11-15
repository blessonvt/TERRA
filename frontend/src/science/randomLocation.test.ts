import { describe, expect, it } from 'vitest'
import { chooseRandomSampleableLocation } from './randomLocation'
import type { PlanetaryLocation } from './model'

const locations: PlanetaryLocation[] = [
  {
    id: 'earth-a',
    name: 'Earth site A',
    body: 'Earth',
    latitude: 10,
    longitude: 20,
    region: 'Test',
    terrainClass: 'Test',
    description: '',
  },
  {
    id: 'earth-b',
    name: 'Earth site B',
    body: 'Earth',
    latitude: -10,
    longitude: 30,
    region: 'Test',
    terrainClass: 'Test',
    description: '',
  },
  {
    id: 'moon-valid',
    name: 'Moon site',
    body: 'Moon',
    latitude: 40,
    longitude: -20,
    region: 'Test',
    terrainClass: 'Test',
    description: '',
  },
  {
    id: 'moon-outside',
    name: 'Moon site outside DEM coverage',
    body: 'Moon',
    latitude: 60,
    longitude: 20,
    region: 'Test',
    terrainClass: 'Test',
    description: '',
  },
]

describe('random sampleable catalog locations', () => {
  it('chooses a location only from the requested body and avoids the current choice when possible', () => {
    const selected = chooseRandomSampleableLocation(locations, 'Earth', 'earth-a', () => 0)

    expect(selected?.id).toBe('earth-b')
    expect(chooseRandomSampleableLocation(locations, 'Moon', undefined, () => 0)?.id).toBe('moon-valid')
  })

  it('returns null when the requested body has no catalog point inside sampling coverage', () => {
    expect(chooseRandomSampleableLocation(locations, 'Mars')).toBeNull()
  })
})

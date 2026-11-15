import { describe, expect, it } from 'vitest'
import { parseComparisonSelection } from './selectionStorage'

const reference = {
  id: 'map-earth-10-20',
  name: 'Map-picked location',
  body: 'Earth',
  latitude: 10.12345,
  longitude: 20.54321,
  region: 'Selected on the map',
  terrainClass: 'Coordinate sample',
  description: 'A coordinate selected on the Earth map.',
}

describe('persisted comparison selections', () => {
  it('restores custom coordinates without rounding or changing their assigned sides', () => {
    const selection = {
      reference,
      target: { ...reference, id: 'map-mars-1-2', body: 'Mars' as const, latitude: -1.23456, longitude: 2.34567 },
    }

    expect(parseComparisonSelection(JSON.stringify(selection))).toEqual(selection)
  })

  it('rejects malformed or out-of-range stored coordinates', () => {
    expect(parseComparisonSelection('{not json')).toBeNull()
    expect(parseComparisonSelection(JSON.stringify({
      reference: { ...reference, latitude: 91 },
      target: reference,
    }))).toBeNull()
  })
})

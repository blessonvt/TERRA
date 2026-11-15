import { describe, expect, it } from 'vitest'
import { matchesLocationImage } from './science/locationImageFilter'
import type { PlanetaryLocation } from './science/model'

const apollo11: PlanetaryLocation = {
  id: 'apollo-11',
  name: 'Apollo 11 landing site',
  body: 'Moon',
  latitude: 0.6742,
  longitude: 23.4731,
  region: 'Mare Tranquillitatis',
  terrainClass: 'Crewed landing',
  description: 'Apollo 11 lunar landing site.',
  imageQuery: 'Apollo 11',
}

const viking1: PlanetaryLocation = {
  id: 'viking-1',
  name: 'Viking 1 landing site',
  body: 'Mars',
  latitude: 22.48,
  longitude: -47.97,
  region: 'Chryse Planitia',
  terrainClass: 'Robotic lander',
  description: 'First successful U.S. Mars landing.',
  imageQuery: 'Chryse Planitia',
}

describe('NASA location image relevance', () => {
  it('requires both the selected site and lunar surface context for Moon images', () => {
    expect(matchesLocationImage(apollo11, 'Apollo 11 Lunar Module footpad', 'It rested on the lunar surface.')).toBe(true)
    expect(matchesLocationImage(apollo11, 'Apollo 11 spacecraft pre-launch', 'Countdown demonstration at the launch pad.')).toBe(false)
    expect(matchesLocationImage(apollo11, 'Apollo 11 command/service modules', 'Photographed in orbit using a lunar surface camera.')).toBe(false)
  })

  it('requires the selected geographic site in Mars image metadata', () => {
    expect(matchesLocationImage(viking1, 'Chryse Planitia - False Color', 'Image of part of the Chryse Planitia margin.')).toBe(true)
    expect(matchesLocationImage(viking1, 'Viking 1 lander', 'A view of the Mars surface near the lander.')).toBe(false)
  })
})

import type { PlanetaryBody } from './model'

export type PlanetaryImagerySource = {
  tiles: string
  tileSize: number
  maxZoom: number
  center: [number, number]
  zoom: number
  attribution: string
  description: string
}

export const planetaryImagerySources: Record<PlanetaryBody, PlanetaryImagerySource> = {
  Earth: {
    tiles: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    maxZoom: 19,
    center: [10, 20],
    zoom: 1.2,
    attribution: 'Imagery: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
    description: 'Satellite and aerial imagery from Esri World Imagery.',
  },
  Moon: {
    tiles: 'https://astro.arcgis.com/arcgis/rest/services/OnMoon/LRO_WAC/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    maxZoom: 8,
    center: [0, 0],
    zoom: 0.2,
    attribution: 'LROC WAC: ASU, NASA PDS; hosted by Esri',
    description: 'Lunar Reconnaissance Orbiter Camera Wide Angle Camera global mosaic.',
  },
  Mars: {
    tiles: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer/tile/{z}/{y}/{x}',
    tileSize: 256,
    maxZoom: 8,
    center: [0, 0],
    zoom: 0.2,
    attribution: 'Mars MDIM: NASA, JPL, USGS; hosted by Esri',
    description: 'NASA Ames and USGS Viking-based Mars Digital Image Model mosaic.',
  },
}

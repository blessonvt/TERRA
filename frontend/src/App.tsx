import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import {
  BookOpen,
  Compass,
  Database,
  Download,
  Earth,
  FileText,
  Gauge,
  Globe2,
  House,
  Info,
  Landmark,
  Map,
  Moon,
  RefreshCw,
  Scale,
  Satellite,
  Shuffle,
} from 'lucide-react'
import type * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import ComparisonPage from './ComparisonPage'
import LocationImages from './LocationImages'
import TutorialModal from './TutorialModal'
import { explorationLandmarks } from './exploration/landmarks'
import type { ExplorationLandmark } from './exploration/landmarks'
import { downloadComparisonCsv, downloadComparisonPdf } from './science/report'
import { useEarthAnalogMatches } from './science/useEarthAnalogMatches'
import { useTerrainComparison } from './science/useTerrainComparison'
import type { PlanetaryBody, PlanetaryLocation } from './science/model'
import { chooseRandomSampleableLocation } from './science/randomLocation'
import { planetaryImagerySources as mapSources } from './science/planetaryImagery'
import { formatCoordinate, nearestNamedFeature, reverseGeocodeEarth } from './placeNames'
import 'maplibre-gl/dist/maplibre-gl.css'

type WorldSite = {
  id: string
  name: string
  country: string
  region: string
  continent: string
  latitude: number
  longitude: number
  terrainClass: string
  description: string
}

type PlanetaryZone = {
  id: string
  name: string
  planet: PlanetaryBody
  region: string
  latitude: number
  longitude: number
  terrainClass: string
  description: string
}

type DataSummary = {
  totalAnalogSites: number
  totalTargetZones: number
  totalLandmarks: number
  supportedBodies: number
  availableParameters: number
  datasetCount: number
  note: string
}

type MapBody = PlanetaryBody
type PlaceResolution = {
  key: string
  status: 'resolving' | 'resolved' | 'error'
  label: string
  source: string
  error?: string
  attributionUrl?: string
}

const heroScenes = [
  {
    body: 'Earth',
    image: mapSources.Earth.tiles.replace('{z}', '2').replace('{y}', '1').replace('{x}', '1'),
    credit: 'Esri World Imagery',
    sourceUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
  },
  {
    body: 'Moon',
    image: mapSources.Moon.tiles.replace('{z}', '2').replace('{y}', '2').replace('{x}', '2'),
    credit: 'LRO WAC · ASU / NASA PDS',
    sourceUrl: 'https://astro.arcgis.com/arcgis/rest/services/OnMoon/LRO_WAC/MapServer',
  },
  {
    body: 'Mars',
    image: mapSources.Mars.tiles.replace('{z}', '2').replace('{y}', '2').replace('{x}', '2'),
    credit: 'Viking MDIM · NASA / JPL / USGS',
    sourceUrl: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer',
  },
]

const worldSites: WorldSite[] = [
  {
    id: 'atacama',
    name: 'Atacama Desert',
    country: 'Chile',
    region: 'Coastal basin',
    continent: 'South America',
    latitude: -24.2,
    longitude: -69.8,
    terrainClass: 'Hyperarid terrain',
    description: 'High elevation, sparse regolith, and strong evaporitic surfaces make this a useful arid analog.',
  },
  {
    id: 'uyuni',
    name: 'Salar de Uyuni',
    country: 'Bolivia',
    region: 'Bolivian Altiplano',
    continent: 'South America',
    latitude: -20.1,
    longitude: -67.5,
    terrainClass: 'Evaporite plain',
    description: 'Broad salt crust and low relief are relevant for flat reflective terrain surfaces.',
  },
  {
    id: 'patagonia',
    name: 'Patagonia',
    country: 'Argentina',
    region: 'Southern Andes',
    continent: 'South America',
    latitude: -49.6,
    longitude: -72.4,
    terrainClass: 'Mountainous ice-fed valleys',
    description: 'Glacial valleys and high relief terrain provide a rugged and cold end-member comparison.',
  },
  {
    id: 'gobi',
    name: 'Gobi Desert',
    country: 'China / Mongolia',
    region: 'Interior basin',
    continent: 'Asia',
    latitude: 42.1,
    longitude: 103.7,
    terrainClass: 'Continental desert basin',
    description: 'Dusty basins and sparse dune fields create a broad analog for low-vegetation dry regions.',
  },
  {
    id: 'tibet',
    name: 'Tibetan Plateau',
    country: 'China',
    region: 'High plateau',
    continent: 'Asia',
    latitude: 33.4,
    longitude: 88.6,
    terrainClass: 'High-elevation plateau',
    description: 'Cold, elevated plateau terrain demonstrates the effects of uplifted relief and low vegetation.',
  },
  {
    id: 'wadi-rum',
    name: 'Wadi Rum',
    country: 'Jordan',
    region: 'Sandstone desert',
    continent: 'Middle East',
    latitude: 29.6,
    longitude: 35.4,
    terrainClass: 'Arid sandstone terrain',
    description: 'Mesa-like sandstone outcrops and open plains are useful for interpreting exposed rock landscapes.',
  },
  {
    id: 'nefud',
    name: 'Nefud Desert',
    country: 'Saudi Arabia',
    region: 'Dune belt',
    continent: 'Middle East',
    latitude: 28.4,
    longitude: 39.6,
    terrainClass: 'Aeolian sand field',
    description: 'Coarse sand sheets and ridged aeolian forms help compare dune-dominated morphology.',
  },
  {
    id: 'iceland',
    name: 'Iceland Highlands',
    country: 'Iceland',
    region: 'Volcanic plateau',
    continent: 'Europe',
    latitude: 64.7,
    longitude: -18.3,
    terrainClass: 'Basaltic rugged plain',
    description: 'Jagged lava fields and frost-weathered ridges offer an informative volcanic comparison.',
  },
  {
    id: 'etna',
    name: 'Mount Etna',
    country: 'Italy',
    region: 'Active volcanic flank',
    continent: 'Europe',
    latitude: 37.75,
    longitude: 14.99,
    terrainClass: 'Basaltic volcanic cone',
    description: 'Fresh lava textures and steep flanks make this a useful volcanic analog for rough lunar-like controls.',
  },
  {
    id: 'namib',
    name: 'Namib Sand Sea',
    country: 'Namibia',
    region: 'Atlantic coast',
    continent: 'Africa',
    latitude: -24.9,
    longitude: 15.6,
    terrainClass: 'Aeolian dune system',
    description: 'Wind-formed dune systems and strong mineral variability are relevant for sand-rich planetary basins.',
  },
  {
    id: 'sahara',
    name: 'Sahara Desert',
    country: 'Algeria',
    region: 'Erg and hamada',
    continent: 'Africa',
    latitude: 27.4,
    longitude: 5.3,
    terrainClass: 'Hot desert basin',
    description: 'Open sand seas and rocky plains provide a broad dryland comparison for thin atmospheres and exposed surfaces.',
  },
  {
    id: 'danakil',
    name: 'Danakil Depression',
    country: 'Ethiopia',
    region: 'Salt and hydrothermal basin',
    continent: 'Africa',
    latitude: 14.3,
    longitude: 40.3,
    terrainClass: 'Volcanic evaporite basin',
    description: 'Low-relief saline and geothermal terrain is useful for harsh, mineral-rich surface analogs.',
  },
  {
    id: 'hawaii',
    name: 'Hawaii Volcanoes',
    country: 'United States',
    region: 'Shield volcano',
    continent: 'North America',
    latitude: 19.4,
    longitude: -155.3,
    terrainClass: 'Basalt shield',
    description: 'Recent lava flows and cinder-rich slopes reveal the texture and roughness of effusive volcanic surfaces.',
  },
  {
    id: 'death-valley',
    name: 'Death Valley',
    country: 'United States',
    region: 'Basin and range',
    continent: 'North America',
    latitude: 36.5,
    longitude: -116.8,
    terrainClass: 'Closed basin and fault trough',
    description: 'Basins, fans, and steep relief transitions provide a strong comparison for extensional terrain.',
  },
  {
    id: 'mojave',
    name: 'Mojave Desert',
    country: 'United States',
    region: 'Intermontane desert',
    continent: 'North America',
    latitude: 35.1,
    longitude: -116.1,
    terrainClass: 'Rocky desert plain',
    description: 'Semi-arid alluvial plains and rocky uplands are useful for evaluating dryland roughness.',
  },
  {
    id: 'dry-valleys',
    name: 'Dry Valleys',
    country: 'Antarctica',
    region: 'Transantarctic region',
    continent: 'Antarctica',
    latitude: -77.5,
    longitude: 161.6,
    terrainClass: 'Cold desert valley',
    description: 'Ice-free valleys and exposed rock are one of the clearest analogs for high-latitude barren terrain.',
  },
  {
    id: 'pilbara',
    name: 'Pilbara',
    country: 'Australia',
    region: 'Iron-rich plateau',
    continent: 'Oceania',
    latitude: -21.1,
    longitude: 118.2,
    terrainClass: 'Ancient basaltic upland',
    description: 'Iron-rich rocky ranges and mesas resemble old, weathered and structure-rich planetary surfaces.',
  },
  {
    id: 'great-sandy',
    name: 'Great Sandy Desert',
    country: 'Australia',
    region: 'Dune corridor',
    continent: 'Oceania',
    latitude: -24.5,
    longitude: 120.5,
    terrainClass: 'Sand dune field',
    description: 'Large dunes and low vegetation provide a useful analog for dune-covered planetary plains.',
  },
  {
    id: 'negev',
    name: 'Negev Desert',
    country: 'Israel',
    region: 'Rock and gravel desert',
    continent: 'Middle East',
    latitude: 30.3,
    longitude: 34.8,
    terrainClass: 'Stony desert plain',
    description: 'Stony desert surfaces and gravel-bearing basins are relevant to rocky planetary terrain.',
  },
  {
    id: 'andes',
    name: 'Altiplano',
    country: 'Peru / Bolivia',
    region: 'High plateau',
    continent: 'South America',
    latitude: -16.5,
    longitude: -68.1,
    terrainClass: 'High elevation basin',
    description: 'Large elevated basins and eroded slopes allow comparison with dry, uplifted planetary terrain.',
  },
  {
    id: 'karoo',
    name: 'Karoo',
    country: 'South Africa',
    region: 'Semi-arid plateau',
    continent: 'Africa',
    latitude: -31.5,
    longitude: 22.7,
    terrainClass: 'Arid plateau',
    description: 'Plateau surfaces and sparse vegetation provide a useful comparison for dry, old continental terrain.',
  },
  {
    id: 'haughton',
    name: 'Haughton Impact Crater',
    country: 'Canada',
    region: 'Devon Island, Nunavut',
    continent: 'North America',
    latitude: 75.37,
    longitude: -89.68,
    terrainClass: 'Arctic impact structure',
    description: 'A polar-desert impact structure with exposed rock and periglacial conditions; useful for crater-mapping and cold-environment field procedures, not as a temperature or regolith match.',
  },
  {
    id: 'lonar',
    name: 'Lonar Crater',
    country: 'India',
    region: 'Deccan basalt province',
    continent: 'Asia',
    latitude: 19.98,
    longitude: 76.51,
    terrainClass: 'Basaltic impact crater',
    description: 'An impact structure excavated in basalt, offering a focused setting for crater morphology and impact-material mapping; local lake chemistry is not a planetary-water analog by itself.',
  },
]

const planetaryZones: PlanetaryZone[] = [
  {
    id: 'gale',
    name: 'Gale Crater',
    planet: 'Mars',
    region: 'Aeolis Palus',
    latitude: -5.4,
    longitude: 137.8,
    terrainClass: 'Sedimentary crater floor',
    description: 'Layered sedimentary terrain with relief transitions and evidence of aqueous erosion.',
  },
  {
    id: 'imbrium',
    name: 'Mare Imbrium',
    planet: 'Moon',
    region: 'Basaltic plain',
    latitude: 32.8,
    longitude: -15.6,
    terrainClass: 'Lava plain',
    description: 'Broad mare surfaces exhibit low relief and basaltic textures associated with ancient volcanism.',
  },
  {
    id: 'noctis',
    name: 'Noctis Labyrinthus',
    planet: 'Mars',
    region: 'Canyon system',
    latitude: -7.9,
    longitude: -95.7,
    terrainClass: 'Faulted canyon terrain',
    description: 'Highly fractured and steep relief ridges provide a contrast case for rugged canyon landscapes.',
  },
  {
    id: 'aristarchus',
    name: 'Aristarchus Plateau',
    planet: 'Moon',
    region: 'Highland plateau',
    latitude: 24.4,
    longitude: -47.4,
    terrainClass: 'Highland ridge field',
    description: 'Bright highlands, ejecta deposits, and heterogeneous slopes create a lunar highland analog case.',
  },
  {
    id: 'copernicus',
    name: 'Copernicus Crater',
    planet: 'Moon',
    region: 'Imbrian highlands',
    latitude: 9.62,
    longitude: -20.08,
    terrainClass: 'Complex impact crater',
    description: 'Terraced walls, central peaks, and ejecta make this a useful site for crater-morphology and slope-mapping comparisons.',
  },
  {
    id: 'tycho',
    name: 'Tycho Crater',
    planet: 'Moon',
    region: 'Southern highlands',
    latitude: -43.31,
    longitude: -11.36,
    terrainClass: 'Fresh impact crater',
    description: 'A prominent young crater with extensive ejecta, useful for impact mapping and rough-terrain navigation studies within the DEM latitude coverage.',
  },
  {
    id: 'mare-serenitatis',
    name: 'Mare Serenitatis',
    planet: 'Moon',
    region: 'Northeastern near side',
    latitude: 28.0,
    longitude: 17.5,
    terrainClass: 'Basaltic mare plain',
    description: 'A broad mare surface for comparing low-relief volcanic plains with localized wrinkle ridges and crater hazards.',
  },
  {
    id: 'jezero',
    name: 'Jezero Crater',
    planet: 'Mars',
    region: 'Isidis Planitia margin',
    latitude: 18.4,
    longitude: 77.7,
    terrainClass: 'Delta-bearing impact basin',
    description: 'A crater and delta setting for mapping fan-shaped deposits and basin relief; DEM morphology does not establish past habitability or biosignatures.',
  },
  {
    id: 'valles-marineris',
    name: 'Valles Marineris',
    planet: 'Mars',
    region: 'Coprates Chasma',
    latitude: -13.9,
    longitude: -59.2,
    terrainClass: 'Large canyon system',
    description: 'Deep canyon relief and wall slopes provide a rugged-terrain comparison for route screening and elevation-data interpretation.',
  },
  {
    id: 'olympus-mons',
    name: 'Olympus Mons',
    planet: 'Mars',
    region: 'Tharsis volcanic province',
    latitude: 18.65,
    longitude: -133.8,
    terrainClass: 'Shield volcano',
    description: 'A large volcanic edifice with broad flank gradients and summit relief, useful for planetary-scale volcanic landform comparisons.',
  },
  {
    id: 'hellas-planitia',
    name: 'Hellas Planitia',
    planet: 'Mars',
    region: 'Southern hemisphere basin',
    latitude: -42.4,
    longitude: 70.5,
    terrainClass: 'Large impact basin',
    description: 'A deep basin with varied rim and floor terrain, suitable for basin-scale relief and route-planning comparisons.',
  },
  {
    id: 'gusev-crater',
    name: 'Gusev Crater',
    planet: 'Mars',
    region: 'Aeolis quadrangle',
    latitude: -14.6,
    longitude: 175.3,
    terrainClass: 'Impact crater and volcanic plains',
    description: 'A cratered plain traversed by Spirit, useful for comparing rover-scale route context and volcanic surface mapping.',
  },
]

const sourceCards = [
  {
    title: 'Earth · Copernicus DEM GLO-30',
    details: 'Public 30 m digital surface model sampled from Esri’s ImageServer, sourced from ESA/DLR/Airbus. Catalog family: COP-DEM_GLO-30. Elevations use EGM2008; this DSM includes surface objects and is not a bare-earth model. The hosting service does not return a granule ID per sample.',
    url: 'https://di-elevation.img.arcgis.com/arcgis/rest/services/copdemglo30/ImageServer',
  },
  {
    title: 'Moon · LOLA / SELENE-Kaguya',
    details: 'The Esri-hosted LOLA + SELENE/Kaguya merged lunar DEM is nominally 59 m and limited to 60°N–60°S; its service is marked beta. It is not a pure LOLA PDS sample, and per-pixel source lineage is not returned.',
    url: 'https://astro.arcgis.com/arcgis/rest/services/OnMoon/LOLA_Kaguya/ImageServer',
  },
  {
    title: 'Mars · HRSC–MOLA blended DEM',
    details: 'The beta global HRSC + MOLA blended elevation service is nominally 200 m. Service metadata reports roughly 100 m horizontal accuracy and at least ±3 m elevation uncertainty. It is not a pure MOLA MEGDR sample; vertical reference details are not specified.',
    url: 'https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer',
  },
]

const availableTerrainParameters = ['elevation', 'slope', 'roughness', 'localRelief'] as const

const datasetSummary: DataSummary = {
  totalAnalogSites: worldSites.length,
  totalTargetZones: planetaryZones.length,
  totalLandmarks: explorationLandmarks.length,
  supportedBodies: Object.keys(mapSources).length,
  availableParameters: availableTerrainParameters.length,
  datasetCount: sourceCards.length,
  note: 'Catalog coordinates and qualitative terrain descriptions are search locations. Measurements are sampled from public DEMs at comparison time; unsupported measurements remain unavailable.',
}

const planetaryLocations: PlanetaryLocation[] = [
  ...worldSites.map((site) => ({ ...site, body: 'Earth' as const })),
  ...planetaryZones.map((zone) => ({ ...zone, body: zone.planet })),
]

function App() {
  const [selectedSiteId, setSelectedSiteId] = useState(worldSites[0].id)
  const [referenceLocation, setReferenceLocation] = useState(planetaryLocations[0])
  const [targetLocation, setTargetLocation] = useState(planetaryLocations.find((item) => item.body === 'Mars')!)
  const [freeRoamLocation, setFreeRoamLocation] = useState<PlanetaryLocation | null>(null)
  const targetLocationRef = useRef(targetLocation)
  useEffect(() => {
    targetLocationRef.current = targetLocation
  }, [targetLocation])
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [mapFocus, setMapFocus] = useState<ExplorationLandmark | null>(null)
  const selectFreeRoamLocation = useCallback((location: PlanetaryLocation) => {
    setFreeRoamLocation(location)
    setReferenceLocation(location)
    const currentTarget = targetLocationRef.current
    const samePoint = currentTarget.body === location.body
      && Math.abs(currentTarget.latitude - location.latitude) < 0.00001
      && Math.abs(currentTarget.longitude - location.longitude) < 0.00001
    if (currentTarget.id === location.id || samePoint) {
      const alternative = planetaryLocations.find((item) => item.id !== location.id && item.body !== location.body)
        ?? planetaryLocations.find((item) => item.id !== location.id)
      if (alternative) setTargetLocation(alternative)
    }
  }, [])
  const selectEarthAnalog = useCallback((location: PlanetaryLocation, target: PlanetaryLocation) => {
    setFreeRoamLocation(location)
    setReferenceLocation(location)
    setTargetLocation(target)
  }, [])
  const setReferenceById = (id: string) => {
    if (freeRoamLocation?.id === id) {
      setReferenceLocation(freeRoamLocation)
      return
    }
    const location = planetaryLocations.find((item) => item.id === id)
    if (location) setReferenceLocation(location)
  }
  const setTargetById = (id: string) => {
    if (freeRoamLocation?.id === id) {
      setTargetLocation(freeRoamLocation)
      return
    }
    const location = planetaryLocations.find((item) => item.id === id)
    if (location) setTargetLocation(location)
  }
  const selectRandomComparisonLocation = (side: 'reference' | 'target', body: PlanetaryBody): boolean => {
    const current = side === 'reference' ? referenceLocation : targetLocation
    const location = chooseRandomSampleableLocation(planetaryLocations, body, current.id)
    if (!location) return false
    if (side === 'reference') setReferenceLocation(location)
    else setTargetLocation(location)
    return true
  }
  const selectEarthSite = (id: string) => {
    const site = worldSites.find((item) => item.id === id)
    if (!site) return
    setSelectedSiteId(id)
    setReferenceLocation({ ...site, body: 'Earth' })
  }
  const openLandmarkOnMap = (landmark: ExplorationLandmark) => {
    setMapFocus(landmark)
    setReferenceLocation({
      id: `landmark-${landmark.id}`,
      name: landmark.name,
      body: landmark.body,
      latitude: landmark.latitude,
      longitude: landmark.longitude,
      region: 'Historical exploration site',
      terrainClass: landmark.kind,
      description: landmark.description,
      imageQuery: landmark.imageQuery,
    })
  }

  return (
    <BrowserRouter>
      <div className="terra-shell">
        <header className="topbar">
          <NavLink to="/" className="brand-block brand-home" aria-label="TERRA overview">
            <img className="brand-logo" src="/terra-logo.webp" alt="TERRA" />
            <div className="brand-copy">
              <div className="eyebrow">Planetary analog explorer</div>
              <small>Earth · Moon · Mars</small>
            </div>
          </NavLink>

          <nav className="nav-links" aria-label="Main navigation">
            <span className="nav-section-label">Workspace</span>
            <NavLink to="/" end><House size={17} /><span>Overview</span></NavLink>
            <NavLink to="/free-roam"><Map size={17} /><span>Explore map</span></NavLink>
            <NavLink to="/discover"><Compass size={17} /><span>Earth analogs</span></NavLink>
            <NavLink to="/history"><Landmark size={17} /><span>Mission sites</span></NavLink>
            <span className="nav-section-label">Analysis</span>
            <NavLink to="/compare"><Scale size={17} /><span>Compare terrain</span></NavLink>
            <NavLink to="/reports"><FileText size={17} /><span>Research reports</span></NavLink>
            <span className="nav-section-label">Reference</span>
            <NavLink to="/data-methodology"><Database size={17} /><span>Data &amp; methods</span></NavLink>
            <NavLink to="/about"><Info size={17} /><span>About TERRA</span></NavLink>
          </nav>

          <div className="status-pill">EARTH · MOON · MARS</div>
        </header>

        <div className="terra-main">
          <Routes>
            <Route path="/" element={<OverviewPage summary={datasetSummary} selectedSiteId={selectedSiteId} onSelectSite={selectEarthSite} onOpenTutorial={() => setTutorialOpen(true)} />} />
            <Route path="/free-roam" element={<FreeRoamPage locations={planetaryLocations} comparisonTarget={targetLocation} onSelectLocation={selectFreeRoamLocation} onSelectAnalog={selectEarthAnalog} focusLandmark={mapFocus} onClearFocus={setMapFocus} />} />
            <Route path="/discover" element={<DiscoveryPage worldSites={worldSites} selectedSiteId={selectedSiteId} onSelectSite={selectEarthSite} />} />
            <Route path="/history" element={<HistoryPage onOpenLandmark={openLandmarkOnMap} />} />
            <Route path="/compare" element={<ComparisonPage locations={planetaryLocations} reference={referenceLocation} target={targetLocation} freeRoamLocation={freeRoamLocation} onChangeReference={setReferenceById} onChangeTarget={setTargetById} onSelectRandomLocation={selectRandomComparisonLocation} />} />
            <Route path="/reports" element={<ReportsPage reference={referenceLocation} target={targetLocation} />} />
            <Route path="/methodology" element={<DatasetsPage />} />
            <Route path="/data-methodology" element={<DatasetsPage />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
          {tutorialOpen && <TutorialModal onClose={() => setTutorialOpen(false)} />}

          <footer className="site-footer">
            <div>
              <div className="footer-brand-block">
                <img className="footer-logo" src="/terra-logo.webp" alt="TERRA" />
                <span className="eyebrow">Planetary analog explorer</span>
              </div>
              <p>Planetary analog explorer for terrain comparison and scientific context.</p>
            </div>
            <div>
              <h4>Navigation</h4>
              <ul>
                <li><NavLink to="/">Overview</NavLink></li>
                <li><NavLink to="/free-roam">Free roam</NavLink></li>
                <li><NavLink to="/discover">Discover</NavLink></li>
                <li><NavLink to="/history">Historical sites</NavLink></li>
                <li><NavLink to="/compare">Compare</NavLink></li>
              </ul>
            </div>
            <div>
              <h4>Methodology</h4>
              <ul>
                <li><NavLink to="/data-methodology">Data sources</NavLink></li>
                <li><NavLink to="/data-methodology">Terrain methods</NavLink></li>
                <li><NavLink to="/data-methodology">Dataset limits</NavLink></li>
                <li><NavLink to="/reports">Research report</NavLink></li>
              </ul>
            </div>
            <div>
              <h4>Scientific note</h4>
              <p>Similarity scores are explanatory terrain comparisons, not mission-readiness validation.</p>
            </div>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  )
}

function OverviewPage({
  summary,
  selectedSiteId,
  onSelectSite,
  onOpenTutorial,
}: {
  summary: DataSummary
  selectedSiteId: string
  onSelectSite: (id: string) => void
  onOpenTutorial: () => void
}) {
  const [heroSceneIndex, setHeroSceneIndex] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = window.setInterval(() => {
      setHeroSceneIndex((index) => (index + 1) % heroScenes.length)
    }, 6500)
    return () => window.clearInterval(interval)
  }, [])

  const heroScene = heroScenes[heroSceneIndex]

  return (
    <main className="page-shell overview-shell">
      <section className="hero-scene">
        <div className="hero-backdrops" aria-hidden="true">
          {heroScenes.map((scene, index) => (
            <div
              className={`hero-backdrop${index === heroSceneIndex ? ' is-active' : ''}`}
              key={scene.body}
              style={{ backgroundImage: `url("${scene.image}")` }}
            />
          ))}
        </div>
        <div className="hero-scrim" aria-hidden="true" />
        <div className="hero-content">
          <div className="eyebrow-row">
            <span className="eyebrow accent">TERRA / Planetary analog explorer</span>
          </div>

          <h1>Find the right place on Earth to ask a planetary question.</h1>
          <p>
            Explore how real landscapes can illuminate the Moon and Mars—from exposed rock and steep relief
            to ice, dust, and the processes that shape a surface.
          </p>

          <div className="cta-row">
            <NavLink to="/discover" className="btn btn-primary"><Compass size={16} /> Find an Earth analog</NavLink>
            <NavLink to="/free-roam" className="btn btn-secondary"><Map size={16} /> Open the map</NavLink>
            <button type="button" className="btn btn-secondary" onClick={onOpenTutorial}><BookOpen size={16} /> Take a tutorial</button>
          </div>
        </div>

        <div className="hero-factpanel">
          <div className="fact-block fact-primary">
            <span className="fact-label">Field protocol</span>
            <strong>Compare with context</strong>
            <small>Terrain metrics are sampled on demand. A useful analog can match one condition and differ in others.</small>
          </div>

          <div className="fact-grid">
            <div className="fact-block">
              <Earth size={15} />
              <span>Worlds</span>
              <strong>{summary.supportedBodies}</strong>
            </div>
            <div className="fact-block">
              <Satellite size={15} />
              <span>Comparison parameters</span>
              <strong>{summary.availableParameters}</strong>
            </div>
            <div className="fact-block">
              <Database size={15} />
              <span>Indexed locations</span>
              <strong>{summary.totalAnalogSites + summary.totalTargetZones}</strong>
            </div>
            <div className="fact-block">
              <Landmark size={15} />
              <span>Historical sites</span>
              <strong>{summary.totalLandmarks}</strong>
            </div>
            <div className="fact-block">
              <Database size={15} />
              <span>Terrain datasets</span>
              <strong>{summary.datasetCount}</strong>
            </div>
          </div>
        </div>
        <small className="hero-image-credit">
          Orbital map: <a href={heroScene.sourceUrl} target="_blank" rel="noreferrer">{heroScene.body} · {heroScene.credit}</a>
        </small>
      </section>

      <section className="analogy-section">
        <div className="section-header compact-header">
          <p className="eyebrow accent">Start with the science question</p>
          <h2>One landscape rarely tells the whole story.</h2>
          <p>Choose a lens, then look for a location or process that helps answer it. Similarity is specific to the question—not a label applied to an entire place.</p>
        </div>
        <div className="analogy-lenses">
          <NavLink to="/discover" className="analogy-lens">
            <span className="lens-index">01 / MATERIALS</span>
            <h3>Geology &amp; surface</h3>
            <p>Minerals, basalt, salts, regolith, and alteration—what is exposed, and how did it form?</p>
            <span className="lens-action">Browse Earth locations <span aria-hidden="true">→</span></span>
          </NavLink>
          <NavLink to="/compare" className="analogy-lens">
            <span className="lens-index">02 / TERRAIN</span>
            <h3>Relief &amp; operations</h3>
            <p>Elevation, slope, roughness, craters, and local relief for landing, mobility, and field robotics.</p>
            <span className="lens-action">Compare terrain <span aria-hidden="true">→</span></span>
          </NavLink>
          <NavLink to="/data-methodology" className="analogy-lens">
            <span className="lens-index">03 / ENVIRONMENT</span>
            <h3>Extremes &amp; resources</h3>
            <p>Temperature, illumination, water, ice, permafrost, aerosols, and the limits of each dataset.</p>
            <span className="lens-action">Review data &amp; methods <span aria-hidden="true">→</span></span>
          </NavLink>
          <NavLink to="/discover" className="analogy-lens">
            <span className="lens-index">04 / PROCESSES</span>
            <h3>Change &amp; habitability</h3>
            <p>Dust, wind, erosion, volcanism, sedimentation, caves, subsurface settings, and biosignatures.</p>
            <span className="lens-action">Explore candidate sites <span aria-hidden="true">→</span></span>
          </NavLink>
        </div>
        <p className="analogy-caveat"><Info size={15} /> These are research lenses, not current TERRA score categories. The live comparison samples elevation-derived terrain metrics; environmental, geochemical, biological, and subsurface properties need their own evidence.</p>
      </section>

      <section className="field-sites">
        <div className="section-header compact-header">
          <div>
            <p className="eyebrow accent">Field notes / beyond the familiar</p>
            <h2>Start small. Compare the feature, not the continent.</h2>
          </div>
          <NavLink to="/discover" className="text-link">View the full analog inventory <span aria-hidden="true">→</span></NavLink>
        </div>
        <div className="mission-grid">
          {worldSites.filter((site) => ['dry-valleys', 'pilbara', 'karoo'].includes(site.id)).map((analog) => (
            <NavLink
              to="/discover"
              className={`feature-tile field-site-card${analog.id === selectedSiteId ? ' is-selected' : ''}`}
              key={analog.id}
              onClick={() => onSelectSite(analog.id)}
            >
              <div className="feature-header">
                <span className="tile-tag">{analog.terrainClass}</span>
                <span className="tile-tag">{analog.country}</span>
              </div>
              <h3>{analog.name}</h3>
              <p>{analog.description}</p>
              <div className="tile-meta">
                <span>{analog.latitude.toFixed(2)}, {analog.longitude.toFixed(2)}</span>
                <span>Candidate · not pre-scored</span>
              </div>
              <span className="lens-action">Open field note <span aria-hidden="true">→</span></span>
            </NavLink>
          ))}
        </div>
      </section>

      <section className="how-terra-works">
        <div className="section-header compact-header">
          <p className="eyebrow accent">A practical workflow</p>
          <h2>How TERRA works</h2>
        </div>
        <div className="workflow-grid">
          {[
            { number: '01', title: 'Select a location', text: 'Choose a catalog point or a coordinate on an available map.' },
            { number: '02', title: 'Sample terrain', text: 'Request elevation data and derive terrain measurements at the selected point.' },
            { number: '03', title: 'Compare carefully', text: 'Review the measurements that are actually comparable, with source and coverage notes.' },
            { number: '04', title: 'Share the result', text: 'Inspect the methods and export the measured comparison as CSV or PDF.' },
          ].map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="insight-row">
        <div className="panel-block">
          <div className="panel-head">
            <Gauge size={18} />
            <h2>Scientific interpretation</h2>
          </div>
          <ul className="bullet-list">
            <li>Scores use only available, comparable measurements.</li>
            <li>Elevation values are not compared across planetary datums.</li>
            <li>Unavailable sources and parameters remain visibly unavailable.</li>
          </ul>
        </div>

        <div className="panel-block">
          <div className="panel-head">
            <Database size={18} />
            <h2>Dataset note</h2>
          </div>
          <p>{summary.note}</p>
        </div>
      </section>
    </main>
  )
}

function DiscoveryPage({
  worldSites,
  selectedSiteId,
  onSelectSite,
}: {
  worldSites: WorldSite[]
  selectedSiteId: string
  onSelectSite: (value: string) => void
}) {
  const selectedSite = worldSites.find((site) => site.id === selectedSiteId)

  return (
    <main className="page-shell">
      <div className="section-header">
        <p className="eyebrow accent">Earth analog inventory</p>
        <h2>Discover candidate terrain</h2>
        <p>These curated points are candidates for comparison, not pre-ranked analogues. TERRA samples terrain when you open a comparison; no similarity values are fabricated or precomputed here.</p>
      </div>

      <div className="site-grid">
        {worldSites.map((site) => (
          <button type="button" key={site.id} className={`site-card ${selectedSiteId === site.id ? 'selected' : ''}`} onClick={() => onSelectSite(site.id)}>
            <div className="site-card-top">
              <span className="tile-tag">{site.terrainClass}</span>
              <span className="mini-score">{site.country}</span>
            </div>
            <h3>{site.name}</h3>
            <p>{site.region}</p>
            <small>{site.description}</small>
            <div className="tile-meta">
              <span>{site.latitude.toFixed(3)}, {site.longitude.toFixed(3)}</span>
              <span>Surface metrics sampled on demand</span>
            </div>
          </button>
        ))}
      </div>
      {selectedSite && (
        <section className="discovery-selection panel-block">
          <div className="panel-head"><Compass size={18} /><h3>Selected candidate</h3></div>
          <p>{selectedSite.name} is selected as the Earth reference location. Choose an available lunar or Martian target in Compare to request current measurements.</p>
          <NavLink to="/compare" className="btn btn-primary">Compare this location</NavLink>
        </section>
      )}
    </main>
  )
}

function HistoryPage({ onOpenLandmark }: { onOpenLandmark: (landmark: ExplorationLandmark) => void }) {
  const [bodyFilter, setBodyFilter] = useState<PlanetaryBody | 'All'>('All')
  const visibleLandmarks = bodyFilter === 'All'
    ? explorationLandmarks
    : explorationLandmarks.filter((landmark) => landmark.body === bodyFilter)

  return (
    <main className="page-shell">
      <div className="section-header">
        <p className="eyebrow accent">Confirmed exploration locations</p>
        <h2>Historical planetary sites</h2>
        <p>A curated set of confirmed crewed and robotic landing locations. These markers show landing sites, not bases or the current position of a moving rover.</p>
      </div>
      <div className="history-filters" role="group" aria-label="Filter historical sites by world">
        {(['All', 'Moon', 'Mars'] as const).map((body) => (
          <button type="button" className={bodyFilter === body ? 'active' : ''} key={body} onClick={() => setBodyFilter(body)}>
            {body}
          </button>
        ))}
        <span>{visibleLandmarks.length} sites shown</span>
      </div>
      <div className="history-grid">
        {visibleLandmarks.map((landmark) => (
          <article className="history-card" key={landmark.id}>
            <div className="history-card-heading">
              <span className="landmark-kind">{landmark.kind}</span>
              <span>{landmark.body}</span>
            </div>
            <h3>{landmark.name}</h3>
            <p>{landmark.description}</p>
            <dl>
              <div><dt>Coordinates</dt><dd>{landmark.latitude.toFixed(4)}°, {landmark.longitude.toFixed(4)}°</dd></div>
              <div><dt>Landing date</dt><dd>{landmark.date}</dd></div>
              <div><dt>Organization</dt><dd>{landmark.organization}</dd></div>
              <div><dt>Status</dt><dd>{landmark.status}</dd></div>
            </dl>
            <div className="history-card-actions">
              <NavLink to="/free-roam" className="btn btn-primary" onClick={() => onOpenLandmark(landmark)}>Open in map</NavLink>
              <a href={landmark.sourceUrl} target="_blank" rel="noreferrer">Source: {landmark.sourceName}</a>
            </div>
          </article>
        ))}
      </div>
      <p className="history-note">The catalog is selective, not exhaustive. Coordinates identify landing sites; they do not represent rover traverse endpoints or current mission positions.</p>
    </main>
  )
}

function FreeRoamPage({
  locations,
  comparisonTarget,
  onSelectLocation,
  onSelectAnalog,
  focusLandmark,
  onClearFocus,
}: {
  locations: PlanetaryLocation[]
  comparisonTarget: PlanetaryLocation
  onSelectLocation: (location: PlanetaryLocation) => void
  onSelectAnalog: (location: PlanetaryLocation, target: PlanetaryLocation) => void
  focusLandmark: ExplorationLandmark | null
  onClearFocus: (value: null) => void
}) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const [initialMapTarget] = useState<[number, number] | null>(
    () => focusLandmark ? [focusLandmark.longitude, focusLandmark.latitude] : null,
  )
  const [selectedBody, setSelectedBody] = useState<MapBody>(() => focusLandmark?.body ?? 'Earth')
  const [selectedLocation, setSelectedLocation] = useState<PlanetaryLocation>(() => focusLandmark ? locationForLandmark(focusLandmark) : locations[0])
  const [selectedLandmark, setSelectedLandmark] = useState<ExplorationLandmark | null>(focusLandmark)
  const [mapFocusCoordinate, setMapFocusCoordinate] = useState<[number, number] | null>(null)
  const [showCatalogMarkers, setShowCatalogMarkers] = useState(true)
  const [showLandmarkMarkers, setShowLandmarkMarkers] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [placeResolution, setPlaceResolution] = useState<PlaceResolution | null>(null)
  const markersRef = useRef<Array<{ marker: maplibregl.Marker; kind: 'catalog' | 'landmark'; locationId: string }>>([])
  const selectedCoordinateMarkerRef = useRef<maplibregl.Marker | null>(null)
  const mapInstanceRef = useRef<maplibregl.Map | null>(null)
  const markerVisibilityRef = useRef({ catalog: showCatalogMarkers, landmark: showLandmarkMarkers })
  const selectedLocationRef = useRef(selectedLocation)
  useEffect(() => {
    selectedLocationRef.current = selectedLocation
  }, [selectedLocation])
  const mapSource = mapSources[selectedBody]
  const bodyLocations = useMemo(
    () => locations.filter((location) => location.body === selectedBody),
    [locations, selectedBody],
  )
  const bodyLandmarks = useMemo(
    () => explorationLandmarks.filter((landmark) => landmark.body === selectedBody),
    [selectedBody],
  )
  const analogTarget = selectedLocation.body !== 'Earth'
    ? selectedLocation
    : comparisonTarget.body !== 'Earth' ? comparisonTarget : null
  const analogState = useEarthAnalogMatches(analogTarget, locations)
  const analogMatchesRef = useRef(analogState.matches)

  const updateAnalogMarkers = useCallback(() => {
    const topMatches = new globalThis.Map(analogMatchesRef.current.slice(0, 5).map((match) => [
      match.location.id,
      match.similarity,
    ]))
    markersRef.current.forEach(({ marker, kind, locationId }) => {
      if (kind !== 'catalog') return
      const element = marker.getElement()
      const score = topMatches.get(locationId)
      element.classList.toggle('is-analog-match', score !== undefined)
      if (score === undefined) {
        delete element.dataset.score
        element.title = element.dataset.defaultTitle ?? ''
      } else {
        element.dataset.score = `${score.toFixed(1)}%`
        element.title = `${element.dataset.defaultTitle ?? 'Earth analog'} · ${score.toFixed(1)}% similarity`
      }
    })
  }, [])

  const placeResolutionKey = `${selectedLocation.body}:${selectedLocation.id}`
  const selectedPlaceResolution = useMemo(() => {
    if (!selectedLocation.isCoordinatePick) return null
    if (placeResolution?.key === placeResolutionKey) return placeResolution
    if (selectedLocation.body === 'Earth') {
      return {
        key: placeResolutionKey,
        status: 'resolving' as const,
        label: 'Resolving place name…',
        source: 'OpenStreetMap Nominatim',
      }
    }

    const features = [
      ...locations
        .filter((location) => location.body === selectedLocation.body)
        .map(({ name, latitude, longitude }) => ({ name, latitude, longitude })),
      ...explorationLandmarks
        .filter((landmark) => landmark.body === selectedLocation.body)
        .map(({ name, latitude, longitude }) => ({ name, latitude, longitude })),
    ]
    const nearest = nearestNamedFeature(selectedLocation, features, selectedLocation.body)
    return {
      key: placeResolutionKey,
      status: 'resolved' as const,
      label: nearest
        ? `${nearest.name} · approximately ${nearest.distanceKm.toFixed(1)} km away`
        : 'No named feature in TERRA’s current catalog',
      source: 'Nearest TERRA reference; not official reverse geocoding',
    }
  }, [locations, placeResolutionKey, placeResolution, selectedLocation])

  useEffect(() => {
    if (
      !selectedLocation.isCoordinatePick
      || selectedLocation.body !== 'Earth'
      || selectedLocation.name !== 'Map-picked location'
    ) return
    const lookupLocation = selectedLocation
    const key = `${lookupLocation.body}:${lookupLocation.id}`
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      reverseGeocodeEarth(lookupLocation, controller.signal)
        .then((result) => {
          if (controller.signal.aborted) return
          const resolvedLocation = { ...lookupLocation, name: result.name }
          setSelectedLocation((current) => current.id === lookupLocation.id ? resolvedLocation : current)
          onSelectLocation(resolvedLocation)
          setPlaceResolution({
            key,
            status: 'resolved',
            label: result.name,
            source: 'OpenStreetMap Nominatim',
            attributionUrl: result.attributionUrl,
          })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setPlaceResolution({
            key,
            status: 'error',
            label: 'Place name unavailable',
            source: 'OpenStreetMap Nominatim',
            error: error instanceof Error ? error.message : String(error),
            attributionUrl: 'https://www.openstreetmap.org/copyright',
          })
        })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [onSelectLocation, selectedLocation])

  useEffect(() => {
    markersRef.current.forEach(({ marker, locationId }) => {
      marker.getElement().classList.toggle('is-selected', locationId === selectedLocation.id)
    })
  }, [selectedLocation])

  useEffect(() => {
    analogMatchesRef.current = analogState.matches
    updateAnalogMarkers()
  }, [analogState.matches, updateAnalogMarkers])

  useEffect(() => {
    if (!mapRef.current) return
    let cancelled = false
    let map: maplibregl.Map | null = null
    const currentMarkers: Array<{ marker: maplibregl.Marker; kind: 'catalog' | 'landmark'; locationId: string }> = []

    import('maplibre-gl').then((maplibre) => {
      if (cancelled || !mapRef.current) return
      maplibre.setWorkerUrl(maplibreWorkerUrl)
      map = new maplibre.Map({
        container: mapRef.current,
        style: {
          version: 8,
          sources: {
            surface: {
              type: 'raster',
              tiles: [mapSource.tiles],
              tileSize: mapSource.tileSize,
              attribution: mapSource.attribution,
            },
          },
          layers: [{ id: 'surface-imagery', type: 'raster', source: 'surface' }],
        },
        center: selectedBody === 'Earth' && mapFocusCoordinate
          ? mapFocusCoordinate
          : initialMapTarget ?? mapSource.center,
        zoom: selectedBody === 'Earth' && mapFocusCoordinate
          ? Math.max(mapSource.zoom, 4)
          : initialMapTarget ? Math.max(mapSource.zoom, 2.5) : mapSource.zoom,
        maxZoom: mapSource.maxZoom,
        attributionControl: { compact: true },
      })
      mapInstanceRef.current = map

      const makePopup = (title: string, detail: string, coordinates: string) => {
        const content = document.createElement('div')
        content.className = 'terra-map-popup'
        const heading = document.createElement('strong')
        heading.textContent = title
        const description = document.createElement('span')
        description.textContent = detail
        const coordinateText = document.createElement('span')
        coordinateText.textContent = coordinates
        content.append(heading, description, coordinateText)
        return new maplibre.Popup({ offset: 18 }).setDOMContent(content)
      }

      bodyLocations.forEach((location) => {
        const popup = makePopup(
          location.name,
          `${location.region} · ${location.terrainClass} · Similarity is sampled on demand in Compare.`,
          `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`,
        )
        const element = document.createElement('button')
        element.type = 'button'
        element.className = `map-catalog-marker ${selectedLocationRef.current.id === location.id ? 'is-selected' : ''}`
        element.dataset.body = selectedBody.toLowerCase()
        element.dataset.defaultTitle = `${location.name} · ${location.terrainClass}`
        element.setAttribute('aria-label', `${location.name}, ${location.region}`)
        element.title = `${location.name} · ${location.terrainClass}`
        const marker = new maplibre.Marker({ element, anchor: 'center' })
          .setLngLat([location.longitude, location.latitude])
          .setPopup(popup)
          .addTo(map!)
        marker.getElement().style.display = markerVisibilityRef.current.catalog ? '' : 'none'
        marker.getElement().addEventListener('mouseenter', () => popup.addTo(map!))
        marker.getElement().addEventListener('mouseleave', () => popup.remove())
        element.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          selectedCoordinateMarkerRef.current?.remove()
          selectedCoordinateMarkerRef.current = null
          setMapFocusCoordinate(null)
          markersRef.current.forEach(({ marker: item }) => item.getElement().classList.remove('is-selected'))
          element.classList.add('is-selected')
          setSelectedLocation(location)
          setSelectedLandmark(null)
          onClearFocus(null)
          onSelectLocation(location)
          mapInstanceRef.current?.flyTo({ center: [location.longitude, location.latitude], zoom: Math.max(mapInstanceRef.current.getZoom(), 2.5) })
        })
        currentMarkers.push({ marker, kind: 'catalog', locationId: location.id })
      })

      bodyLandmarks.forEach((landmark) => {
        const location = locationForLandmark(landmark)
        const popup = makePopup(
          landmark.name,
          `${landmark.kind} · ${landmark.date} · ${landmark.status}`,
          `${landmark.latitude.toFixed(3)}, ${landmark.longitude.toFixed(3)}`,
        )
        const element = document.createElement('button')
        element.type = 'button'
        element.className = `map-landmark-marker ${selectedLocationRef.current.id === location.id ? 'is-selected' : ''}`
        element.setAttribute('aria-label', `${landmark.name}, ${landmark.kind}`)
        element.title = `${landmark.name} · ${landmark.date}`
        const marker = new maplibre.Marker({ element, anchor: 'center' })
          .setLngLat([landmark.longitude, landmark.latitude])
          .setPopup(popup)
          .addTo(map!)
        marker.getElement().style.display = markerVisibilityRef.current.landmark ? '' : 'none'
        marker.getElement().addEventListener('mouseenter', () => popup.addTo(map!))
        marker.getElement().addEventListener('mouseleave', () => popup.remove())
        marker.getElement().addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          selectedCoordinateMarkerRef.current?.remove()
          selectedCoordinateMarkerRef.current = null
          setMapFocusCoordinate(null)
          markersRef.current.forEach(({ marker: item }) => item.getElement().classList.remove('is-selected'))
          element.classList.add('is-selected')
          setSelectedLocation(location)
          setSelectedLandmark(landmark)
          onClearFocus(null)
          onSelectLocation(location)
          mapInstanceRef.current?.flyTo({ center: [landmark.longitude, landmark.latitude], zoom: Math.max(mapInstanceRef.current.getZoom(), 2.5) })
        })
        currentMarkers.push({ marker, kind: 'landmark', locationId: location.id })
      })

      markersRef.current = currentMarkers
      updateAnalogMarkers()
      map.on('click', (event) => {
        const wrappedLongitude = ((event.lngLat.lng + 180) % 360 + 360) % 360 - 180
        const location: PlanetaryLocation = {
          id: `map-${selectedBody.toLowerCase()}-${event.lngLat.lat.toFixed(5)}-${wrappedLongitude.toFixed(5)}`,
          name: 'Map-picked location',
          isCoordinatePick: true,
          body: selectedBody,
          latitude: event.lngLat.lat,
          longitude: wrappedLongitude,
          region: 'Selected on the map',
          terrainClass: 'Coordinate sample',
          description: `A location selected on the ${selectedBody} map. Terrain values are sampled from the associated public DEM.`,
        }
        selectedCoordinateMarkerRef.current?.remove()
        setMapFocusCoordinate(null)
        markersRef.current.forEach(({ marker }) => marker.getElement().classList.remove('is-selected'))
        const selectedPoint = document.createElement('div')
        selectedPoint.className = 'map-selection-marker'
        selectedPoint.setAttribute('role', 'img')
        selectedPoint.setAttribute('aria-label', `Selected ${selectedBody} map location`)
        selectedPoint.title = `Selected ${selectedBody} location · ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
        selectedCoordinateMarkerRef.current = new maplibre.Marker({ element: selectedPoint, anchor: 'center' })
          .setLngLat([wrappedLongitude, event.lngLat.lat])
          .addTo(map!)
        setSelectedLocation(location)
        setSelectedLandmark(null)
        onClearFocus(null)
        onSelectLocation(location)
        map?.flyTo({ center: [wrappedLongitude, event.lngLat.lat], zoom: Math.max(map.getZoom(), 2.5) })
      })
    }).catch((error: unknown) => {
      if (!cancelled) setMapError(error instanceof Error ? error.message : String(error))
    })

    return () => {
      cancelled = true
      currentMarkers.forEach(({ marker }) => marker.remove())
      selectedCoordinateMarkerRef.current?.remove()
      selectedCoordinateMarkerRef.current = null
      markersRef.current = []
      mapInstanceRef.current = null
      map?.remove()
    }
  }, [bodyLandmarks, bodyLocations, initialMapTarget, mapFocusCoordinate, mapSource, onClearFocus, onSelectLocation, selectedBody, updateAnalogMarkers])

  useEffect(() => {
    markerVisibilityRef.current = { catalog: showCatalogMarkers, landmark: showLandmarkMarkers }
    markersRef.current.forEach(({ marker, kind }) => {
      marker.getElement().style.display = kind === 'catalog'
        ? showCatalogMarkers ? '' : 'none'
        : showLandmarkMarkers ? '' : 'none'
    })
  }, [showCatalogMarkers, showLandmarkMarkers])

  const changeBody = (body: MapBody) => {
    setMapError(null)
    setSelectedBody(body)
    setSelectedLandmark(null)
    setMapFocusCoordinate(null)
    selectedCoordinateMarkerRef.current?.remove()
    selectedCoordinateMarkerRef.current = null
    onClearFocus(null)
    const firstLocation = locations.find((location) => location.body === body)
    if (firstLocation) {
      setSelectedLocation(firstLocation)
      onSelectLocation(firstLocation)
    }
  }
  const choosePredefinedLocation = (id: string) => {
    const location = bodyLocations.find((item) => item.id === id)
    const landmark = bodyLandmarks.find((item) => `landmark-${item.id}` === id)
    const selected = location ?? (landmark ? locationForLandmark(landmark) : null)
    if (!selected) return
    selectedCoordinateMarkerRef.current?.remove()
    selectedCoordinateMarkerRef.current = null
    setMapFocusCoordinate(null)
    setSelectedLocation(selected)
    setSelectedLandmark(landmark ?? null)
    onClearFocus(null)
    onSelectLocation(selected)
    mapInstanceRef.current?.flyTo({
      center: [selected.longitude, selected.latitude],
      zoom: Math.max(mapInstanceRef.current.getZoom(), 2.5),
    })
  }
  const chooseRandomCatalogLocation = () => {
    const halfWindowDegrees = 500 / (Math.PI * (selectedBody === 'Moon' ? 1737400 : 6371008.8) / 180)
    const candidates = [
      ...bodyLocations.map((location) => ({ id: location.id, latitude: location.latitude })),
      ...bodyLandmarks.map((landmark) => ({ id: `landmark-${landmark.id}`, latitude: landmark.latitude })),
    ].filter(({ latitude }) => selectedBody !== 'Moon' || Math.abs(latitude) + halfWindowDegrees <= 60)
    const alternatives = candidates.filter((candidate) => candidate.id !== selectedPlaceId)
    const pool = alternatives.length ? alternatives : candidates
    const selected = pool[Math.floor(Math.random() * pool.length)]
    if (selected) choosePredefinedLocation(selected.id)
  }
  const showEarthAnalog = (location: PlanetaryLocation) => {
    setMapError(null)
    setSelectedBody('Earth')
    setSelectedLocation(location)
    setSelectedLandmark(null)
    setShowCatalogMarkers(true)
    setMapFocusCoordinate([location.longitude, location.latitude])
    selectedCoordinateMarkerRef.current?.remove()
    selectedCoordinateMarkerRef.current = null
    onClearFocus(null)
    if (analogTarget) onSelectAnalog(location, analogTarget)
  }
  const selectedPlaceId = selectedLandmark
    ? `landmark-${selectedLandmark.id}`
    : bodyLocations.some((location) => location.id === selectedLocation.id) ? selectedLocation.id : ''

  return (
    <main className="page-shell">
      <div className="section-header map-header">
        <div>
          <p className="eyebrow accent">Map exploration</p>
          <h2>Explore three worlds</h2>
          <p>Choose a catalog marker or click anywhere on the map to select a DEM sampling location.</p>
        </div>
      </div>

      <div className="body-switcher" role="group" aria-label="Choose a world map">
        <button type="button" className={selectedBody === 'Earth' ? 'active' : ''} onClick={() => changeBody('Earth')}>
          <Earth size={18} /><span>Earth</span><small>World imagery</small>
        </button>
        <button type="button" className={selectedBody === 'Moon' ? 'active' : ''} onClick={() => changeBody('Moon')}>
          <Moon size={18} /><span>Moon</span><small>LRO WAC mosaic</small>
        </button>
        <button type="button" className={selectedBody === 'Mars' ? 'active' : ''} onClick={() => changeBody('Mars')}>
          <Globe2 size={18} /><span>Mars</span><small>Viking MDIM mosaic</small>
        </button>
      </div>

      <div className="map-layer-controls" aria-label="Map layers">
        <label><input type="checkbox" checked={showCatalogMarkers} onChange={(event) => setShowCatalogMarkers(event.target.checked)} /> Catalog locations <span className="legend-dot analog-dot" /></label>
        <label><input type="checkbox" checked={showLandmarkMarkers} onChange={(event) => setShowLandmarkMarkers(event.target.checked)} /> Exploration landmarks <span className="legend-dot history-dot" /></label>
        <span className="map-layer-count">{bodyLocations.length} catalog · {bodyLandmarks.length} landmarks</span>
      </div>
      <div className="map-location-picker">
        <label>
          <span>Jump to a predefined location</span>
          <select value={selectedPlaceId} onChange={(event) => choosePredefinedLocation(event.target.value)}>
            <option value="" disabled>{selectedLocation.name === 'Map-picked location' ? 'Map-picked coordinates' : 'Choose a location'}</option>
            <optgroup label="Catalog locations">
              {bodyLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </optgroup>
            <optgroup label="Exploration landmarks">
              {bodyLandmarks.map((landmark) => <option key={landmark.id} value={`landmark-${landmark.id}`}>{landmark.name}</option>)}
            </optgroup>
          </select>
        </label>
        <button type="button" className="btn btn-secondary" onClick={chooseRandomCatalogLocation}>
          <Shuffle size={16} /> Random sampleable site
        </button>
      </div>

      <div className="map-shell">
        <div className="map-card">
          <div ref={mapRef} className="map-container" />
          {mapError && <p className="map-error" role="alert">Map failed to load: {mapError}</p>}
        </div>

        <aside className="map-overlay-panel">
          <p className="eyebrow accent">Selected {selectedBody} location</p>
          <h3>{selectedLocation.name}</h3>
          <div className="detail-grid">
            <div><span>Latitude</span><strong>{formatCoordinate(selectedLocation.latitude)}</strong></div>
            <div><span>Longitude</span><strong>{formatCoordinate(selectedLocation.longitude)}</strong></div>
            <div><span>Region</span><strong>{selectedLocation.region}</strong></div>
            <div><span>Terrain</span><strong>{selectedLocation.terrainClass}</strong></div>
          </div>
          {selectedLocation.isCoordinatePick && selectedPlaceResolution && (
            <div className="place-resolution" aria-live="polite">
              <span>Place name</span>
              <strong>{selectedPlaceResolution.label}</strong>
              <small>
                {selectedPlaceResolution.status === 'resolving' ? 'Coordinates are shown immediately; name lookup is in progress. ' : ''}
                {selectedPlaceResolution.source}
                {selectedPlaceResolution.attributionUrl && <> · <a href={selectedPlaceResolution.attributionUrl} target="_blank" rel="noreferrer">Attribution</a></>}
              </small>
              {selectedPlaceResolution.error && <small role="status">{selectedPlaceResolution.error}</small>}
            </div>
          )}
          <p>{selectedLocation.description}</p>
          {selectedLandmark && (
            <div className="selected-landmark-details">
              <span className="landmark-kind">{selectedLandmark.kind}</span>
              <p><strong>Date:</strong> {selectedLandmark.date}</p>
              <p><strong>Organization:</strong> {selectedLandmark.organization}</p>
              <p><strong>Status:</strong> {selectedLandmark.status}</p>
              <a href={selectedLandmark.sourceUrl} target="_blank" rel="noreferrer">Source: {selectedLandmark.sourceName}</a>
            </div>
          )}
          <small>{mapSource.attribution}</small>
          <p className="map-compare-note">
            Compare <strong>{selectedLocation.name}</strong> with <strong>{comparisonTarget.name}</strong> ({comparisonTarget.body}).
          </p>
          {analogTarget && (
            <section className="map-analog-panel" aria-live="polite">
              <h4>Top Earth analogs</h4>
              <p>Exploratory rankings for {analogTarget.name}, based on currently available terrain measurements.</p>
              {analogState.status === 'loading' && (
                <p role="status">Sampling Earth sites… {analogState.processed}/{analogState.total}</p>
              )}
              {analogState.status === 'unavailable' && (
                <p role="status">No ranking available: {analogState.error}</p>
              )}
              {analogState.matches.length > 0 && (
                <ol>
                  {analogState.matches.slice(0, 5).map((match) => (
                    <li key={match.location.id}>
                      <button type="button" onClick={() => showEarthAnalog(match.location)}>
                        <span>{match.location.name}</span>
                        <strong>{match.similarity.toFixed(1)}%</strong>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
              {analogState.status === 'ready' && analogState.matches.length === 0 && (
                <p>No Earth analog score could be calculated from the available measurements.</p>
              )}
              {analogState.failedCount > 0 && (
                <small>{analogState.failedCount} Earth site sample(s) were unavailable and excluded.</small>
              )}
              <small>
                Results use the active elevation services. Lunar values come from a LOLA–Kaguya blend and Martian values from an HRSC–MOLA blend; neither is a pure PDS LOLA/MEGDR sample.
              </small>
            </section>
          )}
          <NavLink to="/compare" className="btn btn-primary map-compare-link">Compare selected location</NavLink>
        </aside>
      </div>
      <LocationImages location={selectedLocation} />
    </main>
  )
}

function locationForLandmark(landmark: ExplorationLandmark): PlanetaryLocation {
  return {
    id: `landmark-${landmark.id}`,
    name: landmark.name,
    body: landmark.body,
    latitude: landmark.latitude,
    longitude: landmark.longitude,
    region: 'Historical exploration site',
    terrainClass: landmark.kind,
    description: landmark.description,
    imageQuery: landmark.imageQuery,
  }
}

function DatasetsPage() {
  return (
    <main className="page-shell">
      <div className="section-header">
        <p className="eyebrow accent">Data and methodology</p>
        <h2>Products, calculations, and limits</h2>
        <p>Documented data sources and calculations currently implemented in TERRA. Map imagery is separate from terrain measurements.</p>
      </div>

      <div className="source-grid">
        {sourceCards.map((card) => (
          <article className="info-card" key={card.title}>
            <div className="card-head"><Database size={18} /></div>
            <h3>{card.title}</h3>
            <p>{card.details}</p>
            <a href={card.url} target="_blank" rel="noreferrer">Open dataset service</a>
          </article>
        ))}
      </div>

      <section className="panel-block methodology-section">
        <div className="panel-head"><Database size={18} /><h3>What TERRA actually retrieves</h3></div>
        <p>
          Earth elevation is requested from the Copernicus DEM GLO-30 Esri ImageServer using its
          <code> getSamples </code> operation. It is not retrieved through OpenTopography or a direct Copernicus Data Space download.
          Moon and Mars elevations use cached LERC tiles from the identified image services, decoded in the browser.
          The lunar and Mars services are blends, not pure LOLA- or MEGDR-only products. Their service metadata does not return a PDS granule identifier for a sample. Official PDS catalog links document upstream datasets but are not proof of per-pixel lineage.
        </p>
        <p>
          Clicked Earth coordinates are shown immediately and optionally reverse-geocoded through OpenStreetMap Nominatim, with an in-memory cache and at most one lookup per second. Planetary points are labeled only by the nearest entry in TERRA’s small catalog; that is not official IAU reverse geocoding. Place-name lookup may take longer than one second or fail.
        </p>
        <p>
          The browser cannot fetch raw PDS LOLA/MOLA rasters directly because the archive endpoints do not advertise cross-origin access. Strict sampling from LRO LOLA GDR and MGS MOLA MEGDR requires a maintained server-side proxy or data API; it is not claimed as integrated.
        </p>
        <div className="official-links">
          <a href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer">Copernicus Data Space</a>
          <a href="https://spacedata.copernicus.eu/" target="_blank" rel="noreferrer">Copernicus DEM program</a>
          <a href="https://opentopography.org/" target="_blank" rel="noreferrer">OpenTopography (not queried by TERRA)</a>
          <a href="https://pds-geosciences.wustl.edu/" target="_blank" rel="noreferrer">NASA PDS Geosciences Node</a>
          <a href="https://lunar.gsfc.nasa.gov/science/LOLA.html" target="_blank" rel="noreferrer">LRO LOLA instrument</a>
          <a href="https://pds-geosciences.wustl.edu/missions/mgs/mola.html" target="_blank" rel="noreferrer">MOLA archive</a>
        </div>
      </section>

      <section className="panel-block methodology-section">
        <div className="panel-head"><Gauge size={18} /><h3>Sampling and processing flow</h3></div>
        <ol className="methodology-steps">
          <li>Choose any catalog location or click a coordinate on an Earth, Moon, or Mars map.</li>
          <li>Validate latitude and longitude against the body and source coverage.</li>
          <li>Request a 3×3 set of nearest-neighbor elevation samples spanning a 1 km window, at 500 m spacing.</li>
          <li>Keep NoData cells as missing; show source errors instead of substituting values.</li>
          <li>Calculate center elevation, four-neighbor central-difference slope, population elevation standard deviation, and local max-minus-min relief.</li>
          <li>Check each parameter for missing measurements and physical comparability before calculating a similarity.</li>
          <li>Average only valid comparable parameter scores with equal weights, then show per-parameter diagnostics and provenance.</li>
        </ol>
        <p>
          Horizontal offsets use a spherical approximation with the selected body’s radius and a latitude correction for east-west distance.
          DEM points are sampled independently at their service grid spacing; no resampling or interpolation is applied to force a common native resolution.
          Slope and roughness comparisons therefore remain sensitive to different product resolutions and source uncertainties.
        </p>
      </section>

      <section className="panel-block methodology-section">
        <div className="panel-head"><Scale size={18} /><h3>Formulas and score interpretation</h3></div>
        <div className="formula-list">
          <p><strong>Slope:</strong> p = (zE − zW) / 1000 m; q = (zS − zN) / 1000 m; θ = atan(√(p² + q²)) × 180/π.</p>
          <p><strong>Roughness:</strong> R = √(Σ(zi − z̄)² / n), population standard deviation of at least two valid cells in the 3×3 window.</p>
          <p><strong>Local relief:</strong> LR = zmax − zmin over at least two valid cells in the same window.</p>
          <p><strong>Positive roughness and relief:</strong> similarity = 100 × (1 − |A − B| / max(|A|, |B|)); two zeros score 100, a single zero scores 0.</p>
          <p><strong>Bounded slope:</strong> similarity = 100 × (1 − |A − B| / 90°), with values outside 0–90° rejected.</p>
          <p><strong>Same-body elevation:</strong> normalized by the source image service’s reported full elevation range. Cross-body elevation differences and scores are withheld because vertical datums differ or are unspecified.</p>
          <p><strong>Overall score:</strong> the arithmetic mean of available comparable parameter scores (weight 1 per included parameter). Missing and non-comparable parameters are excluded, not assigned zero; if none remain, no overall percentage is shown.</p>
        </div>
        <p>
          The radar profile is for visual context only. Each elevation, roughness, and relief value is scaled to its source product’s reported elevation range; slope uses 0–90°.
          The chart is not the score and must not be interpreted as physical or geological equivalence.
        </p>
      </section>

      <section className="panel-block methodology-section">
        <div className="panel-head"><Info size={18} /><h3>Unintegrated parameters and limitations</h3></div>
        <ul className="bullet-list">
          <li><strong>Pressure:</strong> no comparable location- and season-specific pressure source is integrated. The Moon has no comparable conventional atmosphere; it is not assigned a measured zero.</li>
          <li><strong>Albedo:</strong> no wavelength-compatible product pair is integrated.</li>
          <li><strong>Thermal inertia:</strong> no method- and season-compatible product pair is integrated.</li>
          <li><strong>Grain size / regolith texture:</strong> no comparable in-situ grain-size measurements are integrated.</li>
          <li>Earth GLO-30 is a digital surface model, not necessarily bare-earth elevation; surface objects and vegetation may affect samples.</li>
          <li>The selected lunar and Mars data are merged/blended elevation products, not pure LOLA-only or MOLA-only rasters. Their service metadata does not fully specify a vertical datum.</li>
          <li>The location catalog is curated, not exhaustive. Free-roam map clicks allow sampling other coordinates where source coverage exists.</li>
        </ul>
      </section>

      <section className="panel-block methodology-section">
        <div className="panel-head"><Landmark size={18} /><h3>Historical sites, imagery, and gravity context</h3></div>
        <p>
          The historical layer is a curated list of confirmed crewed and robotic landing locations, with mission type,
          date, status, coordinates, and an external mission or LROC source. Coordinates identify landing sites;
          they do not track moving rovers or imply a permanent base.
        </p>
        <p>
          Location imagery is searched on demand through the NASA Image and Video Library API. TERRA filters results
          for location names present in item titles or descriptions, and shows an explicit empty state rather than
          unrelated images. The gallery links to the NASA record for each returned item.
        </p>
        <p>
          Approximate surface gravity references shown in Compare (Earth 9.81, Moon 1.62, Mars 3.71 m/s²) are
          planetary-body context, not location-specific measurements, and are excluded from the terrain score.
        </p>
        <div className="official-links">
          <a href="https://lroc.im-ldi.com/featured_sites" target="_blank" rel="noreferrer">LROC lunar featured sites</a>
          <a href="https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf" target="_blank" rel="noreferrer">NASA image API documentation</a>
          <a href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noreferrer">NASA planetary fact sheet</a>
          <a href="https://www.isro.gov.in/Chandrayaan3.html" target="_blank" rel="noreferrer">ISRO Chandrayaan-3</a>
        </div>
      </section>

      <section className="panel-block methodology-section">
        <div className="panel-head"><RefreshCw size={18} /><h3>Discovery and update status</h3></div>
        <p>
          The current application is a static frontend with a curated catalog and on-demand DEM sampling. It does not
          run scheduled jobs, maintain a discovery database, detect upstream dataset revisions, or automatically
          publish new analogs. Such updates require a backend or an external scheduled processing workflow; this
          interface does not claim that automatic updates are active.
        </p>
        <p>
          Catalog points are search locations, not newly discovered physical sites. A comparison is newly calculated
          only when the user requests it. Service tile versions and processing timestamps are not pinned by the live
          endpoints, so reports describe the sources and retrieval time rather than asserting a frozen dataset release.
        </p>
      </section>
    </main>
  )
}

function ReportsPage({ reference, target }: { reference: PlanetaryLocation; target: PlanetaryLocation }) {
  const [exportMessage, setExportMessage] = useState('')
  const {
    loading,
    referenceSample,
    targetSample,
    referenceError,
    targetError,
    comparisons,
    overall,
    availableCount,
  } = useTerrainComparison(reference, target)
  const reportData = { reference, target, comparisons, referenceSample, targetSample, overall }
  const exportReport = (format: 'csv' | 'pdf') => {
    try {
      if (format === 'csv') downloadComparisonCsv(reportData)
      else downloadComparisonPdf(reportData)
      setExportMessage(`${format.toUpperCase()} report downloaded.`)
    } catch (error) {
      setExportMessage(`Export failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <main className="page-shell">
      <div className="section-header">
        <p className="eyebrow accent">Measured comparison export</p>
        <h2>Research report</h2>
        <p>Reports use current terrain samples for the selected pair. Missing sources and non-comparable parameters remain explicit.</p>
        <div className="comparison-export-actions">
          <button type="button" className="btn btn-secondary" disabled={loading || (!referenceSample && !targetSample)} onClick={() => exportReport('csv')}>
            <Download size={16} /> Download CSV
          </button>
          <button type="button" className="btn btn-secondary" disabled={loading || (!referenceSample && !targetSample)} onClick={() => exportReport('pdf')}>
            <Download size={16} /> Download PDF
          </button>
        </div>
        {exportMessage && <p className="export-message" role="status">{exportMessage}</p>}
      </div>

      <div className="report-panel">
        <div className="report-item">
          <span>Reference location</span>
          <strong>{reference.name}</strong>
        </div>
        <div className="report-item">
          <span>Reference world</span>
          <strong>{reference.body}</strong>
        </div>
        <div className="report-item">
          <span>Target location</span>
          <strong>{target.name} · {target.body}</strong>
        </div>
        <div className="report-item">
          <span>Comparable terrain index</span>
          <strong>{loading ? 'Sampling…' : overall === null ? 'Unavailable' : `${overall.toFixed(1)}%`}</strong>
        </div>
        <div className="report-item">
          <span>Parameters scored</span>
          <strong>{loading ? '—' : `${availableCount} / ${comparisons.length}`}</strong>
        </div>
        <div className="report-item wide">
          <span>Measured parameter results</span>
          {loading && <p>Sampling current DEM sources…</p>}
          {!loading && (
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr><th>Parameter</th><th>Reference</th><th>Target</th><th>Difference</th><th>Similarity</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {comparisons.map((item) => (
                    <tr key={item.key}>
                      <th>{item.key}</th>
                      <td>{item.referenceValue === null ? 'Unavailable' : `${item.referenceValue.toFixed(2)} ${item.unit}`}</td>
                      <td>{item.targetValue === null ? 'Unavailable' : `${item.targetValue.toFixed(2)} ${item.unit}`}</td>
                      <td>{item.difference === null ? '—' : `${item.difference.toFixed(2)} ${item.unit}`}</td>
                      <td>{item.similarity === null ? '—' : `${item.similarity.toFixed(1)}%`}</td>
                      <td>{item.similarity === null ? item.unavailableReason : 'Comparable'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="report-item wide">
          <span>Source provenance</span>
          {loading && <p>Checking source availability…</p>}
          {referenceError && <p role="alert">Reference source error: {referenceError}</p>}
          {targetError && <p role="alert">Target source error: {targetError}</p>}
          {[referenceSample, targetSample].filter((sample) => sample !== null).map((sample) => sample && (
            <p key={`${sample.body}-${sample.coordinate.latitude}-${sample.coordinate.longitude}`}>
              <strong>{sample.body}:</strong> <a href={sample.source.url} target="_blank" rel="noreferrer">{sample.source.title}</a>
              {' · '}{sample.metrics.validSampleCount}/9 valid cells
              {' · '}~{sample.source.pixelSpacingMeters.toFixed(0)} m service pixel spacing
            </p>
          ))}
        </div>
        <div className="report-item wide">
          <span>Interpretation and limitations</span>
          <p>
            The score is a descriptive index, not a probability or a claim of environmental equivalence. Cross-body elevation is not scored because vertical datums differ or are unspecified.
            Pressure, albedo, thermal inertia, and grain size remain unavailable until compatible sources are integrated.
            See Data &amp; methodology for formulas, processing details, and limitations.
          </p>
        </div>
      </div>
    </main>
  )
}

function AboutPage() {
  return (
    <main className="page-shell">
      <div className="section-header">
        <p className="eyebrow accent">Mission context</p>
        <h2>About TERRA</h2>
      </div>

      <div className="about-panel panel-block">
        <p>
          TERRA is a scientific exploration platform for comparing measured terrain descriptors across Earth, the
          Moon, and Mars. It shows data provenance and limitations alongside each result; a similarity index is a
          descriptive comparison, not evidence of geological, environmental, or mission equivalence.
        </p>
      </div>
    </main>
  )
}

export default App

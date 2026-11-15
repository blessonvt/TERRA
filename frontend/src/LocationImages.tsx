import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react'
import type * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { PlanetaryLocation } from './science/model'
import { planetaryImagerySources } from './science/planetaryImagery'
import { matchesLocationImage } from './science/locationImageFilter'

type NasaImage = {
  id: string
  title: string
  description: string
  date: string | null
  previewUrl: string
  sourceUrl: string
}

type NasaSearchResult = {
  data?: Array<{
    nasa_id?: string
    title?: string
    description?: string
    date_created?: string
  }>
  links?: Array<{ href?: string; rel?: string; render?: string }>
}

const imageCache = new Map<string, NasaImage[]>()
const imageApi = 'https://images-api.nasa.gov/search'

function LocationSurfacePreview({ location }: { location: PlanetaryLocation }) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const source = planetaryImagerySources[location.body]
  const [mapError, setMapError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapRef.current) return
    setMapError(null)
    let cancelled = false
    let map: maplibregl.Map | null = null

    import('maplibre-gl')
      .then((maplibre) => {
        if (cancelled || !mapRef.current) return
        maplibre.setWorkerUrl(maplibreWorkerUrl)
        map = new maplibre.Map({
          container: mapRef.current,
          style: {
            version: 8,
            sources: {
              surface: {
                type: 'raster',
                tiles: [source.tiles],
                tileSize: source.tileSize,
                attribution: source.attribution,
              },
            },
            layers: [{ id: 'surface-imagery', type: 'raster', source: 'surface' }],
          },
          center: [location.longitude, location.latitude],
          zoom: location.body === 'Earth' ? 7 : 5,
          maxZoom: source.maxZoom,
          interactive: false,
          attributionControl: { compact: true },
        })
        const marker = document.createElement('div')
        marker.className = 'location-surface-marker'
        marker.setAttribute('role', 'img')
        marker.setAttribute('aria-label', `${location.name} selected location`)
        new maplibre.Marker({ element: marker, anchor: 'center' })
          .setLngLat([location.longitude, location.latitude])
          .addTo(map)
      })
      .catch((cause: unknown) => {
        if (!cancelled) setMapError(cause instanceof Error ? cause.message : String(cause))
      })

    return () => {
      cancelled = true
      map?.remove()
    }
  }, [location.body, location.latitude, location.longitude, location.name, source])

  return (
    <div className="location-surface-preview">
      <div className="location-surface-heading">
        <div>
          <span className="tile-tag">Exact selected area · {location.body}</span>
          <strong>{location.name}</strong>
          <small>{location.latitude.toFixed(5)}°, {location.longitude.toFixed(5)}°</small>
        </div>
        <a href={source.tiles.replace('/tile/{z}/{y}/{x}', '')} target="_blank" rel="noreferrer" aria-label={`${location.body} imagery source`}>
          Imagery source <ExternalLink size={13} />
        </a>
      </div>
      {mapError
        ? <p className="image-error" role="alert">Surface map unavailable: {mapError}</p>
        : <div className="location-surface-map" ref={mapRef} role="img" aria-label={`${location.body} surface imagery centered on ${location.name}`} />}
      <small className="image-attribution">{source.description} The marker identifies the sampled coordinate; the basemap is context imagery, not the elevation measurement.</small>
    </div>
  )
}

async function findLocationImages(location: PlanetaryLocation, signal: AbortSignal): Promise<NasaImage[]> {
  const cacheKey = `${location.body}:${location.name.toLowerCase()}:${location.imageQuery?.toLowerCase() ?? ''}`
  const cached = imageCache.get(cacheKey)
  if (cached) return cached

  const searchTerm = location.imageQuery ?? location.name.replace(/\s+landing site$/i, '')
  const query = location.body === 'Moon' ? `${searchTerm} lunar surface` : searchTerm
  const url = new URL(imageApi)
  url.searchParams.set('q', query)
  url.searchParams.set('media_type', 'image')
  url.searchParams.set('page_size', '30')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`NASA image search failed (${response.status}).`)

  const payload = await response.json() as { collection?: { items?: NasaSearchResult[] } }
  const images = (payload.collection?.items ?? [])
    .map((item) => {
      const metadata = item.data?.[0]
      const title = metadata?.title?.trim()
      const description = metadata?.description?.trim() ?? ''
      const nasaId = metadata?.nasa_id
      const previewUrl = item.links?.find((link) => link.rel === 'preview')?.href
        ?? item.links?.find((link) => link.render === 'image')?.href
      if (!title || !nasaId || !previewUrl) return null
      if (!matchesLocationImage(location, title, description)) return null
      return {
        id: nasaId,
        title,
        description,
        date: metadata?.date_created ?? null,
        previewUrl,
        sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(nasaId)}`,
      }
    })
    .filter((image): image is NasaImage => image !== null)
    .slice(0, 8)

  imageCache.set(cacheKey, images)
  return images
}

export default function LocationImages({ location }: { location: PlanetaryLocation }) {
  const [expanded, setExpanded] = useState(true)
  const [galleryState, setGalleryState] = useState<{ key: string; images: NasaImage[]; error: string | null } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [failedImageId, setFailedImageId] = useState<string | null>(null)
  const isCoordinatePick = location.isCoordinatePick ?? location.name === 'Map-picked location'
  const requestKey = `${location.body}:${location.name.toLowerCase()}:${location.imageQuery?.toLowerCase() ?? ''}`
  const stateMatchesLocation = galleryState?.key === requestKey
  const images = stateMatchesLocation ? galleryState.images : []
  const error = stateMatchesLocation ? galleryState.error : null
  const loading = expanded && !isCoordinatePick && !stateMatchesLocation

  useEffect(() => {
    if (!expanded || isCoordinatePick) return
    const controller = new AbortController()
    findLocationImages(location, controller.signal)
      .then((results) => {
        if (controller.signal.aborted) return
        setGalleryState({ key: requestKey, images: results, error: null })
        setActiveIndex(0)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setGalleryState({
          key: requestKey,
          images: [],
          error: cause instanceof Error ? cause.message : String(cause),
        })
      })
    return () => controller.abort()
  }, [expanded, isCoordinatePick, location, requestKey])

  const activeImage = images[activeIndex]
  const imageFailed = activeImage !== undefined && failedImageId === activeImage.id
  const moveImage = (direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + images.length) % images.length)
  }

  return (
    <section className="location-images panel-block">
      <div className="panel-head">
        <div>
          <p className="eyebrow accent">Location-focused imagery</p>
          <h3>Location imagery</h3>
        </div>
        <button type="button" className="btn btn-secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <ImageIcon size={16} /> {expanded ? 'Hide archive' : 'Related archive images'}
        </button>
      </div>

      <LocationSurfacePreview location={location} />
      {!expanded && <p>Exact-coordinate surface imagery remains visible above. NASA archive results are optional and name-matched.</p>}
      {expanded && isCoordinatePick && (
        <p role="status">This map-picked or random coordinate is centered in the surface imagery above. NASA archive records are not coordinate-geolocated, so no unrelated gallery is shown.</p>
      )}
      {expanded && !isCoordinatePick && <p className="image-archive-note">Optional NASA archive results are related by location name and may not depict this exact footprint.</p>}
      {expanded && !isCoordinatePick && loading && <p role="status">Searching NASA’s image archive…</p>}
      {expanded && error && <p className="image-error" role="alert">{error}</p>}
      {expanded && !loading && !error && !isCoordinatePick && images.length === 0 && (
        <p role="status">No location-specific NASA images were found. TERRA does not show unrelated images to fill the gallery.</p>
      )}
      {expanded && activeImage && (
        <div className="image-gallery">
          <div className="image-viewer">
            {imageFailed
              ? <div className="image-fallback" role="status">This NASA preview could not be loaded.</div>
              : <img
                  src={activeImage.previewUrl}
                  alt={activeImage.title}
                  loading="eager"
                  onError={() => setFailedImageId(activeImage.id)}
                />}
            {images.length > 1 && (
              <div className="image-navigation">
                <button type="button" className="image-arrow" aria-label="Previous image" onClick={() => moveImage(-1)}><ChevronLeft size={18} /></button>
                <span>{activeIndex + 1} / {images.length}</span>
                <button type="button" className="image-arrow" aria-label="Next image" onClick={() => moveImage(1)}><ChevronRight size={18} /></button>
              </div>
            )}
          </div>
          <div className="image-caption">
            <div>
              <strong>{activeImage.title}</strong>
              {activeImage.date && <small>{new Date(activeImage.date).toLocaleDateString()}</small>}
              <p>{activeImage.description}</p>
            </div>
            <a href={activeImage.sourceUrl} target="_blank" rel="noreferrer">
              Related NASA image record <ExternalLink size={14} />
            </a>
          </div>
          <small className="image-attribution">NASA image and video library · Images are loaded from NASA’s public archive.</small>
        </div>
      )}
    </section>
  )
}

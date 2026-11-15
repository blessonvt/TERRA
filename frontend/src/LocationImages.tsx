import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon } from 'lucide-react'
import type { PlanetaryLocation } from './science/model'
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
          <p className="eyebrow accent">NASA image collection</p>
          <h3>Location imagery</h3>
        </div>
        <button type="button" className="btn btn-secondary" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <ImageIcon size={16} /> {expanded ? 'Hide images' : 'Find images'}
        </button>
      </div>

      {!expanded && <p>The first location-matched image loads automatically. Use the arrows to load more only when needed.</p>}
      {expanded && isCoordinatePick && (
        <p role="status">No coordinate-geolocated photo gallery is available for this point. Orbital basemap tiles provide the matching surface context in Free Roam; TERRA does not substitute unrelated images.</p>
      )}
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
              NASA image record <ExternalLink size={14} />
            </a>
          </div>
          <small className="image-attribution">NASA image and video library · Images are loaded from NASA’s public archive.</small>
        </div>
      )}
    </section>
  )
}

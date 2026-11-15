# TERRA — Planetary Analog Explorer

TERRA is a browser-based tool for comparing terrain measurements at selected locations on Earth, the Moon, and Mars. It uses public elevation services on demand and shows source provenance, missing data, and comparability limits alongside each result. A similarity index is a descriptive terrain comparison, not geological equivalence or mission-suitability validation.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

The app requires an internet connection to retrieve map imagery and elevation data. Build and verify with:

```powershell
npm run build
npm run lint
npm run test
```

## Deploy on Netlify

The repository root contains `netlify.toml` configured for the Vite app in `frontend/`, including the production build directory and client-side route fallback.

1. Push the repository to GitHub.
2. In Netlify, choose **Add new site → Import an existing project → GitHub**, authorize Netlify if asked, then select `blessonvt/TERRA`.
3. Keep the detected settings from `netlify.toml`: base directory `frontend`, build command `npm run build`, and publish directory `dist`.
4. Choose **Deploy site**. Netlify builds the app and provides a public URL; later pushes to the connected branch trigger new deploys automatically.

No API keys or environment variables are required for the current public-data frontend. Map imagery and DEM sampling still need an internet connection at runtime.

## Integrated elevation sources

| Body | Product and provider | Nominal resolution | Coverage and reference |
|---|---|---:|---|
| Earth | [Copernicus DEM GLO-30 ImageServer](https://di-elevation.img.arcgis.com/arcgis/rest/services/copdemglo30/ImageServer), ESA/DLR/Airbus product distributed by Esri | 30 m | Global product coverage, excluding polar latitudes beyond about 84°; digital surface model with EGM2008 orthometric heights. |
| Moon | [LOLA–SELENE/Kaguya merged DEM ImageServer](https://astro.arcgis.com/arcgis/rest/services/OnMoon/LOLA_Kaguya/ImageServer), hosted by Esri | 59 m at the equator | 60°N–60°S; Moon 2000 geographic reference. Service metadata does not specify a vertical datum. This is a blended product, not a pure LOLA PDS sample. |
| Mars | [HRSC–MOLA Blended DEM Global Mosaic v2 ImageServer](https://astro.arcgis.com/arcgis/rest/services/OnMars/MDEM200M/ImageServer), USGS Astrogeology / NASA / ESA data hosted by Esri | 200 m nominal | Global, beta service; Mars 2000 geographic reference. Service metadata reports roughly 100 m horizontal accuracy and at least ±3 m elevation uncertainty but does not specify a vertical datum. This is a blended HRSC–MOLA product, not a pure MOLA MEGDR raster. |

The official upstream PDS references are [LRO LOLA GDR V1.0](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/gdr_ds.cat) and [MGS MOLA MEGDR product MEGT90N000FB](https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg032/megt90n000fb.lbl). These identify upstream products, not per-pixel lineage for the hosted blended services. The browser does not directly sample those raw PDS files: the archive endpoints support byte ranges but do not advertise browser CORS access. A server-side proxy or data API is required before TERRA can claim strict PDS-only lunar or Mars measurements.

Map imagery has separate providers and is credited in the map controls: [Esri World Imagery](https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer), the [LRO WAC lunar mosaic](https://astro.arcgis.com/arcgis/rest/services/OnMoon/LRO_WAC/MapServer), and the [Mars MDIM mosaic](https://astro.arcgis.com/arcgis/rest/services/OnMars/MDIM/MapServer).

## Terrain sampling and calculations

For each selected coordinate, TERRA samples a 1 km square neighborhood on a 3×3 grid, with 500 m spacing in each direction. Earth points are requested from the Copernicus ImageServer using nearest-neighbor sampling. Lunar and Martian source tiles are decoded from LERC and their tile row/column addresses are exposed in provenance. The Earth point-sampling service does not return a source-granule or tile ID. The UI reports service pixel spacing at the selected latitude separately from each product’s nominal resolution; the products are not resampled to a common native resolution. Lunar samples are rejected when the full 1 km window would extend beyond the merged DEM’s 60°N–60°S coverage.

- **Elevation:** center cell value in meters.
- **Slope:** central difference from the four cardinal neighbors, expressed in degrees.
- **Local roughness:** population standard deviation of valid values in the 3×3 window, in meters.
- **Local relief:** maximum minus minimum valid values in the window, in meters.

Missing/NoData cells remain missing. Elevation is not scored across planetary bodies because their vertical references differ. Cross-body terrain metrics are still resolution-sensitive; slope similarity uses the bounded 0–90° range, while roughness and relief use symmetric normalized absolute difference. The overall index is the equally weighted mean of available comparable scores only. When none are available, no overall percentage is shown.

The radar chart is a descriptive profile: slope is scaled to 0–90°, while elevation, roughness, and relief are scaled to the selected source product’s published elevation range. It is not the scoring function and does not imply geological equivalence.

## Other parameters

Surface pressure, albedo, thermal inertia, and grain size are intentionally shown as unavailable. TERRA does not currently integrate products with adequate location, season, wavelength, and method compatibility for those comparisons. Lunar pressure is not represented as a measured zero.

The curated location catalog is a set of named search locations, not an exhaustive list of every site on Earth. DEM values are sampled at the chosen coordinates at comparison time; qualitative catalog descriptions are contextual labels rather than extracted measurements.

## Exploration, imagery, and reports

- The map supports independent catalog-location and exploration-landmark layers. The historical catalog currently contains selected confirmed lunar and Martian landing sites; it is not exhaustive and does not imply that a site is a base or a rover's current position.
- Free roam includes a predefined-location picker and larger accessible markers. Selecting a catalog point or a map coordinate sets the comparison reference; arbitrary points are visibly marked, and the comparison page keeps the chosen reference paired with the current target.
- Map clicks show six-decimal coordinates immediately. Earth place labels resolve asynchronously through OpenStreetMap Nominatim with in-memory caching and a client-side limit of one lookup per 1.1 seconds; OSM attribution is shown. Moon/Mars clicks display the nearest item in TERRA’s small catalog with an approximate distance, not official IAU reverse geocoding. Place-name lookup latency is network-dependent and is not guaranteed to be sub-second.
- When a Moon/Mars target can be sampled, Free Roam samples the Earth catalog with bounded concurrency, computes the top five comparable terrain indices, and highlights those Earth pins with their measured percentages. Rankings use the active hosted services (including blended lunar/Mars products), exclude missing or quality-flagged measurements, and are exploratory rather than a claim of mission suitability.
- Each comparison location shows a satellite/orbital basemap centered on its exact selected coordinate with a visible marker. Earth uses Esri World Imagery, the Moon uses LRO WAC, and Mars uses Viking MDIM; the layer is contextual imagery and is not the DEM measurement.
- Optional NASA Image and Video Library galleries are name-matched records and may not depict the exact footprint. TERRA does not substitute these records for the coordinate-centered map, and it does not claim to have arbitrary-coordinate ground-level photos.
- Free Roam includes a random sampleable catalog-site picker in addition to map clicks. It selects a named site within the selected body’s supported sampling coverage; the comparison values are fetched live and the selected point appears in imagery and traceability.
- The comparison page puts the overall percentage before the detailed measurements and keeps its data-coverage context visible.
- Compare includes an Evidence & Data Traceability section with each selected point’s coordinates, live service, returned lunar/Mars tile addresses where available, Earth’s missing per-point tile lineage, and metric formulas.
- Mission Testing & Validation Options provides site-contextual field exercises for terrain mapping, mobility workflows, operations rehearsal, and relevant material studies. Any percentage is the unweighted mean of available, relevant DEM terrain-similarity metrics and reports metric coverage; it is not the percentage of activities possible, a passability estimate, or a probability of success. Tests for temperature, soil mechanics, mineralogy, water/ice, dust, biology, subsurface features, or hardware performance remain unscored without appropriate independent measurements. The Atacama operations-rehearsal citation is retained as a published example, not generalized to other sites.
- The comparison and Reports pages export the current measured pair as CSV or PDF. The CSV includes raw values, units, differences, scores, weights, data availability, source labels, coordinates, and a UTC calculation timestamp. The PDF includes the parameter table, score chart, formulas, sources, and limitations.
- The guided tutorial is an interactive 11-step modal. It is not automatically marked complete or used to store personal data.
- Gravity values are body-level reference context and are never treated as location-specific measurements or included in the terrain score.

## Data update status

TERRA is currently a static frontend with a curated catalog and on-demand public DEM requests. It has no scheduled backend job, persistent discovery database, upstream-version checker, or automatic reprocessing mechanism. It does not claim that its catalog or comparisons update automatically. A scheduled or incremental update workflow would require a backend or an external processing job.

An all-zero 3×3 elevation window is flagged as potentially representing water, a fill value, or a flat-value artifact. TERRA withholds terrain scores for that sample rather than treating those values as verified land terrain; the warning is a conservative quality flag, not a land/water classification.

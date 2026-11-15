# Project Status

## Current development phase
Scientific data integration and transparent terrain-comparison MVP.

## Completed work
- React + TypeScript frontend with overview, discovery, free-roam, comparison, reports, and methodology routes.
- Interactive Earth, Moon, and Mars surface maps; map clicks and catalog locations feed the reference selector.
- Copernicus DEM GLO-30 Earth sampling and Mars HRSC–MOLA LERC tile sampling verified in the running app.
- 1 km / 3×3 terrain calculations for center elevation, slope, population roughness, and local relief.
- Missing-data, source-error, source-provenance, datum comparability, and score-availability diagnostics.
- Removed placeholder similarity profiles and the hard-coded mean similarity from the application and preprocessing summary.
- Added focused science-metric tests and detailed product/methodology documentation.

## Known limitations
- Moon LOLA/Kaguya tile requests currently fail in the verification environment; lunar measurements and scores remain unavailable rather than fabricated.
- Surface pressure, albedo, thermal inertia, and grain-size products are not integrated.
- DEM resolutions and vertical references differ; cross-body slope and roughness scores remain resolution-sensitive.
- The location catalog is curated, not an exhaustive global gazetteer. Free-roam coordinates provide additional sampling where source coverage permits.

## Next actions
- Identify a reliable lunar DEM tile or point-sampling endpoint and validate its grid addressing and vertical reference.
- Add compatible environmental datasets only when product, season, units, and methods can be compared defensibly.
- Validate terrain calculations against independent reference locations and document uncertainty bounds.
- Decide on static hosting and test deployment-time CORS/service behavior.

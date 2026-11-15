# Decisions

## Frontend architecture
The MVP uses React + TypeScript with Vite for a fast static frontend. This keeps deployment simple and allows the project to remain zero-cost while still supporting interactive map and chart views.

## Data strategy
The interface uses a curated catalog of named locations and a public Esri ImageServer for each integrated elevation product. Earth DEM samples and Mars LERC tiles are retrieved at comparison time; the Moon service is documented but currently unavailable in the verification environment. Catalog coordinates are not treated as measured terrain values.

## Scientific limits
The app scores only valid, comparable observations. Cross-body elevation is not scored because planetary vertical references differ. Terrain derivatives use a documented 1 km / 3×3 sampling window and remain sensitive to different product resolutions. Unintegrated pressure, albedo, thermal inertia, and grain-size values remain unavailable rather than receiving placeholders.

The lunar source is a LOLA–SELENE/Kaguya merged product and the Mars source is an HRSC–MOLA blended product; neither is represented as a pure LOLA-only or MOLA-only dataset.

## Styling
The app uses a static CSS system instead of a full Tailwind setup to keep the build predictable and compatible with the current environment.

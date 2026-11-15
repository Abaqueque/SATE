# Known-object overlay

The observation workspace has a Known objects switch next to Two viewers. Blue circles identify SIMBAD records; amber diamonds identify JPL small-body predictions. Selecting a marker shows its name, coordinates, method, date and an external catalogue link. The two panels query their own exposure, and markers use the same fixed tangent projection, crop, pan and zoom as the image.

## Data and limits

- SIMBAD TAP: J2000 ICRS positions and `pmra` / `pmdec` in mas/year. `pmra` includes cos(dec); tangent-vector propagation avoids pole and RA-wrap singularities. Missing motion stays explicitly unpropagated. No annual parallax or perspective acceleration. Exoplanet catalogue entries are excluded because their host coordinates do not resolve the planet.
- A cone enclosing the field plus 0.12 degrees accommodates motion since J2000. The closest 1,500 records are returned, with an explicit partial-list state when truncated. This is not an exhaustive infrared source catalogue.
- JPL Small-Body Identification API v1.1: second-pass numerical integrations, V <= 22, known magnitude required. First-pass approximations are never displayed. Field results are clipped to the actual tangent-plane image footprint.
- The epoch comes from `MJD-AVG` in the actual archive FITS header, including an IMAGE extension when absent in PRIMARY. The request accepts only validated DR1/QR3 archive paths, never an arbitrary URL or a user-supplied epoch.
- JPL predictions currently use geocentre (`xobs=0,0,0`). SPHEREx position-vector metadata exists, but its axis convention has not been independently established here. The UI and About page state that nearby objects can be offset. Do not call these spacecraft-precise positions.
- Markers are suppressed for combined exposures, added wavelength layers and blended comparisons to avoid assigning one date to a composite.
- Both services have explicit loading/error states. An outage must never be shown as a successful zero-object result. Failed requests are not cached. Unmarked sources are not necessarily new objects.

## Request handling

The server validates and bounds fields and image paths, reads at most 64 KiB of FITS headers, uses abortable timeouts, and keeps a bounded daily cache. SIMBAD has a mirror fallback. JPL requests are serialized per server process. Client requests debounce exposure changes, cancel obsolete work, ignore late responses, and cache by image path within the fixed field.

## Verification

- Unit tests: proper motion, missing motion, poles, RA wrap, negative sexagesimal coordinates, JPL second-pass-only parsing, malformed/truncated responses, exact IMAGE-header midpoint, input bounds, upstream failures and outgoing query parameters.
- Chrome and WebKit interaction fixtures: independent panel epochs, marker selection, zoom alignment, compare suppression, disable/re-enable, 320/390 px layouts and About links.
- Live SIMBAD query around Barnard's Star returned its position and proper motion.
- Live JPL query for Ceres exposure `2025W52_1A_0074_1D2` returned Ceres and three additional asteroids. Its FITS midpoint is 2025-12-22 08:47:17.898 UTC.

Sources: [SIMBAD conventions](https://simbad.cds.unistra.fr/Pages/guide/sim-id.htx), [JPL API](https://ssd-api.jpl.nasa.gov/doc/sb_ident.html), [SPHEREx products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

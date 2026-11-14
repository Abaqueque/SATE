# SATE

**[Open website →](https://sate-beta.vercel.app/)**

SPHEREx Coordinate Lab — a NASA hackathon project. Explore NASA/IPAC IRSA
SPHEREx DR1 FITS cutouts by sky coordinates, wavelength and field of view.

## Team ownership

| Area | File | Responsibility |
| --- | --- | --- |
| User interface | `src/ui.js` | Page structure, controls, styles and target presets |
| Browser processing | `src/browser.js` | Search cancellation, FITS parsing, rendering and downloads |
| SPHEREx backend | `src/api.js` | Coordinate validation, archive search and FITS retrieval |

`api/cutout.js` exposes the backend as a Vercel Node.js function.
`src/app.js` routes the same requests for local development.

## Growing sky maps

Images form one borderless, gapless grid in the main viewer. Small translucent
edge arrows appear on hover, keyboard focus or the selected image (and remain
available on touch). They extend the image in pixel space, rather than applying
decimal increments to RA/Dec. The coordinate inputs remain the user's search.
Clicking an existing image or navigating back to it reuses the retained preview.

Maps scroll independently in both axes, with visible scrollbars and surrounding
space even for a single image. Drag with a mouse, swipe on touch, use a two-axis
trackpad, or Shift + wheel for horizontal scrolling. Arrow keys pan a focused
map (Shift pans faster); Centre selected returns to that map's last selection.
`src/pan.js` handles gestures without triggering tile selection or archive
requests during a drag. Native touch scrolling and pinch zoom remain available.

`src/wcs.js` reads TAN/SIP spatial WCS, including the constant/linear SIP terms
present in SPHEREx. The first exposure defines a common tangent-plane pixel
grid. Neighbours continue at the next pixel boundary; real source pixels are
nearest-neighbour reprojected to that grid, allowing rotated exposures to align.
The backend requests 60% extra real edge pixels with `geometry=1` to cover
rotation and interpolation margins. Unsupported/missing WCS never produces
fake aligned tiles. All tiles share the first padded preview's display stretch.
Neighbour requests prefer the first tile's exposure where it covers the sky,
falling back to another matching exposure at its edge.
Calibration, wavelength response and observation dates can still differ across
exposures: this is an exploratory mosaic, not a photometrically matched product.

PNG exports the selected reprojected tile. FITS exports the original, padded
scientific cutout pinned to its preview observation, not a resampled FITS file.

New manual searches create separate retained maps. Failed or cancelled requests
do not alter existing tiles or the selection. Each map has a Close control that
removes only that map, frees its tile capacity and disconnects its resize observer.
Closing the selected map switches to another open map; closing the last restores
the empty viewer and disables exports. Map numbers stay unique after closing and
reopening maps. Close is disabled during image/FITS requests to avoid races.
Up to 64 tiles are held in memory
per tab, including their full-resolution preview canvases. Reloading or closing
the tab clears them. Run `npm test` for backend and sky-map regression checks.

## Local development

Install Node.js 22, then run:

```powershell
node scripts/build.mjs
node scripts/validate-artifact.mjs
node scripts/preview.mjs 4173
```

Open http://127.0.0.1:4173. No runtime dependencies, API keys or database are required.

## Vercel deployment

Import [Abaqueque/SATE](https://github.com/Abaqueque/SATE) at
[Vercel New Project](https://vercel.com/new). `vercel.json` configures the build,
static output and backend automatically. Deploy the `main` branch; subsequent
pushes can deploy automatically through the Git integration.

For command-line deployment, run `npx vercel --prod` and follow the prompts.

The build generates `dist/index.html` and `dist/app.js`; Vercel deploys
`api/cutout.js` separately as a server function at `/api/cutout`.

## Fast previews and archive caching

The browser requests `format=preview`, which extracts only the first science
image from the archive stream and cancels the unused FITS extensions. Small JSON
pixel arrays preserve the calibrated science values used by the display.
The full multi-extension FITS file is streamed only after clicking FITS, pinned
to the same observation as its preview.

Loaded observation previews are also saved in this browser's Cache Storage,
including the first image's exact observation ID, so going back to a date or
replaying a sequence reuses downloaded pixels rather than contacting the archive.
This survives page refreshes on the same origin (host and port). The bounded
cache retains up to 128 entries / 64 MiB for seven days, evicting least-recently
used entries; a smaller memory cache works if persistent storage is unavailable.
Observation date lists are retained for one day. Find observations reuses a saved
list; Refresh observations explicitly checks for new archive results. Clearing
browser site data removes saved images; large FITS exports are not cached.

Completed display frames are retained separately in a bounded 128-entry / 64 MiB
session cache. Returning to a loaded date swaps its existing canvas without an
API request, reprojection, registration, or rasterization. Only a cache miss shows
the archive-loading state; raw-pixel cache hits say "saved pixels" instead.
Original/repaired display variants are separate, and closing a map releases its
rendered frames without deleting the persistent science previews.

Successful API responses are cached on Vercel's shared CDN for one day, with
stale-while-revalidate for seven days. Bounded warm-instance caches reuse
discovery and previews; errors are never cached. Transient archive errors are
retried at most twice, respecting cancellation and a 50-second request deadline.

`public/presets/` contains real prepared DR1 snapshots with observation IDs,
query parameters and preparation timestamps. The browser preloads these static
assets during idle time (unless data saving is enabled), without running live
archive queries. Changed coordinates or wavelength use the live preview API.

Refresh snapshots explicitly with `node scripts/prepare-presets.mjs` (or append
a preset ID to refresh just one), then commit the generated JSON and redeploy.
Deployments themselves never depend on archive availability. Run
`node scripts/test-preview.mjs` to check streaming, caching, retries and Stop.

Observation timeline: load a sky tile, select Find observations, then use the exposure list, slider or previous/next buttons. Switching replaces the selected tile using its existing sky grid and brightness scale; other tiles are retained. Discovery currently searches DR1, up to 1,000 results. Missing dates are omitted. This is visual comparison, not automatic motion measurement. No publication is needed for local use.

Missing-pixel display repair: small enclosed non-finite regions are interpolated from their measured boundary using a Laplace fill. Valid pixels (including dark measurements), edge-connected gaps and large gaps are preserved. Original pixels toggles the repair off for comparison. The selected preview reports its filled-pixel count. PNG exports reflect the display; downloaded FITS data stays unchanged. Interpolation is cosmetic and does not recover saturated flux or establish object motion.

Timeline playback: select a sky tile and press Play to discover its dated DR1 exposures and advance chronologically in the main viewer. All returned dated observations are included; there are no From/To date filters. Each successful frame stays visible for one second, in addition to any network loading time. Pause cancels playback; unavailable snapshots are silently skipped. Playback resumes after the current exposure, or restarts from the oldest after the last. No gallery is created. The archive search retains its 1,000-result limit.


## Focused target viewer

The single-image viewer is the default; Expand sky grid is off. Target presets use a tight 0.05-degree field centred on a proper-motion prediction for the current date. Fields down to 0.01 degree and 2x/4x zoom are available. Zoom does not improve angular resolution. Follow predicted target keeps the predicted source at the centre; turn it off to see motion against the fixed background.

SIMBAD TAP catalogue values (Harvard mirror, retrieved 2026-11-14) are in `src/targets.js`: ICRS J2000 positions, pmRA*cos(dec) and pmDec in mas/year. Linear propagation excludes annual parallax, perspective acceleration and binary orbital motion. Gold markers are predictions; cyan markers are candidate aperture centroids, not confirmed detections. Epsilon Indi B is treated as an unresolved pair.

Earliest/Latest step to the chronological endpoints, skipping failed snapshots. Blink alternates the first and last usable epochs. Play advances all dates. Target & measurements exposes an epoch scan, position/brightness plot and CSV export. Measurements use the original native pixels, reject low S/N or incomplete apertures, and use a 2-pixel aperture with a 4–7-pixel background annulus. Flux is converted from MJy/sr to mJy using the native WCS pixel area. Uncertainties reflect local background scatter only. Finite detector artefacts, missing pipeline flags/variance, source confusion, effective-wavelength differences and missing aperture corrections limit these exploratory measurements. No photometry is derived from display repair.

Background registration matches at least three bright candidate peaks outside the central target region, estimates a translation with a robust median, and rejects inconsistent matches. Fewer than three consistent matches retain WCS-only alignment. Rotation/distortion are handled by the existing WCS reprojection; the extra registration only corrects residual translation. No claim of precision proper motion or calibrated variability is made.

Older WISE/NEOWISE images open at the selected coordinates through IRSA's documented search interface. They are not mixed into the SPHEREx light curve or blink sequence: cross-survey PSF/bandpass matching and per-pixel spectral-response matching remain unimplemented.

### Live target checks (2026-11-14)

All five proper-motion-centred 0.05-degree requests returned HTTP 200 with native WCS and dated science pixels. Sampled exposures:

| Target | Observation | Raw aperture candidate |
|---|---|---|
| Barnard’s Star | 2025W35_1A_0444_4 | rejected; no invented measurement |
| Epsilon Indi B | 2025W18_1B_0175_2 | passed S/N and coverage checks |
| WISE 0855 | 2025W46_1A_0090_3 | rejected; no claimed detection |
| RW Aurigae | 2025W38_2C_0023_3 | passed S/N and coverage checks |
| R Draconis | 2025W29_1A_0676_3 | rejected; no invented measurement |

Passing the aperture checks is not proof of source identity or detector quality. Additional epochs may yield different results.

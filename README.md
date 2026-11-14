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
do not alter existing tiles or the selection. Up to 64 tiles are held in memory
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

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

# SPHEREx Coordinate Lab

A dependency-free Cloudflare Worker site that retrieves SPHEREx DR1 cutouts from NASA/IPAC IRSA and renders scientific FITS pixels in the browser.

## Team ownership

The application is split into three independent work areas:

| Area | File | Responsibility |
| --- | --- | --- |
| User interface | `worker/ui.js` | Page structure, controls, styles, presets and accessible labels |
| Browser processing | `worker/browser.js` | Form interactions, request cancellation, FITS parsing, false-colour rendering and downloads |
| SPHEREx backend | `worker/api.js` | Input validation, IRSA SIA search, cutout retrieval and response metadata |

`worker/index.js` is intentionally small. It only routes `/`, `/app.js` and `/api/cutout` to those modules. Contributors should normally edit the module they own rather than the router.

## Local development

```powershell
node scripts/build.mjs
node scripts/validate-artifact.mjs
node scripts/preview.mjs 4173
```

Open `http://127.0.0.1:4173`. The build copies every Worker module into `dist/server/`, preserving ES-module imports.

## Request flow

```text
worker/ui.js
    ↓ loads /app.js
worker/browser.js
    ↓ requests /api/cutout
worker/api.js
    ↓ searches and downloads from IRSA
NASA/IPAC SPHEREx archive
```

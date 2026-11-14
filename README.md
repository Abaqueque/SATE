# SATE

SPHEREx Coordinate Lab — a NASA hackathon project.

**[Open website →](https://spherex-coordinate-lab.kingjitano.workers.dev/)**

The live app is hosted publicly on Cloudflare Workers. Open the link above to
use it in your browser without cloning the repository or signing in.

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

## Standalone Cloudflare Workers deployment

The application can be deployed independently of ChatGPT Sites. The Cloudflare
deployment uses `worker/index.js` directly, with configuration in
`wrangler.jsonc`.

```powershell
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm run deploy:cloudflare
```

Cloudflare prints the public `workers.dev` URL after a successful deployment.
Use `pnpm run dev:cloudflare` for local Worker-runtime development and
`pnpm run tail:cloudflare` to inspect production logs. Install Node.js and pnpm
before running these commands. No application secrets or database are required.

The existing `.openai/hosting.json` is retained so the ChatGPT Sites deployment
can remain available as a rollback during the hackathon.

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

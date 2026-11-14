# SATE

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

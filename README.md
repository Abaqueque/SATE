# SATE — A shared search of the sky

[Open SATE](https://sate-beta.vercel.app/) · [Open the sky atlas](https://sate-beta.vercel.app/explore/)

Explore real SPHEREx DR1 sky imagery, choose a small search cell, and compare a real variable-star observation. The atlas uses Aladin Lite and 3,145,728 equal-area HEALPix cells at 6.87 arcminutes in equivalent-square width. RA/Dec follows the selected region or cell, and the wavelength selector addresses the official SPHEREx cube channels.

The survey map combines observing dates; it is spatial/spectral context, not a time sequence. Sample investigations are labelled demonstrations and stored locally. No AI account or background computing service is connected.

## Development

Use Node.js 22 and run:

```sh
npm run build
npm run dev
```

Open http://127.0.0.1:4182. `npm run validate` checks the atlas, including 590 independent astropy-healpix reference cases. The build has no runtime package dependencies or live archive-query requirement.

## Deployment

Vercel builds with `npm run build` and serves generated `sky-atlas/build`, as configured in `vercel.json`. The existing GitHub connection deploys `main` to production and branches to previews. Direct page routes are generated during the build. Source assets remain in `sky-atlas/dist`; each build copies them into a content-addressed `/releases/<hash>/` directory so HTML, CSS imports and the JavaScript module graph use matching asset versions. Root assets remain available for previously opened tabs. To preview the deployment output after building, run `SATE_PREVIEW_BUILD=1 npm run dev`.

The original coordinate-lab code and `/api/cutout` remain in the repository. Its local workflow is `npm run build:lab`, `npm run validate:lab`, and `npm run dev:lab`. See [coordinate-lab documentation](docs/coordinate-lab.md).

## Source and data

- [Atlas implementation, scientific scope and validation](sky-atlas/README.md)
- [Software licences and credits](sky-atlas/dist/vendor/NOTICE.txt)
- [NASA/IPAC SPHEREx map metadata](https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties)
- The known-variable example retains four original observation records in `sky-atlas/dist/assets/mira.json`.

## Cell observation workspace

Choose a cell in the atlas and select **Open region fully** for dated Level 2 images, wavelength controls, grayscale data, reversible noise reduction and a UTC observation timeline. [Data processing and verification](docs/cell-workspace.md).
The Milky Way false-colour palette applies only to the sky-search map.

The regional AllWISE inventory is available in both the atlas and the comparison
workspace, with linked markers in both image panes. See the
[integration notes](docs/inventory-integration.md) for usage, QR3 verification and
the explanation of exact-wavelength exposure counts.

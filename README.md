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

## Wavelength and time explorer

Open `/sky` (locally: `http://127.0.0.1:4173/sky`). Search for **WISE 0855**,
enter ICRS coordinates, or select a point on the illustrative navigation map.
**Retrieve images** loads every archive result for the selected wavelength,
using DR1 and QR3 including their deep fields. The default is one joined spatial mosaic, controlled by wavelength and scene
reference time. On phones the wavelength slider sits below the image.

The initial search is 1.50 µm with ±0.10 µm archive search width and a 0.10°
tile width (0.30° across the joined mosaic). Other wavelengths are fetched only
after moving the wavelength slider.
The archive's detector-level wavelength ranges are broad, so returned exposures
may have a different actual wavelength at the selected coordinate. The **Single image** view
shows every renderable result, labels its actual wavelength, and retains finite
pixels with quality flags. The joined mosaic applies wavelength and quality
masks before compositing. It does not imply that these are matched-wavelength
or photometrically reliable comparisons. Missing/NaN pixels cannot be displayed.
Failed downloads and unrenderable files retain their place in the timeline.

Celestial TAN-SIP WCS aligns images north up and east left. If alignment is
unsupported, Single image offers a clearly labelled original detector view;
the mosaic excludes that unaligned source. Zodiacal
background is subtracted when available. Contrast is shared across loaded
frames and recalculated when retrieval finishes. Play steps through loaded
exposures; it does not interpolate dates or pixels.

Loading uses two simultaneous requests for mosaics and three for single images,
displays the first usable pixels,
and retries failures after the first pass instead of delaying other exposures.
Stop/resume and manual retry are available. Parsed frames are cached in memory
and IndexedDB (up to 500 entries); the cache key includes archive path, position,
size and processing version, allowing reuse across wavelength searches without
redownloading or realigning. There is no automatic six-wavelength fan-out.
Search overflow fails explicitly instead of returning a silently capped sequence.

Implementation: `src/sky-ui.js`, `src/sky-browser.js`, `src/sequence-view.js`,
`src/sequence-model.js`, `src/frame-cache.js`, `src/spectral.js`,
`src/sequence-api.js`. Vercel exposes `/api/observations` and `/api/frame`.
Run `npm test`, `npm run build`, and `npm run validate`. Tests include an
independent Astropy WCS reference, all-result parsing, cache isolation and
retaining flagged or off-wavelength images in the display-all mode.

### Averaging nearby exposures

Enable **Average nearby exposures** above the image. Defaults are a six-hour
full time window (±3 hours) and a 0.5% full wavelength window (±0.25%), centred
on the selected exposure's timestamp and actual calibrated wavelength. These
are exploratory defaults, not a motion- or variability-safe guarantee. Options
allow 1, 6 or 24 hours and 0.5%, 1% or 2% wavelength span. Each timeline position
recomputes its own local average; it does not combine the full timeline.

`src/stack.js` combines only aligned frames on the identical sky grid with
matching units and background-subtraction state. It checks local pixel
wavelengths as well as central wavelengths, excludes non-nominal flags except
the source-mask bit, and requires finite positive variance. Bilinear alignment
propagates variance using squared interpolation weights. Duplicate reductions
with the same observation ID and detector band are counted once. Pixels use
inverse-variance weights; with three or more measurements, a conservative
median/MAD and variance-based 5σ rule rejects isolated outliers. At least two
accepted measurements are required at every displayed pixel.

The caption reports the contributing exposure count, time span and actual
central wavelength range. **Image details** lists members, UTC endpoints,
pixel coverage, samples per pixel and rejected samples. Where no compatible
pair exists, the original remains visible with an explanation. Switching the
toggle off restores the original at the same timeline position. Averaging
updates as downloads arrive and preserves the originals' shared contrast.

This reduces independent noise when compatible repeat observations exist.
Moving sources, rapid variability, calibration differences and systematic noise
are not resolved by this display coadd. Reprojection correlates neighbouring
pixels; the propagated per-pixel variances do not provide independent-pixel
aperture-photometry uncertainties. The cache processing version is bumped so
older cached frames cannot omit the required variance and wavelength planes.

### Joined 3 × 3 spatial mosaic and false colour

The default is **Joined 3 × 3**: one continuous sky image spanning three tile
widths horizontally and vertically, not nine repeated views of the same patch.
A 0.10° tile width produces a 0.30° square field. The archive search covers this
whole field; every source cutout is reprojected through its celestial WCS onto
the same north-up, east-left grid. Overlapping footprints supply their actual
sky positions; no image is copied into another tile and no missing sky is
invented. The canvas has no card gaps, borders or per-tile labels.

The timeline selects the scene's reference time. **Scene span** defaults to
24 hours (±12 hours), with 1-hour, 6-hour and 7-day alternatives. All compatible
sources within that window may contribute, not an arbitrary limit of nine
exposures. Per-pixel actual wavelengths must fall inside the requested wavelength
and archive search width. Quality-masked, calibrated pixels with positive
variance are required; incompatible grids, units, background states and repeat
reductions are excluded. The nearest actual wavelength wins in overlap regions.
Uncovered or invalid pixels stay transparent. Image details report coverage,
actual time/wavelength ranges and the source list. Calibration/wavelength
changes can leave intensity seams; this is an exploratory mosaic.

**Average nearby exposures** additionally combines compatible overlaps with
inverse-variance weights and conservative outlier rejection. Its tighter time
and wavelength limits apply inside the scene window. Pixels with only one
suitable observation retain that measurement. **Single image** retrieves the
original-sized field at the selected point and retains the earlier averaging
controls. The download queue prioritises the current scene's time window.

False colour uses a sequential dark-purple → orange → pale-yellow brightness
palette after a shared asinh stretch; grayscale uses the identical stretch.
This is intensity colour mapping, not true colour or a multi-band RGB composite.
On narrow screens the wavelength slider moves below the image. At most 240 ×
240 output pixels keep a three-tile-wide scene interactive; larger fields are
therefore sampled more coarsely. Sources: [IRSA SIA data access](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
and [SPHEREx cutout service](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html).


The local preview serves HTML and browser modules from the same `dist` build.
Every module import carries the build fingerprint, and local pages/scripts use
`Cache-Control: no-store`; this prevents old markup/new script combinations
from stopping Search and the viewer controls. `npm run dev` builds before
starting; after source edits run `npm run build` to update the running preview.
Validation checks that every required viewer control exists in the built HTML.
Mosaic downloads use two workers and respect the archive's retry delay after
HTTP 429/503 responses. Other downloads continue to use three workers.

### Archive speed and the viewer layout

Measured against IRSA: a cone search of radius 0.07° returns in about 1.5 s,
while one of 0.1° or more did not return within 50 s. `/api/observations`
therefore covers the joined field with a grid of small cones (nine for the
default 0.30° field, at most 25), three at a time, and merges the rows by
archive path. Fields wider than 0.5° are sampled rather than fully tiled; the
3.5° detector footprint makes a missed exposure unlikely but not impossible.

About three quarters of every cutout is an EPSF table the viewer does not use,
placed before the small wavelength table. `/api/frame` stops reading the cutout
at the EPSF header and takes the wavelength table from the last 5760 bytes of
the archive file by byte range, cached per detector and pipeline version (the
table was byte-identical across the exposures checked). If that range request
or its validation fails, the whole cutout is downloaded as before. HTTP 429/503
"server busy" answers are retried twice on the server before the browser sees
a failure; a failure that still names status 503 is the archive, not the page.

The page is one screen: a collapsible **Target** panel on the left (name search,
coordinates, schematic map, field size), the image in the centre, the wavelength
slider on the right and the timeline underneath. Until a time is chosen, the
mosaic follows the best-covered scene found so far while exposures load.

**Merge exposures** (the former "Average nearby exposures") is on by default
with a 24-hour window and a 2% wavelength span, so overlapping exposures at
close wavelengths are combined rather than one winning. In the mosaic,
exposures with no pixel near the requested wavelength are identified from the
image header and wavelength table and skipped before their pixels download, and
the timeline only stops on times that produce an image.

Under the mosaic, a strip shows the same scene in 17 narrow overlapping bands
stepped across the search width (for 1.50 ± 0.10 µm: 1.42 to 1.58 µm in 0.01 µm
steps, each ± 0.02 µm, so neighbours share pixels). They are built from the exposures already loaded, share the
main brightness scale, and can be clicked to enlarge.

Mosaic timeline entries also include exposures whose wavelengths lie outside the
search width but within three times it. Where a time has nothing at the
requested wavelength, those are shown as their own image, captioned "nearby
wavelength" with the actual range and marked with blue ticks; they are never
mixed into an image at the requested wavelength. Exposures further away are
skipped before download.

The default tile width is 0.20°, giving a 0.60° joined field.

In the mosaic, **Play** steps through every separate image: each time's full-band mosaic, then its narrow wavelength bands in order, then the next time whose contributing exposures differ.

Mosaic images covering less than 80% of the field are left out of the timeline, the wavelength strip and Play.

## Current `/sky` page: motion view

`/sky` is a minimal motion view; the explorer sections above describe earlier
versions. It opens on Barnard's Star with a 3′ north-up, east-left field,
reprojected at 1.5″ per output pixel. Three archive searches cover all six
detectors. **Play** blinks median stacks, grouped into visits when successive
selected exposures are no more than ten days apart. **Every night (UTC)**
instead makes one stack per UTC calendar date, splitting at midnight.

**Matched wavelengths** defaults to 1.25 µm ±1%. Both the wavelength at the
field centre and each included pixel must match. The wavelength control can
select another channel; some dates have no matching exposures. Matched images
share one brightness scale. **Difference** uses last minus first on that same
scale, retaining flagged pixels for visual inspection. **All wavelengths ·
overview** retains the broad timeline and individual image contrast; its
motion markers, numerical fit and Difference control are disabled because
source appearance and brightness change with wavelength.

Markers follow a source near the field centre, then near its previous detected
position, with a bounded search radius. They do not select the global brightest
pixel or use an expected catalogue proper motion. Nearby rivals, large jumps
and missing detections withhold a position. Hollow markers identify visual
estimates with flagged or missing core pixels; those positions never enter
the fit. This spatial association is exploratory, not a catalogue identity check.

The apparent-motion fit uses one reliable measurement per UTC date, with equal
weight per date, regardless of the chosen display grouping or exposure count.
It needs at least three reliable dates spanning 90 days and reports residual
scatter. It includes parallax and WCS alignment errors, and does not provide
precision astrometry or a formal proper-motion uncertainty. While exposures
are still loading, any fit is labelled provisional. Stacks reject incompatible
grids, units and background-subtraction states, preserve conservative quality
masks, and deduplicate alternate reductions of the same exposure and detector.
The motion cache version stores wavelength and quality planes with the pixels;
older pixel-only entries are not reused.

Validation on 14 November 2026 found 358 archive exposures on 39 UTC dates
(seven ten-day-gap visits); the old half-day-gap grouping produced 33 groups.
An offline sample of 49 available detector-2 cutouts contains three matching
1.25 µm exposures. Source flags and ambiguous/missing positions prevent a
reliable fit in that sample. The previous numerical Barnard's Star motion claim
has therefore been removed; a known catalogue rate is not a validation result.

Other fields: `/sky?ra=<deg>&dec=<deg>&size=<deg>&name=<label>&wavelength=<um>`.
Centre the field on the object's current position. Logic is in `src/motion.js`
and `src/sky-browser.js`. `npm test` includes UTC-midnight, wavelength/quality,
source association, calibration compatibility and motion-fit checks, plus a
mock-DOM runtime test of mode switching, playback and the no-match state.
Run `npm run build` and `npm run validate` to refresh and verify the local build.


### Current motion defaults (14 November 2026)

The default target is Van Maanen’s Star, with 58 bundled real FITS cutouts
for immediate display. The initial wavelength is 1.60 µm. The timeline now
uses individual UTC dates by default. Display stacks combine one detector’s
exposures on the same date within **±5%** of the selected wavelength (10%
total width), applying the window to both central and local pixel wavelengths.
This wider display window is separate from the motion cross-check, which
continues to compare independent narrow wavelength groups with their own
position offsets over at least 300 days. The slider snaps to available bands
and preserves the chosen date where possible.

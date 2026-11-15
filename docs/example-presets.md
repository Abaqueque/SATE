# Ready-to-use example targets

Selecting any of the 14 entries in Test regions now opens the observation viewer directly. The target name, position, field, wavelength, display settings and relevant tools travel together in the URL.

| Examples | Starting setup |
| --- | --- |
| Barnard, Epsilon Indi B, WISE 0855, Kapteyn, Groombridge | Two dated viewers, known-object markers, motion controls, source stretch and target-centred zoom |
| RW Aurigae, R Draconis | Two dated viewers near the selected wavelength, known-object markers, source stretch; motion marking off |
| Orion, Galactic Centre, Andromeda | Two full-field viewers at different infrared wavelengths from the same exposure; layers assigned Left/Right, faint-detail stretch, native nearby-wavelength coverage, Compare and Play ready |
| 3I/ATLAS, Vesta, Ceres, SWAN | Existing curated observing sequence, two dated viewers, tracking and known-object markers |

Comparison presets wait for a qualifying endpoint if a requested frame fails coverage. In particular, Vesta's nominal final exposure falls below the 80% field-coverage gate; the viewer chooses a valid later frame rather than opening both panes on the first date. Once displayed, selections remain fixed as more observations arrive. Play/Pause remains available for the loaded timeline.

## Starting observations and archive recovery

Thirteen small manifests in `sky-atlas/dist/assets/example-sequences/` identify verified real starting exposures for the non-curated examples. Every entry was downloaded and parsed as FITS, calibrated at the example centre, aligned to its actual field, and checked for at least 80% finite-pixel coverage. Image pixels are still retrieved from IRSA through the normal viewer path; the manifests contain no synthetic images or invented detections. Galactic Centre and Andromeda defaults use the measured central wavelength of their verified starting image instead of assuming that an archive search's nominal band equals the pixel wavelength.

The starting sequence and complete archive query run concurrently. The first images can appear without waiting for the full search. Successful archive results append every additional candidate, preserving existing validation state, selected files and dates. Starting sets are not a cap on the timeline. An archive-search failure leaves loaded examples visible, identifies the limited starting set, and offers Retry archive search. Changing field, channel or wavelength mode disables an incompatible starting set. A saved exposure outside the starting set is never silently replaced.

Direct image paths and cutouts follow the official [SPHEREx data-access documentation](https://irsa.ipac.caltech.edu/spherex-archive-documentation/spherex-data-access/) and [IRSA cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/). Retain the original release/path/date on every observation. Wavelength varies across a spectral image; nearby-wavelength display shows the measured native pixels, not a synthetic broadband image. Changes in these previews are not calibrated variability or precision astrometry. WISE 0855 is a field example, not a claim that its faint target is detected in every exposure.

The extended-object pairs are Orion D4/D1 (3.219/0.957 µm), Galactic Centre D6/D3 (4.644/1.913 µm) and Andromeda D2/D5 (1.267/4.024 µm) at their initial observation. Each paired FITS file was independently downloaded and checked for observation ID, wavelength calibration and field coverage. These are native spectral images: wavelength varies across each field, and the labels report its centre. Each wavelength uses its own display stretch, so visual contrast is not a flux ratio.

Wavelength layers mount before archive searches finish. Their matching starting manifests allow both panes to open during search outages; live results become available on the next timeline selection without replacing displayed images. Each pane shows the actual displayed observation date; the layer controls and overlay legend retain wavelength details, and the active pane's FITS download follows its visible layer. Saved views retain layer assignment and nearby-wavelength settings.

Known-object visibility persists through URL reloads and saved-view links. It remains independent of image loading, and its existing prediction/position limitations continue to apply.

## Verification

- `npm test`: preset contracts, safe initial endpoints, saved-date protection, archive append/deduplication, existing coverage/coordinates/cache/layers/notebook tests.
- `scripts/qa-example-presets.mjs`: all 14 presets in Chromium and WebKit with controlled pixels, archive outage/recovery, stable selected dates and pixels after new rows arrive, tool defaults, known-object toggle/reload, and 320/390-pixel layouts. Chromium uses pointer activation; WebKit uses native keyboard activation. The local WebKit pointer harness also failed on an isolated plain HTML button, so pointer-only assertions are not claimed for that run.
- `scripts/audit-example-presets.mjs`: actual Test regions navigation and real IRSA images, no intercepted archive responses. Records both visible panes, distinct comparison dates, tool states, elapsed load times, API failures and viewer errors. Atlas errors during navigation are recorded separately because leaving the atlas can cancel an in-flight HiPS request.
- `scripts/verify-example-sequences.mjs`: optional repeat validation of each bundled source against live FITS data, including observation ID/time and aligned field coverage.

Browser scripts accept `PLAYWRIGHT_MODULE` for an external Playwright installation and `SATE_BASE` for preview/production. The live audit also accepts `AUDIT_DIR`, `AUDIT_BROWSER=webkit`, and `AUDIT_FILTER` (comma-separated example IDs). Load times measure these runs, not an archive latency guarantee.

## First image on ordinary cells

Ordinary cell views now load the selected spectral plane directly from the real SPHEREx DR1 HiPS cube while the archive searches for individual exposures. The header says “Survey view” and the wavelength. This display is never inserted into the timeline, used as a dated exposure, or saved as an observation. Play and Document cell stay disabled until individual observations are available. The survey view remains visible during metadata checks and is replaced only when an exposure is ready. Aborted requests, changed fields/channels and blank spectral planes cannot insert a stale preview.

The survey renderer uses the full order-5, 512-pixel ICRS tiles and projects native pixels onto the same north-up sky grid as the exposure viewer. Its PNG orientation was independently compared with the existing Aladin renderer. It uses the published visualization pixels and carries no photometric units. Source properties: https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube/properties .

Nearby wavelengths default on for new views and added layers. Explicit `nearby=0` and the saved `layerNearby` selection preserve off settings on reload. Legacy saved view settings without these flags retain their prior strict selection. The observation label bar has been removed from ordinary images; source details remain in the sidebar and accessible canvas description.

The first-image queue favours centrally covering footprints when dates are not explicitly requested. Previously verified starting manifests can use the downloaded FITS calibration directly, retaining the 80% full-field coverage gate. General archive rows still use header checks before downloading potentially partial cutouts.

`qa-first-image.mjs` verifies the survey-to-exposure transition, disabled observation actions during preview, loading continuity, default and explicit-off settings, image captions, and mobile widths in Chromium and WebKit. Its survey and exposure data are controlled fixtures; live timing runs use fresh browser contexts and real IRSA requests separately.

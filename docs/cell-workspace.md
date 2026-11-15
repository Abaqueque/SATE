# SPHEREx cell observation workspace

Open a HEALPix search cell and choose **Open region fully**. Direct links use `/explore/?hpx=<cell>&order=9&channel=<0–101>&view=cell`. Two side-by-side images remain grayscale. The top L marker selects the left exposure; the bottom red R marker selects the right exposure on the same elapsed-time axis. First and last matching exposures are the default pair. Clicking a pane or moving its marker selects which pane previous/next, playback, same-day time buttons, coaddition and FITS download operate on. Wavelength and display controls apply to both panes. Zoom (1–12×), wheel/trackpad zoom, drag-to-pan and Fit share the same sky position in both panes. The sky-search palette is separate.

## Wavelength and time

The wavelength menu offers a single channel, All wavelengths, or a custom mix. A channel spans the midpoints to its adjacent channel centres. Single and mixed selections filter both the exposure list and individual pixels; there is no automatic substitution of another wavelength. All wavelengths shows every calibrated exposure covering the selected centre. These modes select a union of exposures, not a simultaneous broadband measurement.

The archive's detector-wide bandpass is only a preliminary search filter. Before an exposure appears, `/api/frame-info` evaluates the selected sky coordinate against that exposure's own full-image WCS and wavelength table, retrieved using byte ranges. Failed metadata checks are counted and retryable. All independent calibration checks are dispatched concurrently, and the list fills as each returns. Combined-exposure downloads and multi-cone archive searches also run concurrently. A failed combined-image download does not discard successful peers.

Every matching exposure is selectable, including multiple observations on one UTC date and exposures with fully masked pixels. Re-releases of the same exposure ID and detector are deduplicated. Timeline marks are positioned by elapsed observation time. The draggable time bar snaps to the nearest available exposure while preserving elapsed-time spacing. Mouse, touch, keyboard arrows, Home/End, previous/next, playback and same-day time buttons navigate individual exposures. Scrubbing reuses preloaded images immediately; independent pane tokens prevent late responses overwriting newer choices. Selecting a downloading image joins its existing request. Dates, UTC time and actual centre wavelength remain visible.

The selected channel, mode, mix and both exposure IDs (`exposure` and `compare`) are retained in the URL. DR1, QR3 and their deep collections are queried. Search results are cached for ten minutes, calibration metadata uses bounded warm-instance caches, and all matching images preload through a four-request queue. Selected images move ahead of queued background work. Aligned arrays use a 32 MiB memory budget and a 128 MiB persistent IndexedDB budget; storage failure falls back to memory. Display rasters have a separate 64-entry limit. Preloading progress and retry controls remain visible. Wavelength changes abort the old search and downloads; ordinary date scrubbing does not. The bounded cache can evict older frames in very large selections.

The header contains a persistent dark-mode switch, initially following the system preference. The theme affects the interface only; image values and palettes are unchanged. The atlas and observation view each keep their single wavelength picker in the right-hand panel.

## Display processing

- FITS IMAGE, FLAGS, VARIANCE, ZODI and WCS-WAVE extensions are retained. TAN/SIP coordinates align a 12-arcminute context north up, east left.
- Quality masking permits nominal pixels and the source-mask bit. Zodiacal-model subtraction, two-pass bilateral denoising, asinh contrast and pixel smoothing start enabled.
- Spectral selection is always respected, including in Original view. Optional gap repair only estimates enclosed pixels with at least seven valid neighbours; it cannot fill spectral gaps or large missing regions.
- Original displays aligned science values without quality masking, zodiacal subtraction, denoising or gap repair. A display stretch and alignment still apply. FITS download preserves the archive source.
- Pixel inspection reports original aligned intensity and wavelength. Display processing never overwrites the raw arrays.
- The display stretch stays fixed within a selected channel during a search. All/mix views maintain a separate reference scale per channel. This is a visual comparison, not calibrated variability photometry.

**Combine exposures** performs an optional inverse-variance display coadd within ±3 hours and ±0.5% centre wavelength. Each contributing pixel must also match the selected wavelength bins and the local anchor wavelength, have good quality and positive variance, and share grid, units and background-removal state. Repeat reductions are excluded. Robust clipping is applied with at least three samples. Pixels without two compatible contributions retain the anchor image. The selected exposure remains individually accessible. Reprojection introduces pixel covariance; these per-pixel uncertainties are not aperture-photometry errors.

## Verification

`npm test` covers filtering, same-day exposure retention, actual-time timeline spacing, metadata calibration, proxy input handling, weighted coadds, noise suppression and preservation of original values. `npm run build` includes atlas checks and 590 independent Astropy coordinate reference cases. Automated Chromium checks exercise same-day navigation, single/all/mix selection, coadds, masked exposures, playback and mobile controls with deterministic FITS fixtures. A live archive check loaded four matching exposures for cell 734163 at channel 30 and switched between individual dated images.

Reference: [IRSA spectral image tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) and [quality flags](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html).

Dual-view validation: deterministic Chromium fixtures cover independent mouse/touch/keyboard selection, same-frame pixel equality, shared zoom/pan, one request per matching exposure, persistent reload, cross-channel cache reuse, dark/light and 320/390px layouts. Live IRSA validation loaded four matching images for cell 734163/channel 30, displayed 24 May 2025 and 20 June 2026, and made zero additional image requests across repeated endpoint scrubs. See [change-viewer research](research/change-viewer.md) for the remaining scientific matching requirements.

## Find a known object

The regional inventory lists AllWISE objects in the selected HEALPix cell. It is
available in both the atlas and this workspace. Search catalogue IDs, include the
surrounding query area, select records or markers, and use **Centre source** to
centre the selected catalogue position in both images. Overlays follow the shared
zoom and pan; **Show catalogue markers** toggles both panes. Catalogue positions
are fixed reference positions, without exposure-date proper-motion propagation.
Details and verification: [regional inventory integration](inventory-integration.md).

The sky atlas has a Search field at the top of the map. Enter a name or catalogue identifier and press Enter / Go. `/api/object-search?q=...` resolves the name through CDS Sesame (SIMBAD/NED/VizieR), with a second official mirror on failure, bounded six-second upstream requests and a 24-hour successful-result cache. No coordinates are hardcoded for search results. The common `WISE 0855` shorthand expands to its catalogue identifier.

A successful search centres the map on the object, marks it with its resolved name, zooms to a 0.48-degree field, and selects the order-9 search cell containing that position. Unknown names and service failures leave the current map in place; stale responses cannot replace a newer search. When both catalogue proper-motion components are supplied, J2000 coordinates are approximately propagated to 2026.0 for navigation, with the epoch shown beside the result. Otherwise the catalogue position is used and labelled. This is not date-specific precision astrometry and excludes parallax and radial velocity; Solar System object ephemerides are not implemented.

Validation: five resolver tests cover parsing, input validation, mirror fallback/cache reuse, service failures versus no match, RA wrap/polar propagation and Barnard's Star motion. Chromium checks verify live name resolution, selection, marker rendering, stale-search cancellation, errors, keyboard submission and dark/light layouts at 320/390px. Reference: [CDS Sesame API](https://vizier.cds.unistra.fr/vizier/doc/sesame.htx).

## Parallel loading and coverage

The viewer shares a pool of ten simultaneous image requests across its two panes and extra wavelength layers. Up to twelve observation inspections proceed together, with earlier and later dates checked first. Selected frames join existing work, and cancelled searches do not start their queued requests.

Only exposures covering at least 80% of the fixed 0.2° north-up field enter the timeline. The metadata endpoint measures the detector footprint on the same grid used by alignment; obviously partial exposures are skipped before their full image downloads. Downloaded and cached frames must also have finite original image values over at least 80% of that grid. This is spatial coverage before quality/wavelength masks, gap repair, zoom or shared cropping; those display choices can still hide pixels. Additional wavelength layers apply the same rule and try the next closest eligible date when a frame is partial. The status reports coverage exclusions separately from retryable archive failures. Curated moving-object positions affect wavelength sampling, while coverage always uses the fixed investigation field.

The cell workspace opens with one observation and one timeline handle. **Two views** at the top of the right sidebar enables the second pane, its timeline handle and the comparison overlay control. Switching back keeps the first view's date, zoom and layers. `dual=1` preserves the two-view layout in shared/saved links; an explicit overlay link also opens comparison mode. Single-view notebook records contain one preview and only the displayed observation sources.


The image settings include a field-width input in degrees (0.01–0.35°, default 0.20°), with suggested values such as 0.05° and 0.10°. Applying a width keeps the sky centre and selected observation, reloads the archive and catalogue field, resets pan/zoom, and applies the same grid to wavelength layers. Frame cache keys include the width. Saved observations record the width and use it for their FITS cutout links. Single-view entry selects the newest qualifying exposure unless an explicit observation is requested. The sidebar Two viewers switch restores both timelines; older `viewers=2` links remain supported alongside `dual=1`. Image and loading backgrounds are black.

Integration validation: 87 automated tests, the atlas checks, coordinate checks, and release-addressed build pass with upstream main through 021ee7a. Parallel loading, the 80% coverage requirement, and wavelength overlays remain enabled.

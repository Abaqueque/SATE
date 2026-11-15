> The Regional inventory panel has been removed from the atlas and observation workspace. The notes below describe the earlier integration; its catalogue utilities and API remain in the repository.

# Regional inventory integration

Baseline: fresh clone of `Abaqueque/SATE`, `main` at `af17159`, 15 November 2026.
The previous local version remains separately in `../SATE`.

## Added

- Per-cell AllWISE inventories in the sky atlas and the Level 2 comparison workspace.
- Searchable catalogue records, W1/W2 magnitudes, flags, exact HEALPix membership,
  surrounding-area filtering, refresh and bounded browser/server caches.
- Linked markers in both comparison panes. Marker positions use the same tangent
  plane as the science images and update with shared zoom, pan, Fit and frame loads.
- Selecting a record highlights it in both panes. **Centre source** pans/zooms both
  images to that catalogue position. **Open source region** on the atlas opens the
  corresponding cell workspace and carries the source coordinates for initial focus.
- `/api/inventory` in local development and Vercel, with validated cell IDs, a fixed
  upstream catalogue service, 45-second deadline and an explicit 2,000-record limit.
- DR1/QR3 release labels in the selected image's metadata.

The source catalogue positions are not propagated to individual exposure dates.
They are reference objects, not automated detections or a catalogue-completeness claim.
This port does not replace the teammate's dual viewer or its scientific processing.

## Exposure-count finding

The updated viewer does not cap the sequence at three or five exposures. It evaluates
the actual wavelength at the selected coordinates using each exposure's own WCS-WAVE
calibration. The previous local app kept detector-wide SIA matches, including nearby
wavelengths. Following the user's clarification, the updated exact-wavelength filtering
has been retained rather than inflating the count with different wavelengths.

Live verification for cell 734163, channel 30 (1.517 micrometres) returned 67 broad
archive candidates. All 67 metadata checks succeeded. Four exposures fell inside
the selected bin (1.499 to 1.5355 micrometres); 63 had other local wavelengths.
Both DR1 and QR3 were present. See `integration-live-check.json` for exact IDs,
dates, wavelengths and archive paths. Regression tests also verify that 45 matching
exposures are retained and nearby nonmatching wavelengths remain excluded.

## QR3 verification

The new repository already queries `spherex_dr1`, `spherex_qr3`,
`spherex_dr1_deep` and `spherex_qr3_deep`. Its frame and metadata endpoints permit
both DR1 and QR3 paths. No replacement release-ingestion implementation was needed.

The live comparison displayed a DR1 exposure from 24 May 2025 and a QR3 exposure
from 20 June 2026. The right-pane original FITS link points to the QR3 archive.
Tests verify collection selection, QR3 date/path retention and absence of a small
display-count cap.

## Validation

- `node --test scripts/test-*.mjs`: 41 passing tests.
- Atlas checks and build pass, including 590 independent HEALPix reference cases.
- Live AllWISE: 198 objects inside cell 734163; 318 inside Andromeda cell 173380.
- Browser: four exact-wavelength images preloaded; DR1 and QR3 images displayed;
  198 catalogue markers in each pane; hiding markers removes both overlays.
- Source search/selection and shared centring verified. The selected marker's centre
  matched the viewport centre in both panes (zero measured screen-coordinate offset).
- No browser console errors during these checks.

The checks used Node.js v24.22.1; the repository specifies Node 22. `npm` was not
available in this environment, so the underlying Node build/check scripts were run.
Changes are local and uncommitted; nothing has been pushed or deployed to Vercel.

## Atlas alignment and regional options

Catalogue marker positions now account for the Aladin viewport offset below the
search bar (including its mobile height). The native sky grid remains unchanged.

The observation workspace defaults to the selected channel bin. Its **Include
nearby wavelengths** checkbox uses the original viewer's detector-band archive
matches and disables exact local-wavelength masking. The preference is retained
in the page URL. Each exposure still reports its actual local wavelength.

The atlas **Test regions** menu includes Barnard’s Star, Epsilon Indi B, WISE 0855,
RW Aurigae, R Draconis, Orion Nebula, Galactic Centre and Andromeda. It selects the
target’s search cell and nearest available map channel; sample review stays
available in the selected cell. Coordinates reuse the previous project presets,
including the user-supplied WISE 0855 position.

Validation after these changes: 44 tests pass and the atlas build passes.

## Original-viewer nearby mode

Nearby mode now reproduces the original viewer's broad detector-band selection:
SIA searches use ±0.025 µm around the requested channel, then retain every unique
returned exposure covering the selected centre, regardless of its exact local
wavelength. Local wavelengths remain visible in metadata; these frames are not
all measurements of the same wavelength. Exact mode remains the default.
Small-gap interpolation is enabled by default. Missing coverage and large gaps
remain unfilled. Exposure counts follow archive coverage, with no target count
or artificial cap at 40–60.

## Image framing and false colour

The comparison defaults to Shared coverage: the largest centred square contained
in both selected raw exposure footprints. Both panes retain the same sky centre
and angular scale. The displayed field width is shown beside the framing control
and can change when a different exposure is selected. Full field restores the
original 0.20-degree view with its partial detector coverage. Bad-pixel quality
flags do not determine framing; enclosed gaps are left to the display repair
control. If a usable common central square cannot be established, the full field
is shown and labelled partial coverage.

False colour is an optional intensity palette matching the old viewer, applied
after the grayscale intensity stretch. It preserves missing-pixel transparency,
raw measurements and original FITS downloads. Catalogue marker and hover-pixel
coordinates account for the shared crop. 47 tests and the build checks pass.

## Motion tracking

Smooth pixel display and small-gap interpolation remain checked by default.
Track motion adds one manual sky position per individual exposure, linked trails
in both panes, dates and coordinates, endpoint angular displacement, per-cell
browser persistence, clear and JSON export. Dragging does not add marks; a new
click replaces the mark for that exposure. Tracking uses unmodified raw coverage
and the inverse sky projection, independent of cosmetic interpolation or colour.

The Barnard example opens a fixed full field focused on its survey-era position,
with two dated exposures and predicted proper-motion positions. The quality mask
is disabled explicitly in this example to reveal the flagged bright-star core;
the checkbox remains available and general defaults are unchanged. Predicted
positions omit parallax and are labelled; manual marks are not centroid fits.
50 tests and build/check scripts pass.

Object links now centre archive discovery and the output sky grid on the chosen
source when its supplied coordinates belong to the selected cell. Ordinary cell
links retain the cell centre. This prevents motion-demo exposure selection from
being based on a different point several arcminutes away from the tracked star.

Barnard demo exposure verification: 25 August 2025 (2025W35_1A_0146_3,
1.590980 µm) and 18 August 2026 (2026W34_1A_0363_3, 1.584797 µm). Both
cover the actual tracked source position. The demo now starts in exact-channel
mode to avoid comparing the broad detector band's very different wavelengths.
Nearby mode remains available as an explicit option.

## Automatic tracked path

A click can seed a local intensity-centroid tracker through later matching
exposures. The tracker searches within five native grid pixels of the previous
match, reads original aligned pixels, skips absent/low-contrast matches and stops
after three consecutive failures. A green start stays fixed; orange samples and
segments accumulate only through each pane's displayed date. Manual marking is
still available by switching automatic tracking off. Stop, clear, export, browser
persistence and cancellation on a new observation search are supported.

The Barnard example automatically seeds from its predicted first-date position
and finds four centroids. The live check measured about 10.41 arcseconds between
the first and last matched dates. These are approximate display-tracking results
including flagged bright-star pixels, not validated astrometry. Predicted
crosshairs remain a separate layer. Smooth display and gap interpolation are on.

## Full image-field catalogue overlay

The Level 2 workspace now requests the inventory at the actual image centre
and width, rather than only at the HEALPix cell centre. A cone enclosing all
four tangent-plane corners supplies the candidates, then a matching tangent-
plane footprint filters them to the square image field. RA wrap and polar
fields are supported. Shared framing and pan/zoom still clip markers through
the science canvas projection. The default Region option is Full image field;
Selected cell only remains available. Catalogue markers stay off by default.

Server and browser caches include the image geometry, preventing reuse of an
inventory from a different source centre or image width. Motion endpoint circle
outlines are now thinner and use 40% opacity; labels and path stay readable.
Validation: 57 tests pass, including image-field membership and cache isolation.

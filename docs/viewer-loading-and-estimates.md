# Loading, sliders and display estimates

The viewer starts with the newest matching observation, inspecting newer candidates first. A ready, validated image is displayed without waiting for unrelated headers. Automatic selection advances to the newest available result until the user chooses a date. Saved exposure IDs are respected. Timeline rows remain chronological; the newest-first request priority supersedes the older acquisition ordering described in timeline-stability-and-counts.md.

Dragging freezes the available timeline rows until release. Date and UTC time appear beside the handle. Hue and opacity update their controls immediately, coalesce image paints and persist URL settings on change. Timeline URL writes are debounced. Processed pixel arrays are cached separately from colour/contrast renders. This avoids repeated image processing and excessive history writes during a continuous gesture. The existing ten-image request limit and 80% finite-field coverage gate remain in place.

Successful observation lists are cacheable for ten minutes in the browser/CDN. Errors are not cached. This improves repeat visits; an uncached IRSA outage still prevents a new search. Live SIA probes on 15 November 2026 returned HTTP 502, so controlled fixture timings are not claims about live archive latency.

## Gap estimation

Estimate missing pixels is off by default and applies only to the base layer in single-wavelength mode. It uses finite, unflagged samples at the same aligned sky pixel from the current image and up to two nearby exposures, bounded to two channels either side and six hours from the selected exposure. A bracketing pair is linearly interpolated in wavelength; otherwise the nearest valid spectral sample is used. Missing pixels without valid support stay missing.

The result is a display estimate, not a recovered measurement. The image caption reports its estimated percentage. Original arrays, variance, FITS files, eligibility coverage checks and motion measurements remain unchanged. Original/off restores the missing display pixels. Saved views retain the toggle and additional source paths/dates/wavelengths in exported records. Spectral features and source variability can make estimates inaccurate; they are not evidence of a discovery.

## Example views and site shell

Object search, coordinate entry and test-region links retain the actual source position rather than silently reverting to the cell centre. Orion opens a 0.30-degree field; Galactic Centre 0.30 degrees; Andromeda 0.35 degrees around its nucleus. Extended examples use a reusable percentile/asinh faint-detail stretch and low denoising. This reveals diffuse structure without claiming finer telescope resolution.

All pages share header dimensions, navigation and theme controls, including a consistent two-row mobile header. About replaces obsolete sample-review descriptions with current capabilities, methods, limits, data references, credits and AI disclosure.

The About content follows the current official [judging guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/) and [submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), both dated 13 November 2026 and read in the browser. The required formal project submission and separate seven-slide/30-second demo are not supplied by an About page. SPHEREx image/data interpretation is grounded in the [archive product documentation](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

## Verification

Unit tests cover spectral interpolation, immutable measured pixels, flagged/distant/time-incompatible exclusions and faint-detail response. Existing coordinate, cache, coverage, motion and saved-record tests pass.

Chromium and WebKit fixtures check a visible first image while the last header remains blocked, newest default, 320 slider inputs without history-rate failure, frozen drag dates, date labels, exact target coordinates, preserved source gaps with estimates off, nearby-band fills with estimates on, and save/reopen. All five routes share header geometry at 1366, 390 and 320 pixels. These browser fixtures do not establish live IRSA availability or validate a particular astronomical detection.

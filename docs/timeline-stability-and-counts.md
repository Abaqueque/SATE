# Timeline stability and exposure-count investigation

Implemented against main ddbc5d4.

- The full chosen sky field is now the default. The optional Fixed crop locks its rectangle from the first ready frame until the user changes framing or starts a new search. Changing dates no longer recalculates the crop.
- The timeline occupies a fixed-height grid row, so date buttons and progress text cannot resize the image viewport.
- Metadata is prefetched with bounded concurrency. Image jobs are dispatched oldest-first with up to ten jobs in parallel. Completions are published immediately, so loaded observations can be scrubbed or played while later requests continue. Completion order can differ from request order because archive response times differ.
- A drag keeps its original set of loaded observations until release, preventing incoming images from changing the meaning of the slider under the pointer.
- Start/End text has a dark SVG stroke painted behind the coloured letters.
- Exposure availability separates loaded frames, pending work, wavelength exclusions, field-coverage exclusions, centre coverage, and unavailable requests, and identifies curated demo sequences.

## Live archive comparison

See `exposure-count-audit.json` and the reproducible `scripts/audit-exposure-counts.mjs`.

At Orion (RA 83.8221°, Dec −5.3911°), channel 32 (1.592 microns), width 0.20°:

| Stage | Count |
| --- | ---: |
| Archive candidates from DR1/QR3 and deep collections | 59 |
| Successfully inspected headers | 59 |
| Exact selected channel at the field centre | 3 |
| Nearby wavelengths plus at least 80% header footprint coverage | 57 |
| Exact channel plus at least 80% header footprint coverage | 3 |

These are header-based counts; the viewer also verifies finite-pixel coverage after downloading each image. That extra check can exclude additional frames. The comparison is at identical coordinates, field width and archive search band. It demonstrates that a count near three can reflect the narrow wavelength selection, rather than missing downloads. Barnard's Star's query returned an archive HTTP 502 in this run; no count was inferred for it.

Other causes of differences:

1. SPHEREx uses a linear variable filter: wavelength varies with detector position. Images covering the same sky coordinates do not all measure the same wavelength there.
2. Survey repetition varies with sky position; regions near the ecliptic poles have deeper coverage.
3. The app excludes exposures with less than 80% full-field coverage; wider fields can reject more edge exposures. Quality-mask display settings do not change that coverage test.
4. Counts while loading are partial; failures are distinct from scientific filtering.
5. Moving-object demos can use a curated set of verified exposures rather than an unrestricted stationary-position archive query.
6. The app removes duplicate observation IDs within each detector band and searches both DR1 and QR3 collections; it does not impose a three- or five-image cap.

Official references:

- https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/overview.html
- https://spherex.caltech.edu/page/instrument
- https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html

Validation: 91 automated tests pass, including reversed metadata completion, chronological dispatch, progressive availability before the final frame, abort handling, fixed cropping across changing footprints, and exposure-exclusion counts. Atlas checks, coordinate checks, and release-addressed build pass.

Browser verification: the 3I/ATLAS first, last and intermediate frames all rendered on a 248×248 CSS-pixel canvas (117×117 science grid), with the stage staying 1000×248 CSS pixels. Both motion labels carried `stroke="#080808"` and `paint-order="stroke fill"`; no console errors were captured. A separate live Orion viewer request returned an IRSA HTTP 502 before its observation list arrived. Progressive availability under delayed and out-of-order responses is verified by the deterministic queue test; the successful Orion header audit above is from a separate archive request.

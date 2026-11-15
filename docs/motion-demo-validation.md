# Additional motion demos

Verified 15 November 2026 against public NASA/IPAC IRSA data.

## 3I/ATLAS

Source: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html
The original observation table is preserved in `3i-atlas-observations.vot`.
It lists 259 exposures, with per-exposure comet positions. The app uses 11
verified DR1 D5 exposures from 14 December 2025, 04:28:55–07:46:24 UTC, in a
fixed 0.20-degree field centred at RA 167.202°, Dec +5.1486°.

NASA ephemeris positions guide a three-pixel local search in each image. The
plotted coordinates are intensity-centroid fits to original aligned pixels;
missing fits are not replaced with predicted positions. This is necessary
because the comet moves too far between observing passes for the stellar
five-pixel search around the preceding position.

All 11 images loaded and yielded centroid fits. The approximate first-to-last
displacement is 9.58 arcminutes over 3.29 hours. Fits include flagged pixels,
and the local wavelengths vary from about 4.00 to 4.36 micrometres. This is a
motion demonstration, not calibrated photometry or precision astrometry.

The NASA page cautions that many SPHEREx wavelengths have low signal-to-noise
and that the comet is spatially extended. The demo therefore labels its guided
search and wavelength differences, and uses a selected short sequence rather
than presenting all 259 observations as equivalent measurements.

## Stellar alternatives

Kapteyn’s Star and Groombridge 1830 use SIMBAD positions/proper motions fetched
through CDS Sesame on 15 November 2026. Epoch-2026 navigation centres use linear
proper-motion propagation without parallax correction. Four exposures in the
1.592-micrometre channel bin were found for each object.

- Kapteyn: 18 August 2025 through 21 August 2026. Four centroid fits; approximate
  measured endpoint displacement 10.26 arcseconds in the research check.
- Groombridge 1830: 18 May 2025 through 24 May 2026. Four centroid fits;
  approximate endpoint displacement 9.66 arcseconds in the research check.

Bright-star flags, sampling and centroid bias affect these numbers. They should
not be interpreted as new proper-motion measurements. The stored verification
JSON files record the image IDs, wavelengths and positions used in these checks.

All examples reuse the green Start, orange End and accumulating path, with no
predicted crosshair. They are available in the atlas Test regions menu and the
comparison workspace Motion demos menu. Interpolation stays enabled by default.

All motion-demo links now enable nearby wavelengths by default, while retaining
the verified initial exposure pair. Users can switch nearby wavelengths off.

## Larger-motion search: Vesta, Ceres and Comet SWAN

Used NASA IRSA MOST (`catalog=spherex`, VOTable output), which computes moving
object positions and intersects them with the recorded exposure footprints.
API documentation: https://irsa.ipac.caltech.edu/applications/MOST/MOSTProgramInterface.html
Original query responses are stored as `most-vesta.txt`, `most-ceres.txt` and
`most-swan.txt`; derived validation records retain the exact archive image paths.

- **4 Vesta:** 319 matched exposures in the broader archive search. Selected ten
  D2 exposures from 30 June 2025 22:43 UTC to 2 July 2025 02:30 UTC. Fits in all
  ten: approximately 10.92 arcminutes over 27.78 hours in one 12-arcminute field.
- **1 Ceres:** 318 matches in the broader search. Selected seven D2 exposures
  from 22 December 2025 08:46 UTC to 23 December 2025 07:36 UTC. Fits in all seven:
  approximately 10.55 arcminutes over 22.83 hours.
- **C/2025 R2 (SWAN):** 20 archive matches on 27–28 October 2025. Selected four
  D4 exposures on 27 October, 04:52–04:58 UTC. Approximately 1.06 arcminutes over
  6.47 minutes. Independent D1 images show a consistent moving source as well.

MOST coordinates seed local three-pixel centroid searches. Fits use original
aligned pixels, retain flagged-pixel warnings and are approximate. These demos
span nearby local wavelengths; they are not calibrated brightness comparisons.
The large shift is visible in the images, not just an extrapolated catalogue
proper-motion line. Exposure integration can broaden the fast-moving comet.

Metadata queries now use each moving object's exposure-specific coordinates,
while the displayed sky grid remains fixed. Otherwise a frame could be wrongly
excluded when it covers the object but not the field centre. The selected-image
wavelength label and display-scale grouping use that source-position calibration.

C/2025 A6 (Lemmon) returned no matched SPHEREx images in the searched August–
November 2025 interval. MOST name lookup failed for the tested Wierzchos and
PANSTARRS designations; those are not classified as observational nondetections.
Only the three image-verified candidates were added to the menus.

Regional catalogue markers are now off by default. The inventory remains
available, and Show catalogue markers can enable the overlay for discovery.

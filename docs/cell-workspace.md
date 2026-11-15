# SPHEREx cell observation workspace

Open a HEALPix search cell and choose **Open region fully**. Direct links use `/explore/?hpx=<cell>&order=9&channel=<0–101>&view=cell`. The image remains grayscale. The sky-search palette is separate.

## Wavelength and time

The wavelength menu offers a single channel, All wavelengths, or a custom mix. A channel spans the midpoints to its adjacent channel centres. Single and mixed selections filter both the exposure list and individual pixels; there is no automatic substitution of another wavelength. All wavelengths shows every calibrated exposure covering the selected centre. These modes select a union of exposures, not a simultaneous broadband measurement.

The archive's detector-wide bandpass is only a preliminary search filter. Before an exposure appears, `/api/frame-info` evaluates the selected sky coordinate against that exposure's own full-image WCS and wavelength table, retrieved using byte ranges. Failed metadata checks are counted and retryable. The list fills progressively while checks run.

Every matching exposure is selectable, including multiple observations on one UTC date and exposures with fully masked pixels. Re-releases of the same exposure ID and detector are deduplicated. Timeline marks are positioned by elapsed observation time. Previous/next, playback, keyboard arrows and same-day time buttons navigate individual exposures. Dates, UTC time and actual centre wavelength remain visible.

The selected channel, mode, mix and exposure ID are retained in the URL. DR1, QR3 and their deep collections are queried. Search results are cached for ten minutes, calibration metadata uses bounded warm-instance caches, and the browser keeps up to 48 aligned image pairs. Changed selections cancel pending requests.

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

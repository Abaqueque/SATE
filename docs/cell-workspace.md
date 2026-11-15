# SPHEREx cell observation workspace

Open a native HEALPix search cell in the atlas, then choose **Open region fully**. A direct link uses `/explore/?hpx=<cell>&order=9&channel=<0–101>&view=cell`.

The left image is a dated SPHEREx Level 2 FITS exposure. The right rail contains the cell centre, wavelength target/window, false-colour or grayscale palette and display controls. The bottom timeline groups archive exposures by UTC observing date. Each date searches its candidate detector exposures until a usable centre-wavelength match is found. A date with no match remains explicitly unavailable; a nearby wavelength can be shown by an explicit action. One representative matching exposure is displayed per date, not an epoch coadd.

Data comes from NASA/IPAC IRSA's DR1, QR3 and corresponding deep collections. Re-released exposure IDs in the same detector band are deduplicated. Search metadata is cached for ten minutes in a bounded warm-instance cache; observation cutouts are fetched on demand and up to 36 aligned pairs are kept in the browser. Navigation and changed searches cancel pending requests. Archive transient errors are retried and remain visible if the request fails.

## Display processing

- FITS `IMAGE`, `FLAGS`, `VARIANCE`, `ZODI` and `WCS-WAVE` extensions are retained.
- TAN/SIP coordinates align the 12-arcminute context to north up, east left. Wavelengths are evaluated per pixel using the FITS lookup table.
- The default quality mask permits only nominal pixels and the source-mask bit. Zodiacal-model subtraction, two-pass bilateral denoising, asinh contrast and display interpolation are enabled initially.
- False colour maps **single-band infrared intensity** onto a Milky Way palette (deep blue, blue-violet, soft rose and warm cream), with a cooler blue–violet option; it is neither natural colour nor a multi-band RGB composite.
- Wavelength varies across an exposure. The centre must match the requested window; the optional **Isolate target band** control additionally masks pixels outside that window. The normal display preserves the wider spatial context.
- Optional gap repair estimates only enclosed single pixels with at least seven valid neighbours. It does not fill edges, large holes or spectral gaps. Estimated pixels are counted in the caption.
- **View original** shows the sky-aligned science values without quality masking, background subtraction, denoising or gap repair. Alignment and a display stretch are still applied. The complete original FITS is linked in Observation details.
- Pixel inspection reports the original aligned science intensity and wavelength, not cleaned display values. Rendering never overwrites the raw arrays.
- Contrast is recalculated per exposure. This viewer is for visual exploration; it does not claim calibrated brightness-change measurements or completed scientific reviews.

Reference: [IRSA SPHEREx spectral image tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/) and [quality flags](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html).

## Verification

`npm test` includes signal-preservation, noise suppression, masking, gap repair, palette, chronological deduplication and proxy input tests. `npm run build` also runs the atlas/HEALPix checks. `npm run dev` serves both atlas assets and the same observation/frame handlers used on Vercel.

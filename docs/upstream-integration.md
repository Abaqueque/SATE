# Integration with upstream updates

Merged the local inventory and motion work with upstream main through d657adb, including wavelength layers (#14), the charcoal/blue theme (#15), and sidebar search suggestions (#16).

Preserved the base layer plus four additional wavelength layers, per-layer hue/visibility/opacity, nearest-date selection, synchronized layer updates, left/right image comparison, and saved-cell notebook. The shared-coverage crop now applies the same source rectangle to every layer; its coordinate mapping is also used by catalogue and motion overlays.

Validation: 79 automated tests passed; atlas checks and route build passed. In the live Vesta preview, the base sequence loaded all 10 frames, Layer 2 rendered at 1.631 microns with colour and 45% opacity, and the comparison control rendered both dates. IRSA returned HTTP 503 for the right Layer 2 exposure, which was reported in the layer card; the left layer loaded. No browser console errors were captured. The latest sidebar markup and suggestion lifecycle were retained during conflict resolution.

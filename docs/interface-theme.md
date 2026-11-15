# SATE interface theme

The dark interface uses **#1A1A1A**, sampled from the user's reference image. The atlas backdrop outside the projected sky is **#000000**. Telescope image pixels, wavelength hue controls, and the distinct left/right timeline colours are separate from the interface palette.

`sky-atlas/dist/theme-tokens.css` owns surface, text, accent, interaction and focus colours. The page/rail background is the supplied charcoal; cards and fields use progressively lighter neutrals. NASA-inspired blue marks primary actions. Selected toggles use a subdued blue fill, lighter blue text and an inset edge. Hover, pressed, disabled and keyboard-focus states have distinct roles. Public Sans is bundled locally with its SIL Open Font License.

The sky sidebar puts cell information and navigation first, then object search, expanded coordinate entry and Wavelength. Search suggests common object identifiers and up to eight recent successful searches; any other name can still be submitted to CDS. Decorative horizontal separators, the old simulated-review action/status, map instructions, example shortcut and Map details block were removed. The dark-mode control has no outer frame. Actual Saved cells notebook reviews are unaffected. Dark is the default; an explicit saved light/dark choice is respected.

## Research

- [NASA's published legacy web palette](https://nasa.github.io/nasawds-site/components/colors/): #105BD8 primary and #0B3D91 darker blue. This is a legacy reference, not a claim that NASA defines this dark theme.
- [NASA Brand Guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/): Public Sans for readable web body text.
- [Radix colour roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale): separate background, component, state, border and text roles.
- [Carbon layering](https://www.carbondesignsystem.com/building-blocks/foundations/color/guidelines): consistent surface layers across components.

## Verification

Measured contrast ratios: primary text on charcoal 14.99:1; secondary text on raised surface 7.45:1; white on blue action 5.98:1; white on hover 5.19:1; selected text 7.02:1; control edge against field 3.16:1; focus outline against field 7.01:1. These checks cover the listed token pairs, not a full accessibility audit.

Aladin 3.8.1's `backgroundColor` option applies to unfilled sky inside the projection. Its renderer separately initializes the WebGL clear colour to `(0.1,0.1,0.1,1)`, leaving the exterior grey. SATE sets only that viewer's existing WebGL context clear colour to black, including context restoration. The sky-image palette and data processing are unchanged. Verify exterior pixels in rendered browser screenshots, not merely computed CSS.

## Observation sidebar hierarchy

The sidebar now has a compact cell title and Two views switch, wavelength layers, then collapsed Image adjustments, Motion tracking and Observation details. The RA/Dec readout and standing explanatory paragraphs are removed. Hue controls are only shown when Colour is enabled. The tools scroll independently above a stationary Document cell / Saved cells footer; mobile keeps the same bounded control panel. Motion demo links with active tracking open the tracking section.

Common wavelength shortcuts precede the full 102-channel list in the atlas, base layer, extra layers and mix picker. They select the nearest available SPHEREx channel to J (1.235 µm), H (1.662 µm), Kₛ (2.159 µm), W1 (3.4 µm) and W2 (4.6 µm). For the bundled metadata these are 1.224, 1.656, 2.139, 3.383 and 4.600 µm. The “Near” labels distinguish monochromatic SPHEREx channels from broadband 2MASS/WISE measurements. “Starlight”, “Through dust” and “Cool objects” are browsing cues, not classifications or promises that an object will be detected.

References: [IRSA 2MASS reference wavelengths](https://irsa.ipac.caltech.edu/data/SPITZER/docs/dataanalysistools/tools/pet/magtojy/ref.html), [IRSA WISE band definitions](https://irsa.ipac.caltech.edu/onlinehelp/wise/wise/overview.html), [2MASS infrared/dust overview](https://www.ipac.caltech.edu/2mass/outreach/survey.html), [WISE brown-dwarf discovery at 4.6 µm](https://arxiv.org/abs/1011.2279), [SPHEREx channel products](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-products/).

# SATE interface theme

The dark interface uses **#1A1A1A**, sampled from the user's reference image. The atlas backdrop outside the projected sky is **#000000**. Telescope image pixels, wavelength hue controls, and the distinct left/right timeline colours are separate from the interface palette.

`sky-atlas/dist/theme-tokens.css` owns surface, text, accent, interaction and focus colours. The page/rail background is the supplied charcoal; cards and fields use progressively lighter neutrals. NASA-inspired blue marks primary actions. Selected toggles use a subdued blue fill, lighter blue text and an inset edge. Hover, pressed, disabled and keyboard-focus states have distinct roles. Public Sans is bundled locally with its SIL Open Font License.

The sky sidebar puts cell information and navigation first, then Wavelength. Decorative horizontal separators and the old simulated-review action/status were removed. Map metadata remains in the collapsed details. Actual Saved cells notebook reviews are unaffected. Dark is the default; an explicit saved light/dark choice is respected.

## Research

- [NASA's published legacy web palette](https://nasa.github.io/nasawds-site/components/colors/): #105BD8 primary and #0B3D91 darker blue. This is a legacy reference, not a claim that NASA defines this dark theme.
- [NASA Brand Guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/): Public Sans for readable web body text.
- [Radix colour roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale): separate background, component, state, border and text roles.
- [Carbon layering](https://www.carbondesignsystem.com/building-blocks/foundations/color/guidelines): consistent surface layers across components.

## Verification

Measured contrast ratios: primary text on charcoal 14.99:1; secondary text on raised surface 7.45:1; white on blue action 5.98:1; white on hover 5.19:1; selected text 7.02:1; control edge against field 3.16:1; focus outline against field 7.01:1. These checks cover the listed token pairs, not a full accessibility audit.

Aladin 3.8.1's `backgroundColor` option applies to unfilled sky inside the projection. Its renderer separately initializes the WebGL clear colour to `(0.1,0.1,0.1,1)`, leaving the exterior grey. SATE sets only that viewer's existing WebGL context clear colour to black, including context restoration. The sky-image palette and data processing are unchanged. Verify exterior pixels in rendered browser screenshots, not merely computed CSS.

# Left and right wavelength controls

With Two viewers enabled, every wavelength card now has a visible **Show in: Left / Right / Both** selector directly below its wavelength menu. These controls are outside the collapsed Options section. To compare wavelengths, choose the first wavelength in Layer 1 and assign it Left, then add another wavelength and assign that layer Right. Both retains the existing overlay behavior.

Assignments govern loading, compositing, image crops, pixel readouts, known-object overlay eligibility and saved source records. URL parameter `layerTarget` preserves the ordered layer assignments; saved snapshots also retain each layer's `target`. Old URLs default to Both. In single-view mode the selector is hidden and all configured layers apply to the single image; returning to two viewers restores the saved assignments.

Validation: 111 tests and the production build pass. Chrome and WebKit checks verify that a right-only layer changes right image pixels while leaving the left image unchanged; controls remain visible with Options closed; reload and saved snapshots preserve assignments and source provenance; 320/390 px layouts fit. Fixture tests use distinct synthetic source positions to detect accidental mixing.

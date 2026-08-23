# Pixel Art Workbench PRD

## Outcome

Make high-detail reference-to-pixel workflows faster without hiding the artistic work still required. The tool should preserve composition and material separation well enough that the next hour is spent authoring pixels, not repairing converter noise.

## MVP capabilities

- PNG, JPEG, and WebP input.
- Editable alpha cutouts with connected-background sampling, erase/restore brushes, mask import, invert/reset, and bounded undo/redo.
- Transparent-bound trimming and configurable canonical padding.
- Deterministic area downsampling to a selected logical width.
- Scene-native target derivation from paired rendered-scene and logical-scene dimensions, including exact small-asset width and height.
- Median-cut-style palette extraction with a bounded ceiling.
- GPL/text palette import and asset-family palette locking.
- Sobel edge detection that blocks dithering and cleanup across significant edges.
- Edge-guarded Floyd–Steinberg dithering with a continuous strength control.
- Normalized polygon material regions with independent palette and dither settings.
- Connected-component cleanup for isolated same-color clusters.
- Live browser preview and diagnostics in a worker.
- Shared CLI implementation with PNG, GPL palette, JSON recipe, and optional Aseprite exports.
- Dedicated CLI resizer that emits exact 1x–16x raw-RGBA replicated scale sets and a machine-readable asset manifest, including lossless handling of partially transparent edges.

## Acceptance

- The same source and options produce byte-identical in-memory rasters.
- Total output colors do not exceed the union of configured palettes.
- Regions remain normalized and replay correctly at another source resolution with the same aspect ratio.
- Transparent source areas remain transparent.
- Mask edits never alter source RGB pixels and connected-background removal does not cross a rejected color boundary.
- Integer exports contain exact repeated canonical pixels with no interpolation.
- Scene-native exports reject conflicting axis densities and record their resolved detail box in the replayable recipe.
- Invalid ranges and malformed polygons fail at the external boundary.
- The browser visibly completes a local conversion and exposes all diagnostic/export surfaces.
- CLI output records source provenance, recipe, metrics, and artifact names.
- No output is described as finished or production-ready pixel art.

## Future candidates

- Lasso masks and soft-edge review tools.
- Optional local automatic-segmentation adapters whose model and license are explicit.
- Pixel-cluster inspection at multiple zoom levels.
- Aseprite extension UI consuming the same recipe schema.
- Batch recipes and asset-family consistency reports.

These candidates are not part of the MVP until validated against real authored cleanup sessions.

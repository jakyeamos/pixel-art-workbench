# Pixel Art Workbench PRD

## Outcome

Make high-detail reference-to-pixel workflows faster without hiding the artistic work still required. The tool should preserve composition and material separation well enough that the next hour is spent authoring pixels, not repairing converter noise.

## MVP capabilities

- PNG, JPEG, and WebP input.
- Deterministic area downsampling to a selected logical width.
- Median-cut-style palette extraction with a bounded ceiling.
- Sobel edge detection that blocks dithering and cleanup across significant edges.
- Edge-guarded Floyd–Steinberg dithering with a continuous strength control.
- Normalized polygon material regions with independent palette and dither settings.
- Connected-component cleanup for isolated same-color clusters.
- Live browser preview and diagnostics in a worker.
- Shared CLI implementation with PNG, GPL palette, JSON recipe, and optional Aseprite exports.

## Acceptance

- The same source and options produce byte-identical in-memory rasters.
- Total output colors do not exceed the union of configured palettes.
- Regions remain normalized and replay correctly at another source resolution with the same aspect ratio.
- Transparent source areas remain transparent.
- Invalid ranges and malformed polygons fail at the external boundary.
- The browser visibly completes a local conversion and exposes all diagnostic/export surfaces.
- CLI output records source provenance, recipe, metrics, and artifact names.
- No output is described as finished or production-ready pixel art.

## Future candidates

- Palette pinning and locked colors.
- Lasso and brush-based region masks.
- Pixel-cluster inspection at multiple zoom levels.
- Aseprite extension UI consuming the same recipe schema.
- Batch recipes and asset-family consistency reports.

These candidates are not part of the MVP until validated against real authored cleanup sessions.

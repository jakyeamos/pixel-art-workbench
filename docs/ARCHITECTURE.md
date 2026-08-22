# Architecture

## Shared core

`src/core` owns all deterministic image behavior and has no React, DOM, Sharp, or Aseprite dependency. `assets.ts` owns masks, connected-background clearing, transparent trimming, palette parsing, and nearest-neighbor scaling. The processing core accepts raw RGBA rasters plus a validated recipe and returns the underpainting, diagnostics, palettes, and metrics.

## Browser workbench

`src/App.tsx` owns the staged import, cutout, underpaint, and export interaction. It keeps the original RGBA source immutable, stores a same-size one-channel alpha mask, and delegates the prepared raster to `src/workbench/processor.worker.ts`. Browser decoding and PNG downloads remain in `src/workbench/image.ts`. The source image is never transmitted.

## CLI

`src/cli/index.ts` uses Sharp only for decoding and encoding. Conversion calls the same mask, trim, palette, and processing core used by the browser. The separate `resize` command never runs the underpainting algorithm; it treats its input as the canonical pixel grid and calls the core's raw RGBA replication scaler so partial-alpha pixels cannot be rounded by an image-library resize path. JSON manifests include a SHA-256 source digest so outputs can be matched to their source without embedding it.

## Aseprite handoff

`src/cli/aseprite.ts` writes a bounded Lua script and invokes Aseprite in batch mode with explicit arguments. The underpainting is visible; diagnostic layers are hidden. The handoff does not install extensions or modify Aseprite preferences.

## Algorithm order

1. Apply the alpha mask without changing source RGB values.
2. Trim transparent source bounds when asset mode is enabled.
3. Premultiplied-alpha area downsample.
4. Normalize polygons into a per-pixel material map.
5. Compute the luminance edge map.
6. Use the locked family palette or extract global and material palettes.
7. Quantize with edge-guarded error diffusion.
8. Replace sub-threshold connected clusters unless protected by edge strength.
9. Generate diagnostics and color counts.
10. Trim and pad the canonical underpainting, then create only requested integer display scales by exact raw RGBA pixel replication.

This order is part of the replay contract. Algorithm changes require a schema or generator-version review because old recipes may produce different pixels.

## Automatic cutout adapters

The core deliberately accepts a mask instead of owning a segmentation model. This keeps browser processing offline, recipes deterministic, and the MIT distribution free of hidden model-license or download requirements. A future adapter may produce a mask locally, but it must remain optional and declare its executable, model, license, and failure behavior. The imported mask boundary is already stable.

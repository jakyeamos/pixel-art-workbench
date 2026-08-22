# Architecture

## Shared core

`src/core` owns all deterministic image behavior and has no React, DOM, Sharp, or Aseprite dependency. It accepts raw RGBA rasters plus a validated recipe and returns the underpainting, diagnostics, palettes, and metrics.

## Browser workbench

`src/App.tsx` owns interaction and delegates processing to `src/workbench/processor.worker.ts`. Browser decoding and PNG downloads remain in `src/workbench/image.ts`. The source image is never transmitted.

## CLI

`src/cli/index.ts` uses Sharp only for decoding and encoding. It calls the same core used by the browser. The JSON manifest includes a SHA-256 source digest so a recipe can be matched to its reference without embedding the reference.

## Aseprite handoff

`src/cli/aseprite.ts` writes a bounded Lua script and invokes Aseprite in batch mode with explicit arguments. The underpainting is visible; diagnostic layers are hidden. The handoff does not install extensions or modify Aseprite preferences.

## Algorithm order

1. Premultiplied-alpha area downsample.
2. Normalize polygons into a per-pixel material map.
3. Compute the luminance edge map.
4. Extract global and material palettes.
5. Quantize with edge-guarded error diffusion.
6. Replace sub-threshold connected clusters unless protected by edge strength.
7. Generate diagnostics and color counts.

This order is part of the replay contract. Algorithm changes require a schema or generator-version review because old recipes may produce different pixels.

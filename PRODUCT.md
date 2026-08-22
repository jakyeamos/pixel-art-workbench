# Product contract

## Identity

Pixel Art Workbench is a local-first production utility for turning image references into deterministic, inspectable pixel-art underpaintings.

## Primary user

An artist or developer who begins from photography, generated concept art, or a rendered composition and wants a controlled bridge into authored pixel work.

## Core loop

Import a reference, reduce its logical resolution, constrain its palette, protect meaningful edges, assign material regions, inspect cleanup diagnostics, export a reproducible bundle, and finish the artwork in Aseprite.

## Product promises

- Identical source bytes and recipes yield identical raster output.
- Browser processing is local and has no upload or account requirement.
- Material regions can receive independent palette and dithering budgets.
- Diagnostics reveal protected edges and automated cluster changes.
- Every export records that it is a reference underpainting, not finished art.
- Aseprite integration uses files and its documented command surface rather than automating its visible UI.

## Non-goals

- Claiming automated conversions are production-ready pixel art.
- Generative image synthesis or prompt-based retouching.
- Replacing authored silhouette, cluster, texture, lighting, or typography work.
- Cloud storage, collaboration, accounts, telemetry, or asset custody.
- Arbitrary browser plugins or third-party processing services.

## Privacy and custody

Input pixels remain on the local machine. The browser app processes them in a Web Worker; the CLI reads and writes explicitly named local files. Recipes include the input filename and SHA-256 hash but never embed the source image.

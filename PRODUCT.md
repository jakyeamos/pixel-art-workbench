# Product contract

## Identity

Pixel Art Workbench is a local-first production utility for turning image references into cutout, deterministic, inspectable pixel-art underpaintings and reusable canonical sprite scale sets.

## Primary user

An artist or developer who begins from photography, generated concept art, or a rendered composition and wants a controlled bridge into authored pixel work.

## Core loop

Import a reference, remove or mask its background, choose an asset profile, constrain or lock its palette, protect meaningful edges, assign material regions, inspect cleanup diagnostics, export a reproducible bundle, finish the artwork in Aseprite, and derive integer display scales from the authored canonical sprite.

## Product promises

- Identical source bytes and recipes yield identical raster output.
- Browser processing is local and has no upload or account requirement.
- Material regions can receive independent palette and dithering budgets.
- Alpha masks can be imported or edited locally with sampled-background, erase, restore, undo, and redo tools.
- A locked palette can keep a family of independently processed assets visually coherent.
- Diagnostics reveal protected edges and automated cluster changes.
- Every export records that it is a reference underpainting, not finished art.
- Integer nearest-neighbor exports preserve every canonical pixel and explicitly do not claim to create new detail.
- Aseprite integration uses files and its documented command surface rather than automating its visible UI.

## Non-goals

- Claiming automated conversions are production-ready pixel art.
- Generative image synthesis or prompt-based retouching.
- Replacing authored silhouette, cluster, texture, lighting, or typography work.
- Pretending that a 32-pixel and 96-pixel detail budget are the same authored asset.
- Bundling a remote or heavyweight automatic-segmentation model.
- Cloud storage, collaboration, accounts, telemetry, or asset custody.
- Arbitrary browser plugins or third-party processing services.

## Privacy and custody

Input pixels remain on the local machine. The browser app processes them in a Web Worker; the CLI reads and writes explicitly named local files. Recipes include the input filename and SHA-256 hash but never embed the source image.

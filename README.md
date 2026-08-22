# Pixel Art Workbench

A local-first asset workbench for turning photographs, generated references, and rendered compositions into editable pixel-art underpaintings. It includes background masking, reusable size profiles, palette locking, edge-preserving dithering, material-specific palettes, cluster cleanup, Aseprite handoff, and exact integer scaling for finished canonical sprites.

This tool does **not** label converted output as finished pixel art. Every export is marked `reference-underpainting`; silhouette correction, pixel clusters, selective detail, typography, material texture, and lighting still require human authorship.

## Why it exists

Generic image-to-pixel converters apply one resize and one palette to the entire composition. That is useful for a rough reference but breaks down when the subject needs a clean silhouette, an existing project palette, or separate budgets for paper, brass, wood, fabric, skin, and light. Pixel Art Workbench keeps those operations local, inspectable, and replayable.

## Use the browser workbench

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`, drop in a PNG, JPEG, or WebP, then:

1. Pick a connected background color, paint with erase/restore, or import an existing alpha mask. Undo and redo retain up to 20 cutout checkpoints within a 64 MB memory budget.
2. Choose an icon, small-prop, desk-prop, portrait, or scene profile, then tune its logical width and cleanup budget.
3. Extract colors from the reference or import a GPL/text palette to lock an entire asset family to the same colors.
4. Trace material regions when paper, wood, brass, ceramic, light, or another surface needs its own palette and dither budget.
5. Export the trimmed canonical underpainting, alpha mask, diagnostics, palette, and replayable recipe.
6. Finish the important silhouette, clusters, lighting, texture, and lettering in Aseprite. Use the integer resizer on that canonical sprite for display-size PNGs.

Images stay in the browser process. The app has no upload endpoint, account, analytics, or remote model dependency.

## Use the CLI

```sh
pnpm cli -- reference.png --out workbench-output --width 480 --colors 64
```

Reuse a project recipe exported from the browser:

```sh
pnpm cli -- reference.png --config reference.pixel-workbench.json --out workbench-output
```

Create a layered Aseprite handoff:

```sh
pnpm cli -- reference.png --out workbench-output --aseprite
```

Apply an alpha/grayscale mask, lock a shared palette, and export several integer scales:

```sh
pnpm cli -- cat.jpg --mask cat-mask.png --palette office.gpl --width 96 --scales 1,2,3,4 --padding 2 --out cat-underpainting
```

After the human cleanup pass, derive lossless display scales from one canonical sprite:

```sh
pnpm cli -- resize cat-authored.png --trim --padding 1 --scales 1,2,3,4,6 --out cat-scales
```

The resizer uses nearest-neighbor interpolation only. Use one canonical PNG plus CSS `image-rendering: pixelated` when the browser can scale it directly. A smaller or larger _logical detail budget_ is a retargeting task and still needs authored pixel decisions.

The CLI looks for `ASEPRITE_BIN`, an `aseprite` executable on `PATH`, then `/Applications/Aseprite.app/Contents/MacOS/aseprite`. The `.aseprite` output contains the underpainting plus hidden protected-edge and cluster-cleanup diagnostic layers.

## Export contract

- `underpainting.png` — trimmed logical-resolution working reference.
- `underpainting-Nx.png` — requested nearest-neighbor display scales.
- `alpha-mask.png` — imported cutout mask when `--mask` is used.
- `diagnostic-edges.png` — pixels protected from error diffusion and cleanup.
- `diagnostic-cleanup.png` — color clusters changed by cleanup.
- `palette.gpl` — GIMP/Aseprite-compatible palette.
- `project.json` — source hash, exact options, metrics, palettes, and artifact map.
- `underpainting.aseprite` — optional layered Aseprite handoff.
- `asset-Nx.png` and `asset.json` — canonical scale set produced by the `resize` command.

## Cutout boundary

The bundled cutout tools are deterministic and local: connected-color sampling, hard erase/restore brushes, imported masks, and undo/redo. They work especially well when a subject has a distinct or mostly uniform background. Complex fur, translucent edges, and busy scenes still need a careful mask or a separate local segmentation tool. The workbench intentionally does not download a model, call a cloud service, or silently change the source subject.

Undo/redo retains up to 20 mask checkpoints within a 64 MB in-memory budget, so large source images do not create unbounded history growth.
The cutout canvas also supports Command/Ctrl+Z and Command/Ctrl+Shift+Z; shortcuts are ignored while editing form fields.

## Quality gates

```sh
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm test:e2e
pnpm check:dead-code
pnpm build
```

## Repository model

`main` is the deployable lane and `dev` is the integration lane. The browser interface and CLI both import the same TypeScript processing core. Output formats, algorithms, or workflow changes must update tests, documentation, and `.agents/change-surface-matrix.json` together.

The source is published at [github.com/jakyeamos/pixel-art-workbench](https://github.com/jakyeamos/pixel-art-workbench) under the [MIT License](LICENSE).

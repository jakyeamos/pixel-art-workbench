# Pixel Art Workbench

A local-first, region-aware image preprocessor for producing editable pixel-art underpaintings. It gives artists control over logical resolution, palette size, edge-preserving dithering, material-specific palettes, and small-cluster cleanup before the image moves into Aseprite for authored pixel work.

This tool does **not** label converted output as finished pixel art. Every export is marked `reference-underpainting`; silhouette correction, pixel clusters, selective detail, typography, material texture, and lighting still require human authorship.

## Why it exists

Generic image-to-pixel converters apply one resize and one palette to the entire composition. That is useful for a rough reference but breaks down when paper, brass, wood, fabric, skin, and light need different color budgets. Pixel Art Workbench adds normalized polygon regions so those materials can be processed independently without making the workflow nondeterministic.

## Use the browser workbench

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`, drop in a PNG, JPEG, or WebP, then:

1. Set the logical width and global palette ceiling.
2. Tune edge lock, dithering, and isolated-cluster cleanup.
3. Trace material regions directly over the preview when a surface needs its own palette.
4. Export the underpainting, diagnostics, palette, and replayable project recipe.

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

The CLI looks for `ASEPRITE_BIN`, an `aseprite` executable on `PATH`, then `/Applications/Aseprite.app/Contents/MacOS/aseprite`. The `.aseprite` output contains the underpainting plus hidden protected-edge and cluster-cleanup diagnostic layers.

## Export contract

- `underpainting.png` — logical-resolution working reference.
- `underpainting-2x.png` — nearest-neighbor review preview.
- `diagnostic-edges.png` — pixels protected from error diffusion and cleanup.
- `diagnostic-cleanup.png` — color clusters changed by cleanup.
- `palette.gpl` — GIMP/Aseprite-compatible palette.
- `project.json` — source hash, exact options, metrics, palettes, and artifact map.
- `underpainting.aseprite` — optional layered Aseprite handoff.

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

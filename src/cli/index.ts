#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";
import type { Sharp } from "sharp";

import {
  applyAlphaMask,
  maskDiagnostic,
  maskFromRaster,
  parsePaletteText,
  scaleNearest,
  trimTransparent,
} from "../core/assets";
import {
  projectConfigSchema,
  processOptionsSchema,
  sceneSizingSchema,
} from "../core/contracts";
import { processRaster } from "../core/process";
import { deriveSceneNativeSize } from "../core/sceneSizing";
import {
  DEFAULT_OPTIONS,
  type ProcessOptions,
  type Raster,
  type SceneSizing,
} from "../core/types";
import { createAsepriteBundle } from "./aseprite";

interface SharedArguments {
  readonly input: string;
  readonly outputDirectory: string;
  readonly scales: readonly number[];
  readonly trim: boolean;
  readonly padding: number;
}

interface ConvertArguments extends SharedArguments {
  readonly command: "convert";
  readonly config?: string;
  readonly mask?: string;
  readonly palette?: string;
  readonly aseprite: boolean;
  readonly asepriteBin?: string;
  readonly sceneSizing?: SceneSizing;
  readonly overrides: Partial<
    Pick<
      ProcessOptions,
      | "targetWidth"
      | "maxColors"
      | "dither"
      | "edgeThreshold"
      | "minClusterSize"
    >
  >;
}

interface ResizeArguments extends SharedArguments {
  readonly command: "resize";
}

type CliArguments = ConvertArguments | ResizeArguments;

function usage(): string {
  return `Pixel Art Workbench CLI

Convert a reference into an editable underpainting:
  pixel-workbench <image> [options]

Build lossless integer scales from one canonical pixel sprite:
  pixel-workbench resize <image> [options]

Conversion options:
  --config <project.json> Reuse a browser or CLI project recipe
  --mask <image>          Apply a grayscale or alpha cutout mask
  --palette <file>        Lock colors from a GPL or #RRGGBB text palette
  --width <pixels>        Logical output width
  --scene-render <WxH>    Existing rendered scene dimensions
  --scene-logical <WxH>   Authored logical scene dimensions
  --colors <count>        Extracted palette ceiling
  --dither <0..1>         Edge-guarded Floyd-Steinberg strength
  --edge <0..1>           Edge-lock threshold
  --min-cluster <pixels>  Remove isolated color clusters below this size
  --aseprite              Build a layered .aseprite handoff
  --aseprite-bin <path>   Explicit Aseprite executable

Shared asset options:
  --out <directory>       Export directory
  --scales <list>         Integer PNG scales, for example 1,2,3,4
  --trim                   Crop transparent bounds before scaling
  --no-trim                Preserve the full source canvas
  --padding <pixels>       Transparent padding after trim (0..256)
  --help                   Show this message

Conversion outputs remain reference underpaintings. Human pixel cleanup is still required.
Integer scaling preserves pixels but never creates a new detail level.`;
}

function dimensionsValue(
  name: string,
  value: string | undefined,
): {
  readonly width: number;
  readonly height: number;
} {
  if (!value) throw new Error(`${name} requires WIDTHxHEIGHT.`);
  const match = /^(\d+)x(\d+)$/i.exec(value);
  if (!match) throw new Error(`${name} must use WIDTHxHEIGHT.`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1
  )
    throw new Error(`${name} dimensions must be positive integers.`);
  return { width, height };
}

function numberValue(name: string, value: string | undefined): number {
  if (value === undefined) throw new Error(`${name} requires a value.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${name} must be a finite number.`);
  return parsed;
}

function scalesValue(value: string | undefined): readonly number[] {
  if (!value) throw new Error("--scales requires a comma-separated list.");
  const scales = [...new Set(value.split(",").map(Number))];
  if (
    scales.length === 0 ||
    scales.some((scale) => !Number.isInteger(scale) || scale < 1 || scale > 16)
  )
    throw new Error("--scales accepts unique integers from 1 through 16.");
  return [...new Set([1, ...scales])].sort((left, right) => left - right);
}

export function parseArguments(argv: readonly string[]): CliArguments | null {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  if (normalized.includes("--help") || normalized.includes("-h")) return null;
  const command = normalized[0] === "resize" ? "resize" : "convert";
  const values = command === "resize" ? normalized.slice(1) : normalized;
  let input: string | undefined;
  let outputDirectory =
    command === "resize" ? "pixel-asset-scales" : "pixel-workbench-output";
  let config: string | undefined;
  let mask: string | undefined;
  let palette: string | undefined;
  let aseprite = false;
  let asepriteBin: string | undefined;
  let sceneRender:
    | { readonly width: number; readonly height: number }
    | undefined;
  let sceneLogical:
    | { readonly width: number; readonly height: number }
    | undefined;
  let scales: readonly number[] = command === "resize" ? [1, 2, 3, 4] : [1, 2];
  let trim = command === "convert";
  let padding = command === "convert" ? 1 : 0;
  const overrides: Record<string, number> = {};

  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (!argument) continue;
    if (!argument.startsWith("-")) {
      if (input) throw new Error(`Unexpected positional argument: ${argument}`);
      input = argument;
      continue;
    }
    if (argument === "--aseprite") {
      if (command === "resize")
        throw new Error("--aseprite is only available during conversion.");
      aseprite = true;
      continue;
    }
    if (argument === "--trim" || argument === "--no-trim") {
      trim = argument === "--trim";
      continue;
    }
    const value = values[++index];
    switch (argument) {
      case "--out":
        if (!value) throw new Error("--out requires a directory.");
        outputDirectory = value;
        break;
      case "--scales":
        scales = scalesValue(value);
        break;
      case "--padding":
        padding = numberValue(argument, value);
        if (!Number.isInteger(padding) || padding < 0 || padding > 256)
          throw new Error("--padding must be an integer from 0 through 256.");
        trim = true;
        break;
      case "--config":
      case "--mask":
      case "--palette":
      case "--aseprite-bin":
        if (command === "resize")
          throw new Error(`${argument} is only available during conversion.`);
        if (!value) throw new Error(`${argument} requires a file.`);
        if (argument === "--config") config = value;
        if (argument === "--mask") mask = value;
        if (argument === "--palette") palette = value;
        if (argument === "--aseprite-bin") asepriteBin = value;
        break;
      case "--scene-render":
      case "--scene-logical": {
        if (command === "resize")
          throw new Error(`${argument} is only available during conversion.`);
        const dimensions = dimensionsValue(argument, value);
        if (argument === "--scene-render") sceneRender = dimensions;
        else sceneLogical = dimensions;
        break;
      }
      case "--width":
      case "--colors":
      case "--dither":
      case "--edge":
      case "--min-cluster": {
        if (command === "resize")
          throw new Error(`${argument} is only available during conversion.`);
        const key = {
          "--width": "targetWidth",
          "--colors": "maxColors",
          "--dither": "dither",
          "--edge": "edgeThreshold",
          "--min-cluster": "minClusterSize",
        }[argument];
        if (key) overrides[key] = numberValue(argument, value);
        break;
      }
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!input) throw new Error("An input image is required.");
  if (Boolean(sceneRender) !== Boolean(sceneLogical))
    throw new Error(
      "--scene-render and --scene-logical must be supplied together.",
    );
  if (sceneRender && sceneLogical && overrides.targetWidth !== undefined)
    throw new Error("--width cannot be combined with scene-native sizing.");
  const shared = { input, outputDirectory, scales, trim, padding } as const;
  if (command === "resize") return { command, ...shared };
  return {
    command,
    ...shared,
    ...(config ? { config } : {}),
    ...(mask ? { mask } : {}),
    ...(palette ? { palette } : {}),
    aseprite,
    ...(asepriteBin ? { asepriteBin } : {}),
    ...(sceneRender && sceneLogical
      ? {
          sceneSizing: sceneSizingSchema.parse({
            renderWidth: sceneRender.width,
            renderHeight: sceneRender.height,
            logicalWidth: sceneLogical.width,
            logicalHeight: sceneLogical.height,
          }),
        }
      : {}),
    overrides,
  };
}

async function readConfiguration(arguments_: ConvertArguments): Promise<{
  readonly options: ProcessOptions;
  readonly sceneSizing?: SceneSizing;
}> {
  let options = DEFAULT_OPTIONS;
  let sceneSizing = arguments_.sceneSizing;
  if (arguments_.config) {
    const parsed = projectConfigSchema.parse(
      JSON.parse(await readFile(resolve(arguments_.config), "utf8")),
    );
    options = parsed.options;
    if (!sceneSizing && arguments_.overrides.targetWidth === undefined)
      sceneSizing = parsed.sceneSizing;
  }
  if (arguments_.palette) {
    const colors = parsePaletteText(
      await readFile(resolve(arguments_.palette), "utf8"),
    );
    if (colors.length < 2)
      throw new Error("Palette files need at least two RGB colors.");
    options = { ...options, lockedPalette: colors };
  }
  const parsedOptions = processOptionsSchema.parse({
    ...options,
    ...arguments_.overrides,
  });
  return {
    options: parsedOptions,
    ...(sceneSizing ? { sceneSizing } : {}),
  };
}

async function readRaster(
  path: string,
): Promise<{ readonly raster: Raster; readonly source: Buffer }> {
  const source = await readFile(path);
  const decoded = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decoded.info.width * decoded.info.height > 64_000_000)
    throw new Error("CLI inputs are limited to 64 megapixels.");
  return {
    source,
    raster: {
      width: decoded.info.width,
      height: decoded.info.height,
      data: new Uint8ClampedArray(decoded.data),
    },
  };
}

function raw(raster: Raster): Sharp {
  return sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  });
}

async function writeRaster(
  path: string,
  raster: Raster,
  scale = 1,
): Promise<void> {
  await raw(scaleNearest(raster, scale))
    .png({ compressionLevel: 9 })
    .toFile(path);
}

function paletteFile(colors: readonly { readonly hex: string }[]): string {
  const rows = colors.map(({ hex }) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}\t${hex}`;
  });
  return [
    "GIMP Palette",
    "Name: Pixel Art Workbench",
    "Columns: 8",
    "# Reference-underpainting palette",
    ...rows,
    "",
  ].join("\n");
}

async function runResize(arguments_: ResizeArguments): Promise<void> {
  const inputPath = resolve(arguments_.input);
  const outputDirectory = resolve(arguments_.outputDirectory);
  const { raster, source } = await readRaster(inputPath);
  const canonical = arguments_.trim
    ? trimTransparent(raster, arguments_.padding)
    : raster;
  await mkdir(outputDirectory, { recursive: true });
  const artifacts = Object.fromEntries(
    arguments_.scales.map((scale) => [`${scale}x`, `asset-${scale}x.png`]),
  );
  await Promise.all(
    arguments_.scales.map((scale) =>
      writeRaster(
        join(outputDirectory, `asset-${scale}x.png`),
        canonical,
        scale,
      ),
    ),
  );
  await writeFile(
    join(outputDirectory, "asset.json"),
    `${JSON.stringify(
      {
        schema: "pixel-workbench-asset/v1",
        provenance: "canonical-pixel-scale-set",
        source: basename(inputPath),
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        canonical: { width: canonical.width, height: canonical.height },
        trim: arguments_.trim,
        transparentPadding: arguments_.padding,
        scaling: "integer-nearest-neighbor",
        css: "image-rendering: pixelated",
        artifacts,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(
    `Wrote canonical pixel scale set to ${outputDirectory}\n`,
  );
}

async function runConvert(arguments_: ConvertArguments): Promise<void> {
  const inputPath = resolve(arguments_.input);
  const outputDirectory = resolve(arguments_.outputDirectory);
  const configuration = await readConfiguration(arguments_);
  const { raster, source } = await readRaster(inputPath);
  let prepared = raster;
  let maskRaster: Raster | undefined;
  if (arguments_.mask) {
    const imported = await readRaster(resolve(arguments_.mask));
    const mask = maskFromRaster(imported.raster, raster.width, raster.height);
    prepared = applyAlphaMask(raster, mask);
    maskRaster = maskDiagnostic(mask);
  }
  if (arguments_.trim) prepared = trimTransparent(prepared);
  const sceneNative = configuration.sceneSizing
    ? deriveSceneNativeSize(
        prepared.width,
        prepared.height,
        configuration.sceneSizing,
      )
    : undefined;
  const options = processOptionsSchema.parse({
    ...configuration.options,
    ...(sceneNative
      ? { targetWidth: sceneNative.width, targetHeight: sceneNative.height }
      : {}),
  });
  const result = processRaster(prepared, options);
  const canonical = arguments_.trim
    ? trimTransparent(result.underpainting, arguments_.padding)
    : result.underpainting;
  await mkdir(outputDirectory, { recursive: true });
  const scaledArtifacts = Object.fromEntries(
    arguments_.scales.map((scale) => [
      `${scale}x`,
      scale === 1 ? "underpainting.png" : `underpainting-${scale}x.png`,
    ]),
  );
  await Promise.all([
    ...arguments_.scales.map((scale) =>
      writeRaster(
        join(
          outputDirectory,
          scale === 1 ? "underpainting.png" : `underpainting-${scale}x.png`,
        ),
        canonical,
        scale,
      ),
    ),
    writeRaster(
      join(outputDirectory, "diagnostic-edges.png"),
      result.edgeDiagnostic,
    ),
    writeRaster(
      join(outputDirectory, "diagnostic-cleanup.png"),
      result.cleanupDiagnostic,
    ),
    writeFile(
      join(outputDirectory, "palette.gpl"),
      paletteFile(result.palette),
      "utf8",
    ),
    ...(maskRaster
      ? [writeRaster(join(outputDirectory, "alpha-mask.png"), maskRaster)]
      : []),
  ]);
  const manifest = {
    schema: "pixel-workbench-project/v3",
    provenance: "reference-underpainting",
    generator: { name: "pixel-art-workbench", version: "0.2.0" },
    source: basename(inputPath),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    options,
    ...(configuration.sceneSizing && sceneNative
      ? {
          sceneSizing: {
            ...configuration.sceneSizing,
            resolvedWidth: sceneNative.width,
            resolvedHeight: sceneNative.height,
            densityX: sceneNative.densityX,
            densityY: sceneNative.densityY,
          },
        }
      : {}),
    asset: {
      canonicalWidth: canonical.width,
      canonicalHeight: canonical.height,
      trim: arguments_.trim,
      transparentPadding: arguments_.padding,
      scaling: "integer-nearest-neighbor",
      css: "image-rendering: pixelated",
    },
    palette: result.palette,
    regionPalettes: result.regionPalettes,
    metrics: result.metrics,
    artifacts: {
      underpainting: "underpainting.png",
      scales: scaledArtifacts,
      protectedEdges: "diagnostic-edges.png",
      clusterCleanup: "diagnostic-cleanup.png",
      palette: "palette.gpl",
      ...(maskRaster ? { alphaMask: "alpha-mask.png" } : {}),
    },
  } as const;
  await writeFile(
    join(outputDirectory, "project.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  if (arguments_.aseprite)
    await createAsepriteBundle({
      outputDirectory,
      ...(arguments_.asepriteBin ? { executable: arguments_.asepriteBin } : {}),
    });
  process.stdout.write(
    `Wrote reference underpainting bundle to ${outputDirectory}\n`,
  );
}

export async function run(argv: readonly string[]): Promise<void> {
  const arguments_ = parseArguments(argv);
  if (!arguments_) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (arguments_.command === "resize") await runResize(arguments_);
  else await runConvert(arguments_);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Unknown error"}\n`,
    );
    process.exitCode = 1;
  });
}

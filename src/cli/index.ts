#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import sharp from "sharp";
import type { Sharp } from "sharp";

import { projectConfigSchema, processOptionsSchema } from "../core/contracts";
import { processRaster } from "../core/process";
import {
  DEFAULT_OPTIONS,
  type ProcessOptions,
  type Raster,
} from "../core/types";
import { createAsepriteBundle } from "./aseprite";

interface CliArguments {
  readonly input: string;
  readonly outputDirectory: string;
  readonly config?: string;
  readonly aseprite: boolean;
  readonly asepriteBin?: string;
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

function usage(): string {
  return `Pixel Art Workbench CLI

Usage:
  pixel-workbench <image> [options]

Options:
  --out <directory>       Export directory (default: ./pixel-workbench-output)
  --config <project.json> Reuse a browser or CLI project recipe
  --width <pixels>        Logical output width
  --colors <count>        Global palette ceiling
  --dither <0..1>         Edge-guarded Floyd-Steinberg strength
  --edge <0..1>           Edge-lock threshold
  --min-cluster <pixels>  Remove isolated color clusters below this size
  --aseprite              Build a layered .aseprite handoff
  --aseprite-bin <path>   Explicit Aseprite executable
  --help                   Show this message

Outputs are reference underpaintings. Human pixel cleanup is still required.`;
}

function numberValue(name: string, value: string | undefined): number {
  if (value === undefined) throw new Error(`${name} requires a value.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new Error(`${name} must be a finite number.`);
  return parsed;
}

export function parseArguments(argv: readonly string[]): CliArguments | null {
  if (argv.includes("--help") || argv.includes("-h")) return null;
  let input: string | undefined;
  let outputDirectory = "pixel-workbench-output";
  let config: string | undefined;
  let aseprite = false;
  let asepriteBin: string | undefined;
  const overrides: Record<string, number> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) continue;
    if (!argument.startsWith("-")) {
      if (input) throw new Error(`Unexpected positional argument: ${argument}`);
      input = argument;
      continue;
    }
    if (argument === "--aseprite") {
      aseprite = true;
      continue;
    }
    const value = argv[++index];
    switch (argument) {
      case "--out":
        if (!value) throw new Error("--out requires a directory.");
        outputDirectory = value;
        break;
      case "--config":
        if (!value) throw new Error("--config requires a file.");
        config = value;
        break;
      case "--aseprite-bin":
        if (!value) throw new Error("--aseprite-bin requires a path.");
        asepriteBin = value;
        break;
      case "--width":
        overrides.targetWidth = numberValue(argument, value);
        break;
      case "--colors":
        overrides.maxColors = numberValue(argument, value);
        break;
      case "--dither":
        overrides.dither = numberValue(argument, value);
        break;
      case "--edge":
        overrides.edgeThreshold = numberValue(argument, value);
        break;
      case "--min-cluster":
        overrides.minClusterSize = numberValue(argument, value);
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }
  if (!input) throw new Error("An input image is required.");
  return {
    input,
    outputDirectory,
    ...(config ? { config } : {}),
    aseprite,
    ...(asepriteBin ? { asepriteBin } : {}),
    overrides,
  };
}

async function readOptions(arguments_: CliArguments): Promise<ProcessOptions> {
  let options = DEFAULT_OPTIONS;
  if (arguments_.config) {
    const parsed = projectConfigSchema.parse(
      JSON.parse(await readFile(resolve(arguments_.config), "utf8")),
    );
    options = parsed.options;
  }
  return processOptionsSchema.parse({ ...options, ...arguments_.overrides });
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
  let pipeline = raw(raster);
  if (scale > 1)
    pipeline = pipeline.resize(raster.width * scale, raster.height * scale, {
      kernel: "nearest",
    });
  await pipeline.png({ compressionLevel: 9 }).toFile(path);
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

export async function run(argv: readonly string[]): Promise<void> {
  const arguments_ = parseArguments(argv);
  if (!arguments_) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const inputPath = resolve(arguments_.input);
  const outputDirectory = resolve(arguments_.outputDirectory);
  const options = await readOptions(arguments_);
  const { raster, source } = await readRaster(inputPath);
  const result = processRaster(raster, options);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeRaster(
      join(outputDirectory, "underpainting.png"),
      result.underpainting,
    ),
    writeRaster(
      join(outputDirectory, "underpainting-2x.png"),
      result.underpainting,
      2,
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
  ]);
  const manifest = {
    schema: "pixel-workbench-project/v1",
    provenance: "reference-underpainting",
    generator: { name: "pixel-art-workbench", version: "0.1.0" },
    source: basename(inputPath),
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    options,
    palette: result.palette,
    regionPalettes: result.regionPalettes,
    metrics: result.metrics,
    artifacts: {
      underpainting: "underpainting.png",
      nearestNeighborPreview: "underpainting-2x.png",
      protectedEdges: "diagnostic-edges.png",
      clusterCleanup: "diagnostic-cleanup.png",
      palette: "palette.gpl",
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

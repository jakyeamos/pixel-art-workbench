import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { parseArguments, run } from "../src/cli/index";

describe("CLI", () => {
  it("accepts pnpm's conventional argument separator", () => {
    expect(parseArguments(["--", "input.png"])).toMatchObject({
      command: "convert",
      input: "input.png",
    });
  });

  it("parses explicit conversion options", () => {
    expect(
      parseArguments([
        "input.png",
        "--width",
        "128",
        "--colors",
        "16",
        "--dither",
        "0.25",
      ]),
    ).toMatchObject({
      command: "convert",
      input: "input.png",
      overrides: { targetWidth: 128, maxColors: 16, dither: 0.25 },
    });
  });

  it("parses scene-native sizing separately from a direct width", () => {
    expect(
      parseArguments([
        "sprite.png",
        "--scene-render",
        "1671x941",
        "--scene-logical",
        "640x360",
      ]),
    ).toMatchObject({
      command: "convert",
      sceneSizing: {
        renderWidth: 1671,
        renderHeight: 941,
        logicalWidth: 640,
        logicalHeight: 360,
      },
    });
    expect(() =>
      parseArguments([
        "sprite.png",
        "--width",
        "32",
        "--scene-render",
        "1671x941",
        "--scene-logical",
        "640x360",
      ]),
    ).toThrow(/cannot be combined/i);
  });

  it("parses the canonical integer resizer separately from conversion", () => {
    expect(
      parseArguments([
        "resize",
        "sprite.png",
        "--scales",
        "2,4",
        "--trim",
        "--padding",
        "2",
      ]),
    ).toMatchObject({
      command: "resize",
      input: "sprite.png",
      scales: [1, 2, 4],
      trim: true,
      padding: 2,
    });
  });

  it("writes a replayable reference-underpainting bundle", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pixel-workbench-test-"));
    const input = join(directory, "input.png");
    const output = join(directory, "output");
    await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 4,
        background: { r: 180, g: 90, b: 45, alpha: 1 },
      },
    })
      .png()
      .toFile(input);
    await run([input, "--out", output, "--width", "16", "--colors", "4"]);
    const manifest = JSON.parse(
      await readFile(join(output, "project.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(manifest.provenance).toBe("reference-underpainting");
    expect(manifest.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      readFile(join(output, "underpainting.png")),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      readFile(join(output, "underpainting-2x.png")),
    ).resolves.toBeInstanceOf(Buffer);
    await expect(
      readFile(join(output, "palette.gpl"), "utf8"),
    ).resolves.toContain("GIMP Palette");
  });

  it("writes an exact scene-native retarget with replayable density metadata", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pixel-scene-grid-test-"));
    const input = join(directory, "figurine.png");
    const output = join(directory, "output");
    await sharp({
      create: {
        width: 72,
        height: 202,
        channels: 4,
        background: { r: 100, g: 42, b: 39, alpha: 1 },
      },
    })
      .png()
      .toFile(input);
    await run([
      input,
      "--out",
      output,
      "--scene-render",
      "1671x941",
      "--scene-logical",
      "640x360",
      "--no-trim",
      "--colors",
      "8",
    ]);
    await expect(
      sharp(join(output, "underpainting.png")).metadata(),
    ).resolves.toMatchObject({ width: 28, height: 77 });
    const manifest = JSON.parse(
      await readFile(join(output, "project.json"), "utf8"),
    ) as {
      readonly schema: string;
      readonly sceneSizing: {
        readonly resolvedWidth: number;
        readonly resolvedHeight: number;
      };
    };
    expect(manifest.schema).toBe("pixel-workbench-project/v3");
    expect(manifest.sceneSizing).toMatchObject({
      resolvedWidth: 28,
      resolvedHeight: 77,
    });
  });

  it("writes exact nearest-neighbor scales and an asset manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pixel-resizer-test-"));
    const input = join(directory, "sprite.png");
    const output = join(directory, "scales");
    const pixels = Buffer.from([
      15, 25, 35, 255, 91, 123, 177, 73, 201, 88, 44, 149, 0, 0, 0, 0,
    ]);
    await sharp(pixels, {
      raw: { width: 2, height: 2, channels: 4 },
    })
      .png()
      .toFile(input);
    await run(["resize", input, "--out", output, "--scales", "2,4"]);
    await expect(
      sharp(join(output, "asset-1x.png")).metadata(),
    ).resolves.toMatchObject({
      width: 2,
      height: 2,
    });
    await expect(
      sharp(join(output, "asset-4x.png")).metadata(),
    ).resolves.toMatchObject({
      width: 8,
      height: 8,
    });
    const scaled = await sharp(join(output, "asset-2x.png")).raw().toBuffer();
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const source = (Math.floor(y / 2) * 2 + Math.floor(x / 2)) * 4;
        const destination = (y * 4 + x) * 4;
        expect([...scaled.subarray(destination, destination + 4)]).toEqual([
          ...pixels.subarray(source, source + 4),
        ]);
      }
    }
    const manifest = JSON.parse(
      await readFile(join(output, "asset.json"), "utf8"),
    ) as {
      readonly scaling: string;
      readonly artifacts: Record<string, string>;
    };
    expect(manifest.scaling).toBe("integer-nearest-neighbor");
    expect(manifest.artifacts).toEqual({
      "1x": "asset-1x.png",
      "2x": "asset-2x.png",
      "4x": "asset-4x.png",
    });
  });
});

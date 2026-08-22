import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { parseArguments, run } from "../src/cli/index";

describe("CLI", () => {
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

  it("writes exact nearest-neighbor scales and an asset manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pixel-resizer-test-"));
    const input = join(directory, "sprite.png");
    const output = join(directory, "scales");
    await sharp({
      create: {
        width: 3,
        height: 2,
        channels: 4,
        background: { r: 15, g: 25, b: 35, alpha: 1 },
      },
    })
      .png()
      .toFile(input);
    await run(["resize", input, "--out", output, "--scales", "2,4"]);
    await expect(
      sharp(join(output, "asset-1x.png")).metadata(),
    ).resolves.toMatchObject({
      width: 3,
      height: 2,
    });
    await expect(
      sharp(join(output, "asset-4x.png")).metadata(),
    ).resolves.toMatchObject({
      width: 12,
      height: 8,
    });
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

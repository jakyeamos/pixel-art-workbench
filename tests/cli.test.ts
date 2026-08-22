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
      input: "input.png",
      overrides: { targetWidth: 128, maxColors: 16, dither: 0.25 },
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
});

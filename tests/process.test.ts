import { describe, expect, it } from "vitest";

import {
  applyAlphaMask,
  clearConnectedBackground,
  createOpaqueMask,
  invertMask,
  maskFromRaster,
  paintMaskLine,
  parsePaletteText,
  scaleNearest,
  trimTransparent,
} from "../src/core/assets";
import { processOptionsSchema } from "../src/core/contracts";
import { buildRegionMap, processRaster, resizeArea } from "../src/core/process";
import type { Raster } from "../src/core/types";
import { DEFAULT_OPTIONS } from "../src/core/types";

function raster(
  width: number,
  height: number,
  pixel: (x: number, y: number) => readonly [number, number, number, number],
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set(pixel(x, y), (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

describe("pixel processing core", () => {
  it("is deterministic and respects the palette ceiling", () => {
    const source = raster(16, 12, (x, y) => [x * 15, y * 20, (x + y) * 8, 255]);
    const options = {
      ...DEFAULT_OPTIONS,
      targetWidth: 8,
      maxColors: 6,
      dither: 0.35,
    };
    const first = processRaster(source, options);
    const second = processRaster(source, options);
    expect(first.underpainting.data).toEqual(second.underpainting.data);
    expect(first.metrics.width).toBe(8);
    expect(first.metrics.totalPaletteColors).toBeLessThanOrEqual(6);
  });

  it("area-downsamples while preserving transparency", () => {
    const source = raster(2, 2, (x, y) =>
      x === 0 && y === 0 ? [255, 0, 0, 255] : [0, 0, 0, 0],
    );
    const result = resizeArea(source, 1);
    expect(result.width).toBe(1);
    expect(result.height).toBe(1);
    expect(result.data[0]).toBe(255);
    expect(result.data[3]).toBeCloseTo(64, 0);
  });

  it("rasterizes normalized material polygons", () => {
    const map = buildRegionMap(4, 2, [
      {
        id: "left",
        name: "Left",
        maxColors: 2,
        dither: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0 },
          { x: 0.5, y: 1 },
          { x: 0, y: 1 },
        ],
      },
    ]);
    expect([...map]).toEqual([1, 1, 0, 0, 1, 1, 0, 0]);
  });

  it("applies an independent palette ceiling inside a material region", () => {
    const source = raster(8, 2, (x, y) =>
      x < 4 ? [x * 50, y * 40, 20, 255] : [20, x * 24, y * 100, 255],
    );
    const result = processRaster(source, {
      ...DEFAULT_OPTIONS,
      targetWidth: 8,
      maxColors: 8,
      regions: [
        {
          id: "left-paper",
          name: "Paper",
          maxColors: 2,
          dither: 0,
          polygon: [
            { x: 0, y: 0 },
            { x: 0.5, y: 0 },
            { x: 0.5, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
    });
    expect(result.regionPalettes["left-paper"]).toHaveLength(2);
    expect(result.palette.length).toBeGreaterThan(2);
  });

  it("rejects invalid recipes at the boundary", () => {
    expect(() =>
      processOptionsSchema.parse({ ...DEFAULT_OPTIONS, maxColors: 0 }),
    ).toThrow();
    expect(() =>
      processOptionsSchema.parse({
        ...DEFAULT_OPTIONS,
        regions: [
          { id: "Bad ID", name: "x", polygon: [], maxColors: 2, dither: 0 },
        ],
      }),
    ).toThrow();
  });

  it("locks an imported family palette across global and material regions", () => {
    const source = raster(6, 2, (x) => [x * 40, 130 - x * 10, 60, 255]);
    const result = processRaster(source, {
      ...DEFAULT_OPTIONS,
      targetWidth: 6,
      lockedPalette: ["#000000", "#ffffff", "#884422"],
      regions: [
        {
          id: "subject",
          name: "Subject",
          maxColors: 2,
          dither: 0,
          polygon: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
            { x: 0, y: 1 },
          ],
        },
      ],
    });
    expect(result.palette.map((color) => color.hex)).toEqual(
      expect.arrayContaining(["#000000", "#ffffff", "#884422"]),
    );
    expect(result.regionPalettes.subject?.map((color) => color.hex)).toEqual(
      expect.arrayContaining(["#000000", "#ffffff", "#884422"]),
    );
  });
});

describe("pixel asset preparation", () => {
  it("applies, paints, imports, and inverts alpha masks", () => {
    const source = raster(4, 4, () => [120, 80, 40, 255]);
    const opaque = createOpaqueMask(4, 4);
    const painted = paintMaskLine(
      opaque,
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      0.1,
      0,
    );
    expect(painted.data.some((value) => value === 0)).toBe(true);
    expect(invertMask(painted).data[0]).toBe(255);
    expect(applyAlphaMask(source, painted).data[3]).toBe(0);

    const grayscale = raster(2, 2, (x) =>
      x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255],
    );
    expect([...maskFromRaster(grayscale, 4, 2).data]).toEqual([
      0, 0, 255, 255, 0, 0, 255, 255,
    ]);

    const alphaMask = raster(2, 1, (x) =>
      x === 0 ? [5, 5, 5, 255] : [255, 255, 255, 0],
    );
    expect([...maskFromRaster(alphaMask, 2, 1).data]).toEqual([255, 0]);
  });

  it("clears only the connected sampled background", () => {
    const source = raster(5, 3, (x, y) =>
      x === 2 && y === 1 ? [220, 30, 30, 255] : [20, 25, 30, 255],
    );
    const mask = clearConnectedBackground(
      source,
      createOpaqueMask(5, 3),
      { x: 0, y: 0 },
      0.05,
    );
    expect(mask.data[0]).toBe(0);
    expect(mask.data[7]).toBe(255);
  });

  it("trims transparent bounds, adds padding, and scales without interpolation", () => {
    const source = raster(4, 4, (x, y) =>
      x === 2 && y === 1 ? [12, 34, 56, 255] : [0, 0, 0, 0],
    );
    const trimmed = trimTransparent(source, 1);
    expect([trimmed.width, trimmed.height]).toEqual([3, 3]);
    const scaled = scaleNearest(trimmed, 3);
    expect([scaled.width, scaled.height]).toEqual([9, 9]);
    const center = (4 * scaled.width + 4) * 4;
    expect([...scaled.data.slice(center, center + 4)]).toEqual([
      12, 34, 56, 255,
    ]);
  });

  it("parses GPL and hexadecimal palettes deterministically", () => {
    expect(
      parsePaletteText(
        "GIMP Palette\n12 34 56 first\n#abcdef\n12 34 56 duplicate",
      ),
    ).toEqual(["#0c2238", "#abcdef"]);
  });
});

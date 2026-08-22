import { describe, expect, it } from "vitest";

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
});

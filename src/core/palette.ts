import { keyToHex, keyToRgb, rgbKey } from "./color";
import type { PaletteColor, Raster } from "./types";

interface HistogramColor {
  readonly key: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly count: number;
}

interface ColorBox {
  readonly colors: readonly HistogramColor[];
  readonly count: number;
  readonly range: number;
}

function createBox(colors: readonly HistogramColor[]): ColorBox {
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  let count = 0;
  for (const color of colors) {
    minR = Math.min(minR, color.r);
    minG = Math.min(minG, color.g);
    minB = Math.min(minB, color.b);
    maxR = Math.max(maxR, color.r);
    maxG = Math.max(maxG, color.g);
    maxB = Math.max(maxB, color.b);
    count += color.count;
  }
  return {
    colors,
    count,
    range: Math.max(maxR - minR, maxG - minG, maxB - minB),
  };
}

function splitBox(box: ColorBox): readonly [ColorBox, ColorBox] | null {
  if (box.colors.length < 2) return null;
  let minR = 255;
  let minG = 255;
  let minB = 255;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  for (const color of box.colors) {
    minR = Math.min(minR, color.r);
    minG = Math.min(minG, color.g);
    minB = Math.min(minB, color.b);
    maxR = Math.max(maxR, color.r);
    maxG = Math.max(maxG, color.g);
    maxB = Math.max(maxB, color.b);
  }
  const redRange = maxR - minR;
  const greenRange = maxG - minG;
  const blueRange = maxB - minB;
  const channel =
    greenRange > redRange && greenRange >= blueRange
      ? "g"
      : blueRange > redRange
        ? "b"
        : "r";
  const sorted = [...box.colors].sort(
    (left, right) => left[channel] - right[channel] || left.key - right.key,
  );
  const half = box.count / 2;
  let running = 0;
  let split = 1;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    running += sorted[index]?.count ?? 0;
    if (running >= half) {
      split = index + 1;
      break;
    }
  }
  return [createBox(sorted.slice(0, split)), createBox(sorted.slice(split))];
}

function representative(box: ColorBox): number {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const color of box.colors) {
    r += color.r * color.count;
    g += color.g * color.count;
    b += color.b * color.count;
  }
  return rgbKey(
    Math.round(r / box.count),
    Math.round(g / box.count),
    Math.round(b / box.count),
  );
}

export function extractPalette(
  raster: Raster,
  maxColors: number,
  include?: (index: number) => boolean,
): readonly number[] {
  const histogram = new Map<number, number>();
  const pixels = raster.width * raster.height;
  for (let index = 0; index < pixels; index += 1) {
    if (include && !include(index)) continue;
    const offset = index * 4;
    if ((raster.data[offset + 3] ?? 0) < 128) continue;
    const key = rgbKey(
      raster.data[offset] ?? 0,
      raster.data[offset + 1] ?? 0,
      raster.data[offset + 2] ?? 0,
    );
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  if (histogram.size === 0) return [0];
  if (histogram.size <= maxColors)
    return [...histogram.keys()].sort((left, right) => left - right);

  const colors = [...histogram].map(([key, count]) => ({
    key,
    ...keyToRgb(key),
    count,
  }));
  const boxes: ColorBox[] = [createBox(colors)];
  while (boxes.length < maxColors) {
    boxes.sort(
      (left, right) => right.range * right.count - left.range * left.count,
    );
    const candidate = boxes.shift();
    if (!candidate) break;
    const split = splitBox(candidate);
    if (!split) {
      boxes.push(candidate);
      break;
    }
    boxes.push(...split);
  }
  return [...new Set(boxes.map(representative))].sort(
    (left, right) => left - right,
  );
}

export function describePalette(
  raster: Raster,
  palette: readonly number[],
  include?: (index: number) => boolean,
): readonly PaletteColor[] {
  const counts = new Map<number, number>(palette.map((color) => [color, 0]));
  for (let offset = 0; offset < raster.data.length; offset += 4) {
    const index = offset / 4;
    if (include && !include(index)) continue;
    if ((raster.data[offset + 3] ?? 0) < 128) continue;
    const key = rgbKey(
      raster.data[offset] ?? 0,
      raster.data[offset + 1] ?? 0,
      raster.data[offset + 2] ?? 0,
    );
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ hex: keyToHex(key), count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.hex.localeCompare(right.hex),
    );
}

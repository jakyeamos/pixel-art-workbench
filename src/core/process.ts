import { clampChannel, keyToRgb, nearestColor, rgbKey } from "./color";
import { describePalette, extractPalette } from "./palette";
import type {
  MaterialRegion,
  Point,
  ProcessOptions,
  ProcessResult,
  Raster,
} from "./types";

function assertRaster(raster: Raster): void {
  if (
    !Number.isInteger(raster.width) ||
    !Number.isInteger(raster.height) ||
    raster.width <= 0 ||
    raster.height <= 0
  ) {
    throw new Error("Raster dimensions must be positive integers.");
  }
  if (raster.data.length !== raster.width * raster.height * 4)
    throw new Error("Raster data length does not match its dimensions.");
}

export function resizeArea(
  source: Raster,
  targetWidth: number,
  targetHeight?: number,
): Raster {
  assertRaster(source);
  if (!Number.isInteger(targetWidth) || targetWidth < 1)
    throw new Error("Target width must be a positive integer.");
  if (
    targetHeight !== undefined &&
    (!Number.isInteger(targetHeight) || targetHeight < 1)
  )
    throw new Error("Target height must be a positive integer.");
  const width = Math.min(targetWidth, source.width);
  const height = Math.min(
    source.height,
    targetHeight ??
      Math.max(1, Math.round((source.height * width) / source.width)),
  );
  if (width === source.width && height === source.height)
    return { width, height, data: new Uint8ClampedArray(source.data) };
  const data = new Uint8ClampedArray(width * height * 4);
  const scaleX = source.width / width;
  const scaleY = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const fromY = y * scaleY;
    const toY = (y + 1) * scaleY;
    const minY = Math.floor(fromY);
    const maxY = Math.min(source.height - 1, Math.ceil(toY) - 1);
    for (let x = 0; x < width; x += 1) {
      const fromX = x * scaleX;
      const toX = (x + 1) * scaleX;
      const minX = Math.floor(fromX);
      const maxX = Math.min(source.width - 1, Math.ceil(toX) - 1);
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let weight = 0;
      for (let sourceY = minY; sourceY <= maxY; sourceY += 1) {
        const weightY = Math.min(toY, sourceY + 1) - Math.max(fromY, sourceY);
        for (let sourceX = minX; sourceX <= maxX; sourceX += 1) {
          const weightX = Math.min(toX, sourceX + 1) - Math.max(fromX, sourceX);
          const sampleWeight = weightX * weightY;
          const offset = (sourceY * source.width + sourceX) * 4;
          const sampleAlpha = (source.data[offset + 3] ?? 0) / 255;
          red += (source.data[offset] ?? 0) * sampleAlpha * sampleWeight;
          green += (source.data[offset + 1] ?? 0) * sampleAlpha * sampleWeight;
          blue += (source.data[offset + 2] ?? 0) * sampleAlpha * sampleWeight;
          alpha += sampleAlpha * sampleWeight;
          weight += sampleWeight;
        }
      }
      const output = (y * width + x) * 4;
      const outputAlpha = weight === 0 ? 0 : alpha / weight;
      data[output] = outputAlpha === 0 ? 0 : Math.round(red / alpha);
      data[output + 1] = outputAlpha === 0 ? 0 : Math.round(green / alpha);
      data[output + 2] = outputAlpha === 0 ? 0 : Math.round(blue / alpha);
      data[output + 3] = Math.round(outputAlpha * 255);
    }
  }
  return { width, height, data };
}

function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (
    let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1
  ) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function buildRegionMap(
  width: number,
  height: number,
  regions: readonly MaterialRegion[],
): Uint8Array {
  if (regions.length > 254)
    throw new Error("At most 254 material regions are supported.");
  const map = new Uint8Array(width * height);
  regions.forEach((region, regionIndex) => {
    if (region.polygon.length < 3) return;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (
          pointInPolygon(
            { x: (x + 0.5) / width, y: (y + 0.5) / height },
            region.polygon,
          )
        )
          map[y * width + x] = regionIndex + 1;
      }
    }
  });
  return map;
}

function createEdgeMap(raster: Raster): Float32Array {
  const luminance = new Float32Array(raster.width * raster.height);
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    luminance[index] =
      ((raster.data[offset] ?? 0) * 0.2126 +
        (raster.data[offset + 1] ?? 0) * 0.7152 +
        (raster.data[offset + 2] ?? 0) * 0.0722) /
      255;
  }
  const edges = new Float32Array(luminance.length);
  const value = (x: number, y: number): number =>
    luminance[
      Math.max(0, Math.min(raster.height - 1, y)) * raster.width +
        Math.max(0, Math.min(raster.width - 1, x))
    ] ?? 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const gx =
        -value(x - 1, y - 1) +
        value(x + 1, y - 1) -
        2 * value(x - 1, y) +
        2 * value(x + 1, y) -
        value(x - 1, y + 1) +
        value(x + 1, y + 1);
      const gy =
        -value(x - 1, y - 1) -
        2 * value(x, y - 1) -
        value(x + 1, y - 1) +
        value(x - 1, y + 1) +
        2 * value(x, y + 1) +
        value(x + 1, y + 1);
      edges[y * raster.width + x] = Math.min(1, Math.hypot(gx, gy) / 4);
    }
  }
  return edges;
}

interface RegionRuntime {
  readonly region: MaterialRegion | null;
  readonly palette: readonly number[];
  readonly dither: number;
}

function quantize(
  raster: Raster,
  edgeMap: Float32Array,
  regionMap: Uint8Array,
  runtimes: readonly RegionRuntime[],
  edgeThreshold: number,
): Raster {
  const data = new Uint8ClampedArray(raster.data.length);
  const errors = new Float32Array(raster.width * raster.height * 3);
  const distribute = (
    sourceIndex: number,
    x: number,
    y: number,
    channel: number,
    error: number,
    factor: number,
    regionId: number,
  ): void => {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
    const destination = y * raster.width + x;
    if ((regionMap[destination] ?? 0) !== regionId) return;
    errors[destination * 3 + channel] =
      (errors[destination * 3 + channel] ?? 0) + error * factor;
    void sourceIndex;
  };

  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const index = y * raster.width + x;
      const offset = index * 4;
      const alpha = raster.data[offset + 3] ?? 0;
      if (alpha < 128) {
        data[offset + 3] = 0;
        continue;
      }
      const regionId = regionMap[index] ?? 0;
      const runtime = runtimes[regionId] ?? runtimes[0];
      if (!runtime) throw new Error("Missing global quantization runtime.");
      const red = clampChannel(
        (raster.data[offset] ?? 0) + (errors[index * 3] ?? 0),
      );
      const green = clampChannel(
        (raster.data[offset + 1] ?? 0) + (errors[index * 3 + 1] ?? 0),
      );
      const blue = clampChannel(
        (raster.data[offset + 2] ?? 0) + (errors[index * 3 + 2] ?? 0),
      );
      const selected = nearestColor(rgbKey(red, green, blue), runtime.palette);
      const rgb = keyToRgb(selected);
      data[offset] = rgb.r;
      data[offset + 1] = rgb.g;
      data[offset + 2] = rgb.b;
      data[offset + 3] = alpha;
      const edgeGuard = (edgeMap[index] ?? 0) >= edgeThreshold;
      const amount = edgeGuard ? 0 : runtime.dither;
      if (amount === 0) continue;
      const colorError = [
        (red - rgb.r) * amount,
        (green - rgb.g) * amount,
        (blue - rgb.b) * amount,
      ];
      for (let channel = 0; channel < 3; channel += 1) {
        const error = colorError[channel] ?? 0;
        distribute(index, x + 1, y, channel, error, 7 / 16, regionId);
        distribute(index, x - 1, y + 1, channel, error, 3 / 16, regionId);
        distribute(index, x, y + 1, channel, error, 5 / 16, regionId);
        distribute(index, x + 1, y + 1, channel, error, 1 / 16, regionId);
      }
    }
  }
  return { width: raster.width, height: raster.height, data };
}

function cleanupClusters(
  raster: Raster,
  regionMap: Uint8Array,
  edgeMap: Float32Array,
  minimum: number,
  edgeThreshold: number,
): { raster: Raster; changed: Uint8Array } {
  if (minimum <= 1)
    return { raster, changed: new Uint8Array(raster.width * raster.height) };
  const source = raster.data;
  const output = new Uint8ClampedArray(source);
  const pixels = raster.width * raster.height;
  const visited = new Uint8Array(pixels);
  const changed = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const neighbors = (index: number): readonly number[] => {
    const x = index % raster.width;
    const y = Math.floor(index / raster.width);
    const values: number[] = [];
    if (x > 0) values.push(index - 1);
    if (x + 1 < raster.width) values.push(index + 1);
    if (y > 0) values.push(index - raster.width);
    if (y + 1 < raster.height) values.push(index + raster.width);
    return values;
  };
  const keyAt = (index: number): number => {
    const offset = index * 4;
    return rgbKey(
      source[offset] ?? 0,
      source[offset + 1] ?? 0,
      source[offset + 2] ?? 0,
    );
  };

  for (let start = 0; start < pixels; start += 1) {
    if (visited[start] || (source[start * 4 + 3] ?? 0) < 128) continue;
    const key = keyAt(start);
    const region = regionMap[start] ?? 0;
    let head = 0;
    let tail = 1;
    queue[0] = start;
    visited[start] = 1;
    const component: number[] = [];
    let edgeTotal = 0;
    while (head < tail) {
      const index = queue[head++] ?? 0;
      component.push(index);
      edgeTotal += edgeMap[index] ?? 0;
      for (const neighbor of neighbors(index)) {
        if (
          !visited[neighbor] &&
          (regionMap[neighbor] ?? 0) === region &&
          keyAt(neighbor) === key
        ) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (
      component.length >= minimum ||
      edgeTotal / component.length >= edgeThreshold
    )
      continue;
    const candidates = new Map<number, number>();
    for (const index of component) {
      for (const neighbor of neighbors(index)) {
        const candidate = keyAt(neighbor);
        if (
          (source[neighbor * 4 + 3] ?? 0) >= 128 &&
          (regionMap[neighbor] ?? 0) === region &&
          candidate !== key
        ) {
          candidates.set(candidate, (candidates.get(candidate) ?? 0) + 1);
        }
      }
    }
    const replacement = [...candidates].sort(
      (left, right) => right[1] - left[1] || left[0] - right[0],
    )[0]?.[0];
    if (replacement === undefined) continue;
    const rgb = keyToRgb(replacement);
    for (const index of component) {
      const offset = index * 4;
      output[offset] = rgb.r;
      output[offset + 1] = rgb.g;
      output[offset + 2] = rgb.b;
      changed[index] = 1;
    }
  }
  return {
    raster: { width: raster.width, height: raster.height, data: output },
    changed,
  };
}

function diagnostic(
  width: number,
  height: number,
  render: (index: number) => readonly [number, number, number, number],
): Raster {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const [r, g, b, a] = render(index);
    const offset = index * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = a;
  }
  return { width, height, data };
}

export function processRaster(
  source: Raster,
  options: ProcessOptions,
): ProcessResult {
  assertRaster(source);
  const resized = resizeArea(source, options.targetWidth, options.targetHeight);
  const regionMap = buildRegionMap(
    resized.width,
    resized.height,
    options.regions,
  );
  const edgeMap = createEdgeMap(resized);
  const lockedPalette = options.lockedPalette.map((hex) =>
    Number.parseInt(hex.slice(1), 16),
  );
  const globalPalette =
    lockedPalette.length > 0
      ? lockedPalette
      : extractPalette(
          resized,
          options.maxColors,
          (index) => (regionMap[index] ?? 0) === 0,
        );
  const runtimes: RegionRuntime[] = [
    { region: null, palette: globalPalette, dither: options.dither },
  ];
  const regionPalettes: Record<string, ReturnType<typeof describePalette>> = {};
  for (let index = 0; index < options.regions.length; index += 1) {
    const region = options.regions[index];
    if (!region) continue;
    const palette =
      lockedPalette.length > 0
        ? lockedPalette
        : extractPalette(
            resized,
            region.maxColors,
            (pixel) => (regionMap[pixel] ?? 0) === index + 1,
          );
    runtimes.push({ region, palette, dither: region.dither });
  }
  const quantized = quantize(
    resized,
    edgeMap,
    regionMap,
    runtimes,
    options.edgeThreshold,
  );
  const cleaned = cleanupClusters(
    quantized,
    regionMap,
    edgeMap,
    options.minClusterSize,
    options.edgeThreshold,
  );
  const palette = describePalette(cleaned.raster, [
    ...new Set(runtimes.flatMap((runtime) => runtime.palette)),
  ]);
  for (let index = 1; index < runtimes.length; index += 1) {
    const runtime = runtimes[index];
    if (runtime?.region) {
      regionPalettes[runtime.region.id] = describePalette(
        cleaned.raster,
        runtime.palette,
        (pixel) => (regionMap[pixel] ?? 0) === index,
      );
    }
  }
  let edgePixels = 0;
  let cleanedPixels = 0;
  for (let index = 0; index < edgeMap.length; index += 1) {
    if ((edgeMap[index] ?? 0) >= options.edgeThreshold) edgePixels += 1;
    if (cleaned.changed[index]) cleanedPixels += 1;
  }
  return {
    underpainting: cleaned.raster,
    edgeDiagnostic: diagnostic(resized.width, resized.height, (index) => {
      const strength = Math.round((edgeMap[index] ?? 0) * 255);
      return [
        strength,
        Math.round(strength * 0.72),
        0,
        strength === 0 ? 0 : 255,
      ];
    }),
    cleanupDiagnostic: diagnostic(resized.width, resized.height, (index) =>
      cleaned.changed[index] ? [255, 46, 113, 255] : [0, 0, 0, 0],
    ),
    palette,
    regionPalettes,
    metrics: {
      width: resized.width,
      height: resized.height,
      globalPaletteColors: globalPalette.length,
      totalPaletteColors: palette.length,
      edgePixels,
      cleanedPixels,
      regionCount: options.regions.length,
    },
  };
}

import type { AlphaMask, Raster } from "./types";

function assertMask(mask: AlphaMask): void {
  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0 ||
    mask.data.length !== mask.width * mask.height
  )
    throw new Error("Mask dimensions do not match its pixel data.");
}

function assertRaster(raster: Raster): void {
  if (
    !Number.isInteger(raster.width) ||
    !Number.isInteger(raster.height) ||
    raster.width <= 0 ||
    raster.height <= 0 ||
    raster.data.length !== raster.width * raster.height * 4
  )
    throw new Error("Raster dimensions do not match its pixel data.");
}

export function createOpaqueMask(width: number, height: number): AlphaMask {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  )
    throw new Error("Mask dimensions must be positive integers.");
  const data = new Uint8ClampedArray(width * height);
  data.fill(255);
  return { width, height, data };
}

export function maskFromRaster(
  raster: Raster,
  width: number,
  height: number,
): AlphaMask {
  assertRaster(raster);
  const hasTransparency = raster.data.some(
    (value, index) => index % 4 === 3 && value < 255,
  );
  const data = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(
      raster.height - 1,
      Math.floor((y * raster.height) / height),
    );
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(
        raster.width - 1,
        Math.floor((x * raster.width) / width),
      );
      const source = (sourceY * raster.width + sourceX) * 4;
      const alpha = raster.data[source + 3] ?? 0;
      const luminance = Math.round(
        (raster.data[source] ?? 0) * 0.2126 +
          (raster.data[source + 1] ?? 0) * 0.7152 +
          (raster.data[source + 2] ?? 0) * 0.0722,
      );
      data[y * width + x] = hasTransparency ? alpha : luminance;
    }
  }
  return { width, height, data };
}

export function applyAlphaMask(source: Raster, mask: AlphaMask): Raster {
  assertRaster(source);
  assertMask(mask);
  if (source.width !== mask.width || source.height !== mask.height)
    throw new Error("Mask and source dimensions must match.");
  const data = new Uint8ClampedArray(source.data);
  for (let index = 0; index < mask.data.length; index += 1) {
    const offset = index * 4;
    data[offset + 3] = Math.round(
      ((source.data[offset + 3] ?? 0) * (mask.data[index] ?? 0)) / 255,
    );
  }
  return { width: source.width, height: source.height, data };
}

function paintCircle(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
  value: number,
): void {
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));
  const squared = radius * radius;
  for (let pixelY = minY; pixelY <= maxY; pixelY += 1) {
    for (let pixelX = minX; pixelX <= maxX; pixelX += 1) {
      const dx = pixelX - x;
      const dy = pixelY - y;
      if (dx * dx + dy * dy <= squared) data[pixelY * width + pixelX] = value;
    }
  }
}

export function paintMaskLine(
  mask: AlphaMask,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  radiusRatio: number,
  value: 0 | 255,
): AlphaMask {
  assertMask(mask);
  const data = new Uint8ClampedArray(mask.data);
  const radius = Math.max(
    1,
    Math.round(Math.min(mask.width, mask.height) * radiusRatio),
  );
  const fromX = from.x * (mask.width - 1);
  const fromY = from.y * (mask.height - 1);
  const toX = to.x * (mask.width - 1);
  const toY = to.y * (mask.height - 1);
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.5)));
  for (let step = 0; step <= steps; step += 1) {
    const amount = step / steps;
    paintCircle(
      data,
      mask.width,
      mask.height,
      fromX + (toX - fromX) * amount,
      fromY + (toY - fromY) * amount,
      radius,
      value,
    );
  }
  return { width: mask.width, height: mask.height, data };
}

export function clearConnectedBackground(
  source: Raster,
  mask: AlphaMask,
  point: { readonly x: number; readonly y: number },
  tolerance: number,
): AlphaMask {
  assertRaster(source);
  assertMask(mask);
  if (source.width !== mask.width || source.height !== mask.height)
    throw new Error("Mask and source dimensions must match.");
  const startX = Math.max(
    0,
    Math.min(source.width - 1, Math.floor(point.x * source.width)),
  );
  const startY = Math.max(
    0,
    Math.min(source.height - 1, Math.floor(point.y * source.height)),
  );
  const start = startY * source.width + startX;
  const startOffset = start * 4;
  const red = source.data[startOffset] ?? 0;
  const green = source.data[startOffset + 1] ?? 0;
  const blue = source.data[startOffset + 2] ?? 0;
  const limit = Math.max(0, Math.min(1, tolerance)) * 441.67295593;
  const output = new Uint8ClampedArray(mask.data);
  const visited = new Uint8Array(source.width * source.height);
  const queue = new Int32Array(source.width * source.height);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  visited[start] = 1;
  while (head < tail) {
    const index = queue[head++] ?? 0;
    const offset = index * 4;
    const distance = Math.hypot(
      (source.data[offset] ?? 0) - red,
      (source.data[offset + 1] ?? 0) - green,
      (source.data[offset + 2] ?? 0) - blue,
    );
    if (distance > limit) continue;
    output[index] = 0;
    const x = index % source.width;
    const y = Math.floor(index / source.width);
    const candidates = [
      x > 0 ? index - 1 : -1,
      x + 1 < source.width ? index + 1 : -1,
      y > 0 ? index - source.width : -1,
      y + 1 < source.height ? index + source.width : -1,
    ];
    for (const candidate of candidates) {
      if (candidate >= 0 && !visited[candidate]) {
        visited[candidate] = 1;
        queue[tail++] = candidate;
      }
    }
  }
  return { width: mask.width, height: mask.height, data: output };
}

export function invertMask(mask: AlphaMask): AlphaMask {
  assertMask(mask);
  return {
    width: mask.width,
    height: mask.height,
    data: Uint8ClampedArray.from(mask.data, (value) => 255 - value),
  };
}

export function maskDiagnostic(mask: AlphaMask): Raster {
  assertMask(mask);
  const data = new Uint8ClampedArray(mask.data.length * 4);
  for (let index = 0; index < mask.data.length; index += 1) {
    const value = mask.data[index] ?? 0;
    const offset = index * 4;
    data[offset] = value;
    data[offset + 1] = value;
    data[offset + 2] = value;
    data[offset + 3] = 255;
  }
  return { width: mask.width, height: mask.height, data };
}

export function trimTransparent(
  raster: Raster,
  padding = 0,
  alphaThreshold = 1,
): Raster {
  assertRaster(raster);
  if (!Number.isInteger(padding) || padding < 0 || padding > 256)
    throw new Error("Padding must be an integer from 0 through 256.");
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if ((raster.data[(y * raster.width + x) * 4 + 3] ?? 0) < alphaThreshold)
        continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY)
    return {
      width: 1 + padding * 2,
      height: 1 + padding * 2,
      data: new Uint8ClampedArray((1 + padding * 2) ** 2 * 4),
    };
  const contentWidth = maxX - minX + 1;
  const contentHeight = maxY - minY + 1;
  const width = contentWidth + padding * 2;
  const height = contentHeight + padding * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < contentHeight; y += 1) {
    const sourceStart = ((minY + y) * raster.width + minX) * 4;
    const destinationStart = ((padding + y) * width + padding) * 4;
    data.set(
      raster.data.subarray(sourceStart, sourceStart + contentWidth * 4),
      destinationStart,
    );
  }
  return { width, height, data };
}

export function scaleNearest(raster: Raster, scale: number): Raster {
  assertRaster(raster);
  if (!Number.isInteger(scale) || scale < 1 || scale > 16)
    throw new Error("Scale must be an integer from 1 through 16.");
  if (scale === 1)
    return {
      width: raster.width,
      height: raster.height,
      data: new Uint8ClampedArray(raster.data),
    };
  const width = raster.width * scale;
  const height = raster.height * scale;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.floor(y / scale);
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.floor(x / scale);
      const source = (sourceY * raster.width + sourceX) * 4;
      const destination = (y * width + x) * 4;
      data[destination] = raster.data[source] ?? 0;
      data[destination + 1] = raster.data[source + 1] ?? 0;
      data[destination + 2] = raster.data[source + 2] ?? 0;
      data[destination + 3] = raster.data[source + 3] ?? 0;
    }
  }
  return { width, height, data };
}

export function parsePaletteText(text: string): readonly string[] {
  const colors: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    const hex = line.match(/#[0-9a-fA-F]{6}\b/)?.[0];
    if (hex) {
      colors.push(hex.toLowerCase());
      continue;
    }
    const gpl = line.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/);
    if (!gpl) continue;
    const values = gpl.slice(1).map(Number);
    if (values.some((value) => value < 0 || value > 255)) continue;
    colors.push(
      `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    );
  }
  return [...new Set(colors)].slice(0, 256);
}

interface RGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export function rgbKey(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}

export function keyToRgb(key: number): RGB {
  return { r: (key >>> 16) & 255, g: (key >>> 8) & 255, b: key & 255 };
}

export function keyToHex(key: number): string {
  return `#${key.toString(16).padStart(6, "0")}`;
}

function colorDistance(left: number, right: number): number {
  const a = keyToRgb(left);
  const b = keyToRgb(right);
  const meanRed = (a.r + b.r) / 2;
  const red = a.r - b.r;
  const green = a.g - b.g;
  const blue = a.b - b.b;
  return (
    (2 + meanRed / 256) * red * red +
    4 * green * green +
    (2 + (255 - meanRed) / 256) * blue * blue
  );
}

export function nearestColor(key: number, palette: readonly number[]): number {
  let nearest = palette[0] ?? 0;
  let distance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const next = colorDistance(key, candidate);
    if (next < distance) {
      distance = next;
      nearest = candidate;
    }
  }
  return nearest;
}

export function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

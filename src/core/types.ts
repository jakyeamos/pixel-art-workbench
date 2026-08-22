export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface MaterialRegion {
  readonly id: string;
  readonly name: string;
  readonly polygon: readonly Point[];
  readonly maxColors: number;
  readonly dither: number;
}

export interface ProcessOptions {
  readonly targetWidth: number;
  readonly maxColors: number;
  readonly dither: number;
  readonly edgeThreshold: number;
  readonly minClusterSize: number;
  readonly regions: readonly MaterialRegion[];
}

export interface PaletteColor {
  readonly hex: string;
  readonly count: number;
}

interface ProcessMetrics {
  readonly width: number;
  readonly height: number;
  readonly globalPaletteColors: number;
  readonly totalPaletteColors: number;
  readonly edgePixels: number;
  readonly cleanedPixels: number;
  readonly regionCount: number;
}

export interface ProcessResult {
  readonly underpainting: Raster;
  readonly edgeDiagnostic: Raster;
  readonly cleanupDiagnostic: Raster;
  readonly palette: readonly PaletteColor[];
  readonly regionPalettes: Readonly<Record<string, readonly PaletteColor[]>>;
  readonly metrics: ProcessMetrics;
}

export const DEFAULT_OPTIONS: ProcessOptions = {
  targetWidth: 480,
  maxColors: 64,
  dither: 0,
  edgeThreshold: 0.2,
  minClusterSize: 2,
  regions: [],
};

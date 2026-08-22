import type { Raster } from "../core/types";

const MAX_SOURCE_PIXELS = 32_000_000;

export async function fileToRaster(file: File): Promise<Raster> {
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS)
      throw new Error(
        "Images are limited to 32 megapixels in the browser workbench.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: image.width, height: image.height, data: image.data };
  } finally {
    bitmap.close();
  }
}

export function drawRaster(canvas: HTMLCanvasElement, raster: Raster): void {
  canvas.width = raster.width;
  canvas.height = raster.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  context.imageSmoothingEnabled = false;
  const pixels = new Uint8ClampedArray(raster.data.length);
  pixels.set(raster.data);
  context.putImageData(
    new ImageData(pixels, raster.width, raster.height),
    0,
    0,
  );
}

export async function rasterToBlob(raster: Raster): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawRaster(canvas, raster);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("The browser could not encode the PNG.");
  return blob;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

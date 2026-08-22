import { z } from "zod";

const pointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const materialRegionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1).max(64),
  polygon: z.array(pointSchema).min(3),
  maxColors: z.number().int().min(2).max(256),
  dither: z.number().min(0).max(1),
});

export const processOptionsSchema = z.object({
  targetWidth: z.number().int().min(16).max(2048),
  maxColors: z.number().int().min(2).max(256),
  dither: z.number().min(0).max(1),
  edgeThreshold: z.number().min(0).max(1),
  minClusterSize: z.number().int().min(1).max(32),
  lockedPalette: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(256)
    .refine((colors) => colors.length === 0 || colors.length >= 2, {
      message: "A locked palette must be empty or contain at least two colors.",
    })
    .default([]),
  regions: z.array(materialRegionSchema).max(32),
});

export const projectConfigSchema = z.object({
  schema: z.enum(["pixel-workbench-project/v1", "pixel-workbench-project/v2"]),
  source: z.string().min(1),
  options: processOptionsSchema,
});

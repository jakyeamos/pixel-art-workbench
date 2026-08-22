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
  regions: z.array(materialRegionSchema).max(32),
});

export const projectConfigSchema = z.object({
  schema: z.literal("pixel-workbench-project/v1"),
  source: z.string().min(1),
  options: processOptionsSchema,
});

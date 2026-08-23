import type { SceneNativeSize, SceneSizing } from "./types";

const MAX_DENSITY_MISMATCH = 0.02;

function positiveInteger(label: string, value: number): void {
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${label} must be a positive integer.`);
}

export function deriveSceneNativeSize(
  sourceWidth: number,
  sourceHeight: number,
  scene: SceneSizing,
): SceneNativeSize {
  positiveInteger("Source width", sourceWidth);
  positiveInteger("Source height", sourceHeight);
  positiveInteger("Scene render width", scene.renderWidth);
  positiveInteger("Scene render height", scene.renderHeight);
  positiveInteger("Scene logical width", scene.logicalWidth);
  positiveInteger("Scene logical height", scene.logicalHeight);

  const densityX = scene.renderWidth / scene.logicalWidth;
  const densityY = scene.renderHeight / scene.logicalHeight;
  const mismatch = Math.abs(densityX - densityY) / Math.max(densityX, densityY);
  if (mismatch > MAX_DENSITY_MISMATCH)
    throw new Error(
      "Scene render and logical dimensions imply incompatible pixel density across the two axes.",
    );

  return {
    width: Math.max(1, Math.round(sourceWidth / densityX)),
    height: Math.max(1, Math.round(sourceHeight / densityY)),
    densityX,
    densityY,
  };
}

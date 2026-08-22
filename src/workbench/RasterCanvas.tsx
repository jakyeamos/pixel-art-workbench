import { useEffect, useRef } from "react";

import type { Raster } from "../core/types";
import { drawRaster } from "./image";

export function RasterCanvas({
  raster,
  label,
}: {
  readonly raster: Raster;
  readonly label: string;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawRaster(ref.current, raster);
  }, [raster]);
  return <canvas ref={ref} className="raster-canvas" aria-label={label} />;
}

import type { PointerEventHandler } from "react";

import type {
  Point,
  ProcessOptions,
  ProcessResult,
  Raster,
} from "../core/types";
import { RasterCanvas } from "./RasterCanvas";
import type { CutoutTool } from "./WorkbenchControls";

interface WorkbenchStageProps {
  readonly source: Raster | null;
  readonly displayRaster: Raster | null;
  readonly cutoutTool: CutoutTool;
  readonly drawingRegion: boolean;
  readonly draft: readonly Point[];
  readonly regionPolygon: string;
  readonly options: ProcessOptions;
  readonly result: ProcessResult | null;
  readonly handleFile: (file: File) => Promise<void>;
  readonly onPointerDown: PointerEventHandler<SVGSVGElement>;
  readonly onPointerMove: PointerEventHandler<SVGSVGElement>;
  readonly onPointerUp: PointerEventHandler<SVGSVGElement>;
}

export function WorkbenchStage({
  source,
  displayRaster,
  cutoutTool,
  drawingRegion,
  draft,
  regionPolygon,
  options,
  result,
  handleFile,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: WorkbenchStageProps): React.JSX.Element {
  if (!source || !displayRaster) {
    return (
      <div className="stage">
        <label
          className="drop-zone"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
        >
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <strong>Drop a reference here</strong>
          <span>PNG, JPEG, or WebP · never uploaded</span>
        </label>
      </div>
    );
  }

  return (
    <div className="stage">
      <div
        className={`canvas-shell ${cutoutTool !== "off" ? "cutout-active" : ""}`}
        style={
          {
            aspectRatio: `${displayRaster.width} / ${displayRaster.height}`,
            "--raster-ratio": displayRaster.width / displayRaster.height,
          } as React.CSSProperties
        }
      >
        <RasterCanvas
          raster={displayRaster}
          label={
            cutoutTool !== "off"
              ? "Cutout preview"
              : "Converted pixel underpainting"
          }
        />
        <svg
          className={`region-overlay ${drawingRegion || cutoutTool !== "off" ? "is-drawing" : ""}`}
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          {options.regions.map((region) => (
            <polygon
              key={region.id}
              points={region.polygon
                .map((point) => `${point.x * 1000},${point.y * 1000}`)
                .join(" ")}
            />
          ))}
          {draft.length > 0 && <polyline points={regionPolygon} />}
          {draft.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x * 1000}
              cy={point.y * 1000}
              r="7"
            />
          ))}
        </svg>
      </div>
      <div className="stage-caption">
        <strong>
          {cutoutTool !== "off" ? "Cutout preview" : "Canonical underpainting"}
        </strong>
        <span>
          {displayRaster.width} × {displayRaster.height}
        </span>
      </div>
      {result && (
        <div className="metrics" aria-label="Processing metrics">
          <span>{result.metrics.totalPaletteColors} colors</span>
          <span>{result.metrics.cleanedPixels} cleanup pixels</span>
          <span>{result.metrics.regionCount} regions</span>
        </div>
      )}
    </div>
  );
}

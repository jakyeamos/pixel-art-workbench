import type { Dispatch, SetStateAction } from "react";

import { maskDiagnostic, scaleNearest } from "../core/assets";
import type {
  AlphaMask,
  ProcessOptions,
  ProcessResult,
  Raster,
} from "../core/types";
import { RasterCanvas } from "./RasterCanvas";

function numeric(event: React.ChangeEvent<HTMLInputElement>): number {
  return Number(event.currentTarget.value);
}

interface ExportPanelProps {
  readonly result: ProcessResult | null;
  readonly canonicalAsset: Raster | null;
  readonly mask: AlphaMask | null;
  readonly options: ProcessOptions;
  readonly assetPadding: number;
  readonly setAssetPadding: Dispatch<SetStateAction<number>>;
  readonly exportScale: number;
  readonly setExportScale: Dispatch<SetStateAction<number>>;
  readonly downloadRaster: (raster: Raster, suffix: string) => Promise<void>;
  readonly downloadProject: () => void;
}

export function ExportPanel({
  result,
  canonicalAsset,
  mask,
  options,
  assetPadding,
  setAssetPadding,
  exportScale,
  setExportScale,
  downloadRaster,
  downloadProject,
}: ExportPanelProps): React.JSX.Element {
  return (
    <aside className="inspection" aria-label="Inspection and export">
      <h2>Preflight & export</h2>
      {result && canonicalAsset && mask ? (
        <>
          <div className="diagnostic-grid">
            <figure>
              <RasterCanvas
                raster={result.edgeDiagnostic}
                label="Protected edge diagnostic"
              />
              <figcaption>Protected edges</figcaption>
            </figure>
            <figure>
              <RasterCanvas
                raster={result.cleanupDiagnostic}
                label="Cluster cleanup diagnostic"
              />
              <figcaption>Cluster cleanup</figcaption>
            </figure>
          </div>
          <div
            className="palette"
            aria-label={
              options.lockedPalette.length > 0
                ? "Locked palette"
                : "Extracted palette"
            }
          >
            {result.palette.slice(0, 96).map((color) => (
              <span
                key={color.hex}
                title={`${color.hex} · ${color.count} pixels`}
                style={{ backgroundColor: color.hex }}
              />
            ))}
          </div>
          <p className="hint">
            {options.lockedPalette.length > 0
              ? `${options.lockedPalette.length} family colors locked.`
              : "Palette extracted from this asset."}
          </p>
          <fieldset className="export-settings">
            <legend>Canonical export</legend>
            <label htmlFor="workbench-transparent-padding">
              Transparent padding <output>{assetPadding}px</output>
              <input
                id="workbench-transparent-padding"
                type="range"
                min="0"
                max="16"
                step="1"
                value={assetPadding}
                onChange={(event) => setAssetPadding(numeric(event))}
              />
            </label>
            <label htmlFor="workbench-integer-scale">
              Integer scale <output>{exportScale}×</output>
              <input
                id="workbench-integer-scale"
                type="range"
                min="1"
                max="8"
                step="1"
                value={exportScale}
                onChange={(event) => setExportScale(numeric(event))}
              />
            </label>
          </fieldset>
          <div className="exports">
            <button
              type="button"
              onClick={() =>
                void downloadRaster(canonicalAsset, "canonical-1x")
              }
            >
              Download underpainting
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadRaster(
                  scaleNearest(canonicalAsset, exportScale),
                  `${exportScale}x`,
                )
              }
            >
              Download {exportScale}× nearest-neighbor PNG
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadRaster(maskDiagnostic(mask), "alpha-mask")
              }
            >
              Download alpha mask
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadRaster(result.edgeDiagnostic, "edge-map")
              }
            >
              Download edge map
            </button>
            <button
              type="button"
              onClick={() =>
                void downloadRaster(result.cleanupDiagnostic, "cleanup-map")
              }
            >
              Download cleanup map
            </button>
            <button type="button" onClick={downloadProject}>
              Download asset recipe
            </button>
          </div>
          <p className="scale-note">
            <strong>One canonical sprite.</strong> Integer PNG scales and CSS{" "}
            <code>image-rendering: pixelated</code> preserve its pixels. A
            different logical resolution is a retarget draft and still needs an
            art pass.
          </p>
          <p className="provenance">
            <strong>Reference underpainting.</strong> Human pixel cleanup
            remains required before production. Resizing an authored canonical
            sprite does not add new detail.
          </p>
        </>
      ) : (
        <p className="hint">
          Cutout diagnostics, palette controls, and canonical exports appear
          after conversion.
        </p>
      )}
    </aside>
  );
}

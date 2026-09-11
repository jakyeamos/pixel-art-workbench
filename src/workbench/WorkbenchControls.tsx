import type { Dispatch, SetStateAction } from "react";

import { createOpaqueMask, invertMask } from "../core/assets";
import type {
  AlphaMask,
  MaterialRegion,
  Point,
  ProcessOptions,
  Raster,
  SceneNativeSize,
  SceneSizing,
} from "../core/types";

export type CutoutTool = "off" | "erase" | "restore" | "sample";

const PROFILES = {
  icon: { label: "Icon · 32px", width: 32, colors: 16, cluster: 1 },
  "small-prop": {
    label: "Small prop · 64px",
    width: 64,
    colors: 24,
    cluster: 1,
  },
  prop: { label: "Desk prop · 96px", width: 96, colors: 32, cluster: 2 },
  portrait: { label: "Portrait · 128px", width: 128, colors: 48, cluster: 2 },
  scene: { label: "Scene · 480px", width: 480, colors: 96, cluster: 2 },
} as const;

function numeric(event: React.ChangeEvent<HTMLInputElement>): number {
  return Number(event.currentTarget.value);
}

interface WorkbenchControlsProps {
  readonly source: Raster | null;
  readonly mask: AlphaMask | null;
  readonly resultExists: boolean;
  readonly options: ProcessOptions;
  readonly setOptions: Dispatch<SetStateAction<ProcessOptions>>;
  readonly sceneSizing: SceneSizing | null;
  readonly setSceneSizing: Dispatch<SetStateAction<SceneSizing | null>>;
  readonly defaultSceneSizing: SceneSizing;
  readonly sceneNativeSize: SceneNativeSize | null;
  readonly cutoutTool: CutoutTool;
  readonly setCutoutTool: Dispatch<SetStateAction<CutoutTool>>;
  readonly brushRadius: number;
  readonly setBrushRadius: Dispatch<SetStateAction<number>>;
  readonly backgroundTolerance: number;
  readonly setBackgroundTolerance: Dispatch<SetStateAction<number>>;
  readonly historyAvailability: {
    readonly undo: boolean;
    readonly redo: boolean;
  };
  readonly drawingRegion: boolean;
  readonly setDrawingRegion: Dispatch<SetStateAction<boolean>>;
  readonly setDraft: Dispatch<SetStateAction<readonly Point[]>>;
  readonly handleFile: (file: File) => Promise<void>;
  readonly importMask: (file: File) => Promise<void>;
  readonly importPalette: (file: File) => Promise<void>;
  readonly undoMask: () => void;
  readonly redoMask: () => void;
  readonly replaceMask: (next: AlphaMask) => void;
  readonly finishRegion: () => void;
  readonly updateRegion: (
    id: string,
    patch: Partial<Pick<MaterialRegion, "name" | "maxColors" | "dither">>,
  ) => void;
}

export function WorkbenchControls({
  source,
  mask,
  resultExists,
  options,
  setOptions,
  sceneSizing,
  setSceneSizing,
  defaultSceneSizing,
  sceneNativeSize,
  cutoutTool,
  setCutoutTool,
  brushRadius,
  setBrushRadius,
  backgroundTolerance,
  setBackgroundTolerance,
  historyAvailability,
  drawingRegion,
  setDrawingRegion,
  setDraft,
  handleFile,
  importMask,
  importPalette,
  undoMask,
  redoMask,
  replaceMask,
  finishRegion,
  updateRegion,
}: WorkbenchControlsProps): React.JSX.Element {
  return (
    <aside className="controls">
      <label className="upload">
        <span>Reference image</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </label>

      <fieldset disabled={!source}>
        <legend>Cutout</legend>
        <div className="tool-grid" role="group" aria-label="Cutout tools">
          {(["sample", "erase", "restore"] as const).map((tool) => (
            <button
              key={tool}
              type="button"
              aria-pressed={cutoutTool === tool}
              onClick={() => {
                setDrawingRegion(false);
                setCutoutTool(tool);
              }}
            >
              {tool === "sample"
                ? "Pick background"
                : `${tool[0]?.toUpperCase()}${tool.slice(1)}`}
            </button>
          ))}
          <button
            type="button"
            className="quiet"
            onClick={() => setCutoutTool("off")}
          >
            Preview art
          </button>
        </div>
        <label htmlFor="workbench-brush-size">
          Brush size <output>{Math.round(brushRadius * 100)}%</output>
          <input
            id="workbench-brush-size"
            type="range"
            min="0.005"
            max="0.16"
            step="0.005"
            value={brushRadius}
            onChange={(event) => setBrushRadius(numeric(event))}
          />
        </label>
        <label htmlFor="workbench-background-tolerance">
          Background tolerance{" "}
          <output>{Math.round(backgroundTolerance * 100)}%</output>
          <input
            id="workbench-background-tolerance"
            type="range"
            min="0.01"
            max="0.5"
            step="0.01"
            value={backgroundTolerance}
            onChange={(event) => setBackgroundTolerance(numeric(event))}
          />
        </label>
        <div className="tool-grid">
          <label className="mini-upload">
            Import mask
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importMask(file);
              }}
            />
          </label>
          <button
            type="button"
            className="quiet"
            disabled={!historyAvailability.undo}
            onClick={undoMask}
            title="Undo mask edit (Command/Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            className="quiet"
            disabled={!historyAvailability.redo}
            onClick={redoMask}
            title="Redo mask edit (Command/Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => mask && replaceMask(invertMask(mask))}
          >
            Invert mask
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() =>
              source &&
              replaceMask(createOpaqueMask(source.width, source.height))
            }
          >
            Reset mask
          </button>
        </div>
      </fieldset>

      <fieldset disabled={!source}>
        <legend>Asset profile</legend>
        <label className="scene-sizing-toggle">
          <input
            type="checkbox"
            checked={Boolean(sceneSizing)}
            onChange={(event) =>
              setSceneSizing(
                event.currentTarget.checked ? defaultSceneSizing : null,
              )
            }
          />
          Match an existing scene grid
        </label>
        {sceneSizing ? (
          <div className="scene-sizing-fields">
            <p className="hint">
              Retarget this asset into the same logical pixel density as its
              scene.
            </p>
            <div className="dimension-pair">
              <label>
                Render width
                <input
                  type="number"
                  min="1"
                  max="16384"
                  value={sceneSizing.renderWidth}
                  onChange={(event) =>
                    setSceneSizing((current) =>
                      current
                        ? { ...current, renderWidth: numeric(event) }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Render height
                <input
                  type="number"
                  min="1"
                  max="16384"
                  value={sceneSizing.renderHeight}
                  onChange={(event) =>
                    setSceneSizing((current) =>
                      current
                        ? { ...current, renderHeight: numeric(event) }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Logical width
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={sceneSizing.logicalWidth}
                  onChange={(event) =>
                    setSceneSizing((current) =>
                      current
                        ? { ...current, logicalWidth: numeric(event) }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Logical height
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={sceneSizing.logicalHeight}
                  onChange={(event) =>
                    setSceneSizing((current) =>
                      current
                        ? { ...current, logicalHeight: numeric(event) }
                        : current,
                    )
                  }
                />
              </label>
            </div>
            <p className="scene-sizing-result" role="status">
              {sceneNativeSize
                ? `Scene-native draft: ${sceneNativeSize.width}×${sceneNativeSize.height}px · ${sceneNativeSize.densityX.toFixed(2)} render pixels per logical pixel`
                : "Scene dimensions must describe the same pixel density on both axes."}
            </p>
          </div>
        ) : null}
        <label>
          Purpose
          <select
            defaultValue="prop"
            onChange={(event) => {
              const profile =
                PROFILES[event.currentTarget.value as keyof typeof PROFILES];
              if (!profile) return;
              setOptions((current) => ({
                ...current,
                targetWidth: profile.width,
                maxColors: profile.colors,
                minClusterSize: profile.cluster,
              }));
            }}
          >
            {Object.entries(PROFILES).map(([id, profile]) => (
              <option key={id} value={id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="workbench-logical-width">
          Logical width <output>{options.targetWidth}px</output>
          <input
            id="workbench-logical-width"
            type="range"
            min="16"
            max="960"
            step="8"
            value={options.targetWidth}
            disabled={Boolean(sceneSizing)}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                targetWidth: numeric(event),
              }))
            }
          />
        </label>
        <label htmlFor="workbench-palette-ceiling">
          Palette ceiling <output>{options.maxColors}</output>
          <input
            id="workbench-palette-ceiling"
            type="range"
            min="4"
            max="256"
            step="4"
            value={options.maxColors}
            disabled={options.lockedPalette.length > 0}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                maxColors: numeric(event),
              }))
            }
          />
        </label>
        <label htmlFor="workbench-dither">
          Dither <output>{Math.round(options.dither * 100)}%</output>
          <input
            id="workbench-dither"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={options.dither}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                dither: numeric(event),
              }))
            }
          />
        </label>
        <label htmlFor="workbench-edge-lock">
          Edge lock <output>{Math.round(options.edgeThreshold * 100)}%</output>
          <input
            id="workbench-edge-lock"
            type="range"
            min="0.05"
            max="0.8"
            step="0.05"
            value={options.edgeThreshold}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                edgeThreshold: numeric(event),
              }))
            }
          />
        </label>
        <label htmlFor="workbench-minimum-cluster">
          Minimum cluster <output>{options.minClusterSize}px</output>
          <input
            id="workbench-minimum-cluster"
            type="range"
            min="1"
            max="12"
            step="1"
            value={options.minClusterSize}
            onChange={(event) =>
              setOptions((current) => ({
                ...current,
                minClusterSize: numeric(event),
              }))
            }
          />
        </label>
        <label className="mini-upload palette-upload">
          Lock palette (.gpl or text)
          <input
            type="file"
            accept=".gpl,.txt,.hex,text/plain"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importPalette(file);
            }}
          />
        </label>
        {options.lockedPalette.length > 0 && (
          <button
            type="button"
            className="quiet"
            onClick={() =>
              setOptions((current) => ({ ...current, lockedPalette: [] }))
            }
          >
            Use extracted palette instead
          </button>
        )}
      </fieldset>

      <section className="regions" aria-labelledby="regions-title">
        <div className="section-heading">
          <h2 id="regions-title">Material regions</h2>
          <button
            type="button"
            disabled={!resultExists || options.lockedPalette.length > 0}
            onClick={() => {
              setCutoutTool("off");
              setDraft([]);
              setDrawingRegion(true);
            }}
          >
            Trace region
          </button>
        </div>
        <p className="hint">
          Paper, wood, brass, ceramic, and light can keep separate color and
          dither budgets. A locked family palette overrides region palettes.
        </p>
        {drawingRegion && (
          <div className="drawing-actions">
            <button type="button" onClick={finishRegion}>
              Finish polygon
            </button>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setDraft([]);
                setDrawingRegion(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {options.regions.map((region) => (
          <article className="region" key={region.id}>
            <input
              aria-label="Region name"
              value={region.name}
              onChange={(event) =>
                updateRegion(region.id, { name: event.currentTarget.value })
              }
            />
            <label>
              Colors{" "}
              <input
                type="number"
                min="2"
                max="256"
                value={region.maxColors}
                onChange={(event) =>
                  updateRegion(region.id, { maxColors: numeric(event) })
                }
              />
            </label>
            <label>
              Dither{" "}
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={region.dither}
                onChange={(event) =>
                  updateRegion(region.id, { dither: numeric(event) })
                }
              />
            </label>
            <button
              type="button"
              className="quiet"
              onClick={() =>
                setOptions((current) => ({
                  ...current,
                  regions: current.regions.filter(
                    (item) => item.id !== region.id,
                  ),
                }))
              }
            >
              Remove
            </button>
          </article>
        ))}
      </section>
    </aside>
  );
}

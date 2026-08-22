import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  MaterialRegion,
  Point,
  ProcessOptions,
  ProcessResult,
  Raster,
} from "./core/types";
import { DEFAULT_OPTIONS } from "./core/types";
import { downloadBlob, fileToRaster, rasterToBlob } from "./workbench/image";
import { RasterCanvas } from "./workbench/RasterCanvas";

interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: ProcessResult;
  readonly error?: string;
}

function numeric(event: React.ChangeEvent<HTMLInputElement>): number {
  return Number(event.currentTarget.value);
}

export default function App(): React.JSX.Element {
  const [source, setSource] = useState<Raster | null>(null);
  const [sourceName, setSourceName] = useState("untitled.png");
  const [options, setOptions] = useState<ProcessOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [status, setStatus] = useState("Drop in a reference image to begin.");
  const [draft, setDraft] = useState<readonly Point[]>([]);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);

  useEffect(() => {
    const instance = new Worker(
      new URL("./workbench/processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    // quality-gate: allow handler-before-send: attach the response listener before request dispatch so a fast worker response cannot race setup.
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== request.current) return;
      if (event.data.ok && event.data.result) {
        setResult(event.data.result);
        setStatus(
          `Ready · ${event.data.result.metrics.width}×${event.data.result.metrics.height} · ${event.data.result.metrics.totalPaletteColors} colors`,
        );
      } else {
        setStatus(event.data.error ?? "Processing failed.");
      }
    };
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    if (!source || !worker.current) return;
    const timeout = window.setTimeout(() => {
      request.current += 1;
      setStatus("Building underpainting…");
      worker.current?.postMessage({ id: request.current, source, options });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [source, options]);

  const handleFile = useCallback(async (file: File): Promise<void> => {
    setStatus("Reading source…");
    try {
      const next = await fileToRaster(file);
      setSource(next);
      setSourceName(file.name);
      setResult(null);
      setStatus("Building underpainting…");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The image could not be read.",
      );
    }
  }, []);

  const regionPolygon = useMemo(
    () => draft.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" "),
    [draft],
  );

  const addPoint = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (!drawingRegion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
    setDraft((current) => [...current, point]);
  };

  const finishRegion = (): void => {
    if (draft.length < 3) {
      setStatus("A material region needs at least three points.");
      return;
    }
    const number = options.regions.length + 1;
    const region: MaterialRegion = {
      id: `material-${number}`,
      name: `Material ${number}`,
      polygon: draft,
      maxColors: 24,
      dither: 0,
    };
    setOptions((current) => ({
      ...current,
      regions: [...current.regions, region],
    }));
    setDraft([]);
    setDrawingRegion(false);
  };

  const updateRegion = (
    id: string,
    patch: Partial<Pick<MaterialRegion, "name" | "maxColors" | "dither">>,
  ): void => {
    setOptions((current) => ({
      ...current,
      regions: current.regions.map((region) =>
        region.id === id ? { ...region, ...patch } : region,
      ),
    }));
  };

  const removeRegion = (id: string): void => {
    setOptions((current) => ({
      ...current,
      regions: current.regions.filter((region) => region.id !== id),
    }));
  };

  const downloadRaster = async (
    raster: Raster,
    suffix: string,
  ): Promise<void> => {
    const base = sourceName.replace(/\.[^.]+$/, "") || "underpainting";
    downloadBlob(await rasterToBlob(raster), `${base}-${suffix}.png`);
  };

  const downloadProject = (): void => {
    if (!result) return;
    const payload = {
      schema: "pixel-workbench-project/v1",
      provenance: "reference-underpainting",
      source: sourceName,
      options,
      palette: result.palette,
      regionPalettes: result.regionPalettes,
      metrics: result.metrics,
    };
    downloadBlob(
      new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
        type: "application/json",
      }),
      `${sourceName.replace(/\.[^.]+$/, "") || "project"}.pixel-workbench.json`,
    );
  };

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">Local pixel production utility</p>
          <h1>Pixel Art Workbench</h1>
        </div>
        <p className="status" role="status">
          {status}
        </p>
      </header>

      <section className="workspace" aria-label="Pixel conversion workspace">
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
            <legend>Global structure</legend>
            <label>
              Logical width <output>{options.targetWidth}px</output>
              <input
                type="range"
                min="64"
                max="960"
                step="16"
                value={options.targetWidth}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    targetWidth: numeric(event),
                  }))
                }
              />
            </label>
            <label>
              Palette ceiling <output>{options.maxColors}</output>
              <input
                type="range"
                min="4"
                max="256"
                step="4"
                value={options.maxColors}
                onChange={(event) =>
                  setOptions((current) => ({
                    ...current,
                    maxColors: numeric(event),
                  }))
                }
              />
            </label>
            <label>
              Dither <output>{Math.round(options.dither * 100)}%</output>
              <input
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
            <label>
              Edge lock{" "}
              <output>{Math.round(options.edgeThreshold * 100)}%</output>
              <input
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
            <label>
              Minimum cluster <output>{options.minClusterSize}px</output>
              <input
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
          </fieldset>

          <section className="regions" aria-labelledby="regions-title">
            <div className="section-heading">
              <h2 id="regions-title">Material regions</h2>
              <button
                type="button"
                disabled={!result}
                onClick={() => {
                  setDraft([]);
                  setDrawingRegion(true);
                }}
              >
                Trace region
              </button>
            </div>
            <p className="hint">
              Give paper, wood, brass, light, or skin its own palette and dither
              behavior.
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
                  onClick={() => removeRegion(region.id)}
                >
                  Remove
                </button>
              </article>
            ))}
          </section>
        </aside>

        <div className="stage">
          {!result ? (
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
              <strong>Drop a composition here</strong>
              <span>PNG, JPEG, or WebP · processed locally</span>
            </label>
          ) : (
            <>
              <div
                className="canvas-shell"
                style={
                  {
                    aspectRatio: `${result.underpainting.width} / ${result.underpainting.height}`,
                    "--raster-ratio":
                      result.underpainting.width / result.underpainting.height,
                  } as React.CSSProperties
                }
              >
                <RasterCanvas
                  raster={result.underpainting}
                  label="Converted pixel underpainting"
                />
                <svg
                  className={`region-overlay ${drawingRegion ? "is-drawing" : ""}`}
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  onPointerDown={addPoint}
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
              <div className="metrics" aria-label="Processing metrics">
                <span>
                  {result.metrics.width} × {result.metrics.height}
                </span>
                <span>{result.metrics.totalPaletteColors} colors</span>
                <span>{result.metrics.cleanedPixels} cleanup pixels</span>
                <span>{result.metrics.regionCount} regions</span>
              </div>
            </>
          )}
        </div>

        <aside className="inspection" aria-label="Inspection and export">
          <h2>Preflight</h2>
          {result ? (
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
              <div className="palette" aria-label="Extracted palette">
                {result.palette.slice(0, 96).map((color) => (
                  <span
                    key={color.hex}
                    title={`${color.hex} · ${color.count} pixels`}
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
              <div className="exports">
                <button
                  type="button"
                  onClick={() => {
                    void downloadRaster(result.underpainting, "underpainting");
                  }}
                >
                  Download underpainting
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void downloadRaster(result.edgeDiagnostic, "edge-map");
                  }}
                >
                  Download edge map
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void downloadRaster(
                      result.cleanupDiagnostic,
                      "cleanup-map",
                    );
                  }}
                >
                  Download cleanup map
                </button>
                <button type="button" onClick={downloadProject}>
                  Download project recipe
                </button>
              </div>
              <p className="provenance">
                <strong>Reference underpainting.</strong> Human pixel cleanup
                remains required before production.
              </p>
            </>
          ) : (
            <p className="hint">
              Diagnostics, palette counts, and exports appear after conversion.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}

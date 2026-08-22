import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  applyAlphaMask,
  clearConnectedBackground,
  createOpaqueMask,
  maskFromRaster,
  paintMaskLine,
  parsePaletteText,
  trimTransparent,
} from "./core/assets";
import { resizeArea } from "./core/process";
import type {
  AlphaMask,
  MaterialRegion,
  Point,
  ProcessOptions,
  ProcessResult,
  Raster,
} from "./core/types";
import { DEFAULT_OPTIONS } from "./core/types";
import { downloadBlob, fileToRaster, rasterToBlob } from "./workbench/image";
import { ExportPanel } from "./workbench/ExportPanel";
import {
  WorkbenchControls,
  type CutoutTool,
} from "./workbench/WorkbenchControls";
import { WorkbenchStage } from "./workbench/WorkbenchStage";

interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: ProcessResult;
  readonly error?: string;
}

const MAX_MASK_HISTORY_ENTRIES = 20;
const MAX_MASK_HISTORY_BYTES = 64 * 1024 * 1024;

function appendMaskSnapshot(
  history: readonly AlphaMask[],
  snapshot: AlphaMask,
): AlphaMask[] {
  const candidates = [...history, snapshot].slice(-MAX_MASK_HISTORY_ENTRIES);
  const retained: AlphaMask[] = [];
  let bytes = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (!candidate) continue;
    const candidateBytes = candidate.data.byteLength;
    if (retained.length > 0 && bytes + candidateBytes > MAX_MASK_HISTORY_BYTES)
      break;
    retained.unshift(candidate);
    bytes += candidateBytes;
  }
  return retained;
}

function prependMaskSnapshot(
  history: readonly AlphaMask[],
  snapshot: AlphaMask,
): AlphaMask[] {
  const candidates = [snapshot, ...history].slice(0, MAX_MASK_HISTORY_ENTRIES);
  const retained: AlphaMask[] = [];
  let bytes = 0;
  for (const candidate of candidates) {
    const candidateBytes = candidate.data.byteLength;
    if (retained.length > 0 && bytes + candidateBytes > MAX_MASK_HISTORY_BYTES)
      break;
    retained.push(candidate);
    bytes += candidateBytes;
  }
  return retained;
}

function normalizedPoint(event: React.PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
  };
}

export default function App(): React.JSX.Element {
  const [source, setSource] = useState<Raster | null>(null);
  const [mask, setMask] = useState<AlphaMask | null>(null);
  const [sourceName, setSourceName] = useState("untitled.png");
  const [options, setOptions] = useState<ProcessOptions>(DEFAULT_OPTIONS);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [status, setStatus] = useState("Drop in a reference image to begin.");
  const [draft, setDraft] = useState<readonly Point[]>([]);
  const [drawingRegion, setDrawingRegion] = useState(false);
  const [cutoutTool, setCutoutTool] = useState<CutoutTool>("off");
  const [brushRadius, setBrushRadius] = useState(0.035);
  const [backgroundTolerance, setBackgroundTolerance] = useState(0.12);
  const [assetPadding, setAssetPadding] = useState(1);
  const [exportScale, setExportScale] = useState(2);
  const [historyAvailability, setHistoryAvailability] = useState({
    undo: false,
    redo: false,
  });
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  const lastStroke = useRef<Point | null>(null);
  const painting = useRef(false);
  const maskHistory = useRef<AlphaMask[]>([]);
  const maskFuture = useRef<AlphaMask[]>([]);

  const preparedSource = useMemo(() => {
    if (!source || !mask) return null;
    return trimTransparent(applyAlphaMask(source, mask));
  }, [mask, source]);

  const cutoutPreview = useMemo(() => {
    if (!source || !mask) return null;
    const masked = applyAlphaMask(source, mask);
    return resizeArea(masked, Math.min(960, masked.width));
  }, [mask, source]);

  const canonicalAsset = useMemo(
    () => (result ? trimTransparent(result.underpainting, assetPadding) : null),
    [assetPadding, result],
  );

  useEffect(() => {
    const instance = new Worker(
      new URL("./workbench/processor.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.current = instance;
    // quality-gate: allow handler-before-send: A worker listener must exist before the debounced request so a fast response cannot race setup.
    instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== request.current) return;
      if (event.data.ok && event.data.result) {
        setResult(event.data.result);
        setStatus(
          `Ready · ${event.data.result.metrics.width}×${event.data.result.metrics.height} · ${event.data.result.metrics.totalPaletteColors} colors`,
        );
      } else setStatus(event.data.error ?? "Processing failed.");
    };
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    if (!preparedSource || !worker.current) return;
    const timeout = window.setTimeout(() => {
      request.current += 1;
      setStatus("Building underpainting…");
      worker.current?.postMessage({
        id: request.current,
        source: preparedSource,
        options,
      });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [options, preparedSource]);

  const handleFile = useCallback(async (file: File): Promise<void> => {
    setStatus("Reading source…");
    try {
      const next = await fileToRaster(file);
      setSource(next);
      setMask(createOpaqueMask(next.width, next.height));
      maskHistory.current = [];
      maskFuture.current = [];
      setHistoryAvailability({ undo: false, redo: false });
      setSourceName(file.name);
      setResult(null);
      setCutoutTool("off");
      setStatus("Building underpainting…");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The image could not be read.",
      );
    }
  }, []);

  const importMask = useCallback(
    async (file: File): Promise<void> => {
      if (!source) return;
      try {
        const raster = await fileToRaster(file);
        if (mask) {
          maskHistory.current = appendMaskSnapshot(maskHistory.current, mask);
          maskFuture.current = [];
          setHistoryAvailability({ undo: true, redo: false });
        }
        setMask(maskFromRaster(raster, source.width, source.height));
        setCutoutTool("erase");
        setStatus("Mask imported. Refine it with erase and restore brushes.");
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "The mask could not be read.",
        );
      }
    },
    [mask, source],
  );

  const importPalette = useCallback(async (file: File): Promise<void> => {
    const colors = parsePaletteText(await file.text());
    if (colors.length < 2) {
      setStatus("Palette files need at least two RGB colors.");
      return;
    }
    setOptions((current) => ({ ...current, lockedPalette: colors }));
    setStatus(`Locked ${colors.length} palette colors across the asset.`);
  }, []);

  const regionPolygon = useMemo(
    () => draft.map((point) => `${point.x * 1000},${point.y * 1000}`).join(" "),
    [draft],
  );

  const handleStagePointerDown = (
    event: React.PointerEvent<SVGSVGElement>,
  ): void => {
    const point = normalizedPoint(event);
    if (drawingRegion) {
      setDraft((current) => [...current, point]);
      return;
    }
    if (!source || !mask || cutoutTool === "off") return;
    maskHistory.current = appendMaskSnapshot(maskHistory.current, mask);
    maskFuture.current = [];
    setHistoryAvailability({ undo: true, redo: false });
    if (cutoutTool === "sample") {
      setMask(
        clearConnectedBackground(source, mask, point, backgroundTolerance),
      );
      setCutoutTool("erase");
      setStatus(
        "Connected background removed. Refine the edge with the brushes.",
      );
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    painting.current = true;
    lastStroke.current = point;
    setMask(
      paintMaskLine(
        mask,
        point,
        point,
        brushRadius,
        cutoutTool === "erase" ? 0 : 255,
      ),
    );
  };

  const handleStagePointerMove = (
    event: React.PointerEvent<SVGSVGElement>,
  ): void => {
    if (
      !painting.current ||
      !mask ||
      (cutoutTool !== "erase" && cutoutTool !== "restore")
    )
      return;
    const point = normalizedPoint(event);
    const from = lastStroke.current ?? point;
    lastStroke.current = point;
    setMask((current) =>
      current
        ? paintMaskLine(
            current,
            from,
            point,
            brushRadius,
            cutoutTool === "erase" ? 0 : 255,
          )
        : current,
    );
  };

  const stopPainting = (): void => {
    painting.current = false;
    lastStroke.current = null;
  };

  const undoMask = useCallback((): void => {
    if (!mask) return;
    const previous = maskHistory.current.at(-1);
    if (!previous) return;
    maskHistory.current = maskHistory.current.slice(0, -1);
    maskFuture.current = prependMaskSnapshot(maskFuture.current, mask);
    setHistoryAvailability({
      undo: maskHistory.current.length > 0,
      redo: true,
    });
    setMask(previous);
  }, [mask]);

  const redoMask = useCallback((): void => {
    if (!mask) return;
    const next = maskFuture.current[0];
    if (!next) return;
    maskFuture.current = maskFuture.current.slice(1);
    maskHistory.current = appendMaskSnapshot(maskHistory.current, mask);
    setHistoryAvailability({
      undo: true,
      redo: maskFuture.current.length > 0,
    });
    setMask(next);
  }, [mask]);

  const replaceMask = (next: AlphaMask): void => {
    if (mask)
      maskHistory.current = appendMaskSnapshot(maskHistory.current, mask);
    maskFuture.current = [];
    setHistoryAvailability({ undo: Boolean(mask), redo: false });
    setMask(next);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoMask();
      } else if (key === "z") {
        event.preventDefault();
        undoMask();
      } else if (key === "y") {
        event.preventDefault();
        redoMask();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoMask, undoMask]);

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

  const downloadRaster = async (
    raster: Raster,
    suffix: string,
  ): Promise<void> => {
    const base = sourceName.replace(/\.[^.]+$/, "") || "asset";
    downloadBlob(await rasterToBlob(raster), `${base}-${suffix}.png`);
  };

  const downloadProject = (): void => {
    if (!result || !canonicalAsset) return;
    const payload = {
      schema: "pixel-workbench-project/v2",
      provenance: "reference-underpainting",
      source: sourceName,
      options,
      asset: {
        canonicalWidth: canonicalAsset.width,
        canonicalHeight: canonicalAsset.height,
        transparentPadding: assetPadding,
        scaling: "integer-nearest-neighbor",
        css: "image-rendering: pixelated",
      },
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

  const displayRaster =
    cutoutTool !== "off" && cutoutPreview ? cutoutPreview : canonicalAsset;

  return (
    <main>
      <header className="masthead">
        <div>
          <p className="eyebrow">Local asset production utility</p>
          <h1>Pixel Art Workbench</h1>
        </div>
        <p className="status" role="status">
          {status}
        </p>
      </header>

      <section className="workflow" aria-label="Asset workflow stages">
        <span className={source ? "complete" : "active"}>1 · Import</span>
        <span
          className={cutoutTool !== "off" ? "active" : source ? "complete" : ""}
        >
          2 · Cutout
        </span>
        <span className={result && cutoutTool === "off" ? "active" : ""}>
          3 · Underpaint
        </span>
        <span className={canonicalAsset ? "ready" : ""}>4 · Export</span>
      </section>

      <section className="workspace" aria-label="Pixel asset workspace">
        <WorkbenchControls
          source={source}
          mask={mask}
          resultExists={Boolean(result)}
          options={options}
          setOptions={setOptions}
          cutoutTool={cutoutTool}
          setCutoutTool={setCutoutTool}
          brushRadius={brushRadius}
          setBrushRadius={setBrushRadius}
          backgroundTolerance={backgroundTolerance}
          setBackgroundTolerance={setBackgroundTolerance}
          historyAvailability={historyAvailability}
          drawingRegion={drawingRegion}
          setDrawingRegion={setDrawingRegion}
          setDraft={setDraft}
          handleFile={handleFile}
          importMask={importMask}
          importPalette={importPalette}
          undoMask={undoMask}
          redoMask={redoMask}
          replaceMask={replaceMask}
          finishRegion={finishRegion}
          updateRegion={updateRegion}
        />
        <WorkbenchStage
          source={source}
          displayRaster={displayRaster}
          cutoutTool={cutoutTool}
          drawingRegion={drawingRegion}
          draft={draft}
          regionPolygon={regionPolygon}
          options={options}
          result={result}
          handleFile={handleFile}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={stopPainting}
        />
        <ExportPanel
          result={result}
          canonicalAsset={canonicalAsset}
          mask={mask}
          options={options}
          assetPadding={assetPadding}
          setAssetPadding={setAssetPadding}
          exportScale={exportScale}
          setExportScale={setExportScale}
          downloadRaster={downloadRaster}
          downloadProject={downloadProject}
        />
      </section>
    </main>
  );
}

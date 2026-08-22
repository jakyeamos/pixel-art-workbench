/// <reference lib="webworker" />

import { processOptionsSchema } from "../core/contracts";
import { processRaster } from "../core/process";
import type { Raster } from "../core/types";

interface WorkerRequest {
  readonly id: number;
  readonly source: Raster;
  readonly options: unknown;
}

// quality-gate: allow handler-before-send: this worker can only send a response after receiving and validating an inbound request.
self.onmessage = (event: MessageEvent<WorkerRequest>): void => {
  try {
    const options = processOptionsSchema.parse(event.data.options);
    const result = processRaster(event.data.source, options);
    self.postMessage({ id: event.data.id, ok: true, result });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      ok: false,
      error:
        error instanceof Error ? error.message : "Unknown processing error",
    });
  }
};

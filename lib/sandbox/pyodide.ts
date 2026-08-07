"use client";

/**
 * Reusable Pyodide sandbox wrapper for the coding workspace (Section G).
 * Deliberately separate from lib/pyodide/loader.ts (Prompt 21's
 * assessment-specific, main-thread, single-function integration) — this
 * one supports arbitrary multi-function project code, common GenAI-track
 * packages, the platform LLM proxy shim, and hard execution limits
 * (Prompt 55), all running in a Web Worker so a runaway loop can't freeze
 * the page.
 */

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  result: string;
  isError: boolean;
  executionTimeMs: number;
  truncated: boolean;
  timedOut: boolean;
}

export interface SandboxExecutionOptions {
  /** Hard wall-clock limit in ms. Default 10s per Prompt 55. */
  timeoutMs?: number;
  /** Additional Pyodide packages to load before running (beyond numpy, loaded at init). */
  packages?: string[];
  /** Scopes the store_document_chunk/search_similar_chunks shim (Prompt 69) to this project. */
  projectId?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;

let worker: Worker | null = null;
let workerReadyPromise: Promise<void> | null = null;
let requestCounter = 0;

/**
 * Creates (or recreates, after a timeout kill) the sandbox worker.
 */
function ensureWorker(): { worker: Worker; ready: Promise<void> } {
  if (worker && workerReadyPromise) {
    return { worker, ready: workerReadyPromise };
  }

  const newWorker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), {
    type: "module",
  });

  const ready = new Promise<void>((resolve) => {
    const onReady = (event: MessageEvent) => {
      if (event.data?.type === "worker_ready") {
        newWorker.removeEventListener("message", onReady);
        resolve();
      }
    };
    newWorker.addEventListener("message", onReady);
  });

  worker = newWorker;
  workerReadyPromise = ready;
  return { worker: newWorker, ready };
}

/** Kills the current worker (e.g. after a timeout) so the next call starts fresh. */
function terminateWorker() {
  if (worker) {
    worker.terminate();
    worker = null;
    workerReadyPromise = null;
  }
}

/** Preloads the worker + Pyodide runtime ahead of the user's first "Run". */
export function preloadSandbox(): Promise<void> {
  return ensureWorker().ready;
}

/**
 * Executes Python code in the sandboxed Web Worker with a hard timeout.
 * If execution doesn't finish in time, the worker is terminated (the only
 * reliable way to stop a truly infinite synchronous loop) and a
 * `timedOut: true` result is returned instead of hanging the caller.
 */
export async function executeInSandbox(
  code: string,
  options: SandboxExecutionOptions = {},
): Promise<SandboxExecutionResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { worker: activeWorker, ready } = ensureWorker();
  await ready;

  const requestId = `req-${Date.now()}-${++requestCounter}`;

  return new Promise<SandboxExecutionResult>((resolve) => {
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      if (settled) return;
      settled = true;
      activeWorker.removeEventListener("message", onMessage);
      terminateWorker();
      resolve({
        stdout: "",
        stderr: `Execution exceeded the ${timeoutMs}ms sandbox timeout and was terminated.`,
        result: "",
        isError: true,
        executionTimeMs: timeoutMs,
        truncated: false,
        timedOut: true,
      });
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.type !== "result" || data.requestId !== requestId) return;
      if (settled) return;
      settled = true;
      clearTimeout(timeoutHandle);
      activeWorker.removeEventListener("message", onMessage);
      resolve({
        stdout: data.stdout,
        stderr: data.stderr,
        result: data.result,
        isError: data.isError,
        executionTimeMs: data.executionTimeMs,
        truncated: data.truncated,
        timedOut: false,
      });
    }

    activeWorker.addEventListener("message", onMessage);
    activeWorker.postMessage({
      type: "execute",
      requestId,
      code,
      packages: options.packages,
      projectId: options.projectId,
    });
  });
}

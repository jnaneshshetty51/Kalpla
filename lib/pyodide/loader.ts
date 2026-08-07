/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    loadPyodide?: (config: { indexURL: string }) => Promise<any>;
  }
}

export interface PyodideExecutionResult {
  stdout: string;
  stderr: string;
  result: string;
  isError: boolean;
  executionTimeMs: number;
}

let pyodideInstance: any = null;
let pyodideLoadingPromise: Promise<any> | null = null;

const PYODIDE_CDN_VERSION = "v0.26.2";
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_CDN_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

/**
 * Lazy-loads the Pyodide WASM runtime from CDN on demand.
 * Caches the initialized singleton instance to prevent duplicate script loading.
 */
export async function loadPyodideEngine(): Promise<any> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (pyodideLoadingPromise) {
    return await pyodideLoadingPromise;
  }

  pyodideLoadingPromise = new Promise(async (resolve, reject) => {
    try {
      if (typeof window === "undefined") {
        throw new Error(
          "Pyodide engine can only be loaded in a browser environment",
        );
      }

      // Check if pyodide.js script is already present in document
      if (!window.loadPyodide) {
        await new Promise<void>((scriptResolve, scriptReject) => {
          const script = document.createElement("script");
          script.src = PYODIDE_SCRIPT_URL;
          script.async = true;
          script.onload = () => scriptResolve();
          script.onerror = () =>
            scriptReject(
              new Error(
                `Failed to load Pyodide script from ${PYODIDE_SCRIPT_URL}`,
              ),
            );
          document.head.appendChild(script);
        });
      }

      if (!window.loadPyodide) {
        throw new Error(
          "Pyodide script loaded but window.loadPyodide function is unavailable",
        );
      }

      const instance = await window.loadPyodide({
        indexURL: PYODIDE_INDEX_URL,
      });

      pyodideInstance = instance;
      resolve(instance);
    } catch (err) {
      pyodideLoadingPromise = null;
      reject(err);
    }
  });

  return await pyodideLoadingPromise;
}

/**
 * Executes a Python code string inside the Pyodide WASM runtime.
 * Captures stdout, stderr, return values, and execution duration.
 * Catches runtime/syntax errors gracefully.
 */
export async function executePythonCode(
  code: string,
): Promise<PyodideExecutionResult> {
  const startTime = performance.now();
  let stdoutBuffer = "";
  let stderrBuffer = "";

  try {
    const pyodide = await loadPyodideEngine();

    // Attach stdout & stderr handlers
    pyodide.setStdout({
      batched: (text: string) => {
        stdoutBuffer += text + "\n";
      },
    });

    pyodide.setStderr({
      batched: (text: string) => {
        stderrBuffer += text + "\n";
      },
    });

    const rawResult = await pyodide.runPythonAsync(code);
    const endTime = performance.now();

    const formattedResult =
      rawResult !== undefined && rawResult !== null
        ? typeof rawResult === "object" &&
          typeof rawResult.toString === "function"
          ? rawResult.toString()
          : String(rawResult)
        : "";

    return {
      stdout: stdoutBuffer.trim(),
      stderr: stderrBuffer.trim(),
      result: formattedResult,
      isError: false,
      executionTimeMs: Math.round(endTime - startTime),
    };
  } catch (err: any) {
    const endTime = performance.now();
    const errorMessage = err?.message || String(err);

    return {
      stdout: stdoutBuffer.trim(),
      stderr: (stderrBuffer + "\n" + errorMessage).trim(),
      result: "",
      isError: true,
      executionTimeMs: Math.round(endTime - startTime),
    };
  }
}

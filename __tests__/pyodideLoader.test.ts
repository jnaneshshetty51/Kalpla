import { describe, it, expect, vi, afterEach } from "vitest";

// executePythonCode calls loadPyodideEngine as a same-module internal
// function reference (not through an imported binding), so vi.mock can't
// intercept that call to isolate executePythonCode's own formatting/error
// logic from the real WASM runtime — a genuine ESM self-mocking limit, not
// something worth refactoring production code around. What IS isolable
// without a real browser/WASM runtime is loadPyodideEngine's own
// browser-guard and singleton-caching behavior, tested below.
describe("lib/pyodide/loader.ts — loadPyodideEngine (singleton caching + browser-only guard)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("throws when called outside a browser environment (window undefined)", async () => {
    vi.resetModules();
    const { loadPyodideEngine } = await import("@/lib/pyodide/loader");

    await expect(loadPyodideEngine()).rejects.toThrow(/browser environment/);
  });

  it("caches the instance — a second call reuses the already-loaded engine rather than re-injecting the script", async () => {
    vi.resetModules();

    const fakeInstance = { id: "pyodide-instance-1" };
    const mockLoadPyodide = vi.fn().mockResolvedValue(fakeInstance);
    const appendedScripts: HTMLElement[] = [];

    vi.stubGlobal("window", { loadPyodide: mockLoadPyodide });
    vi.stubGlobal("document", {
      createElement: () => {
        const script: Record<string, unknown> = {};
        // Firing onload synchronously on next microtask simulates the
        // script tag "loading" instantly since window.loadPyodide is
        // already present in this test (no real network fetch happens).
        Object.defineProperty(script, "src", {
          set() {
            queueMicrotask(() => (script.onload as (() => void) | undefined)?.());
          },
        });
        return script;
      },
      head: { appendChild: (el: HTMLElement) => appendedScripts.push(el) },
    });

    const { loadPyodideEngine } = await import("@/lib/pyodide/loader");

    const first = await loadPyodideEngine();
    const second = await loadPyodideEngine();

    expect(first).toBe(fakeInstance);
    expect(second).toBe(fakeInstance);
    expect(mockLoadPyodide).toHaveBeenCalledTimes(1); // not re-invoked on the cached second call
  });

  it("does not re-inject the pyodide.js script tag if window.loadPyodide is already present", async () => {
    vi.resetModules();

    const mockLoadPyodide = vi.fn().mockResolvedValue({ id: "already-there" });
    let createElementCalls = 0;

    vi.stubGlobal("window", { loadPyodide: mockLoadPyodide });
    vi.stubGlobal("document", {
      createElement: () => {
        createElementCalls++;
        return {};
      },
      head: { appendChild: vi.fn() },
    });

    const { loadPyodideEngine } = await import("@/lib/pyodide/loader");
    await loadPyodideEngine();

    expect(createElementCalls).toBe(0);
    expect(mockLoadPyodide).toHaveBeenCalledWith({
      indexURL: expect.stringContaining("cdn.jsdelivr.net/pyodide"),
    });
  });
});

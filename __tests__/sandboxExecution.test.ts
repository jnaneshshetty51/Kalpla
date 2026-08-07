import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appendCapped, OUTPUT_BUFFER_CAP_CHARS } from "@/lib/sandbox/outputBuffer";

describe("Sandbox output buffer cap (Prompt 55/60)", () => {
  it("appends normally while under the cap", () => {
    const flag = { value: false };
    let buf = "";
    buf = appendCapped(buf, "hello ", flag);
    buf = appendCapped(buf, "world", flag);
    expect(buf).toBe("hello world");
    expect(flag.value).toBe(false);
  });

  it("truncates output exceeding the buffer cap instead of growing unbounded, and marks the truncation flag", () => {
    const flag = { value: false };
    const smallCap = 100;
    let buf = "";
    // Simulate an accidental infinite print loop pushing far more than the cap.
    for (let i = 0; i < 50; i++) {
      buf = appendCapped(buf, "x".repeat(20), flag, smallCap);
    }
    expect(flag.value).toBe(true);
    expect(buf.length).toBeLessThan(smallCap + 100); // capped + truncation notice, not 1000 chars
    expect(buf).toContain("[...output truncated: exceeded buffer cap...]");
  });

  it("stops appending further chunks once truncated, rather than continuing to grow", () => {
    const flag = { value: false };
    const smallCap = 50;
    let buf = appendCapped("", "x".repeat(60), flag, smallCap);
    expect(flag.value).toBe(true);
    const afterFirstTruncation = buf;
    buf = appendCapped(buf, "more text that should be ignored", flag, smallCap);
    expect(buf).toBe(afterFirstTruncation);
  });

  it("uses a real, sane default cap size", () => {
    expect(OUTPUT_BUFFER_CAP_CHARS).toBeGreaterThan(1000);
  });
});

// --- executeInSandbox: main-thread timeout/termination behavior ---
// A real Worker + Pyodide + WASM can't run in vitest's node environment,
// so the Worker global is mocked to a controllable fake. This still tests
// the REAL lib/sandbox/pyodide.ts logic (timeout racing, terminate() on
// hang, returning a normal result) — only the browser Worker primitive
// itself is stubbed, which is the correct seam: that's the platform API
// boundary, not application logic.
class FakeWorker {
  static instances: FakeWorker[] = [];
  listeners: Array<(event: { data: unknown }) => void> = [];
  terminated = false;
  postedMessages: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(_type: string, cb: (event: { data: unknown }) => void) {
    this.listeners.push(cb);
  }
  removeEventListener(_type: string, cb: (event: { data: unknown }) => void) {
    this.listeners = this.listeners.filter((l) => l !== cb);
  }
  postMessage(msg: unknown) {
    this.postedMessages.push(msg);
  }
  terminate() {
    this.terminated = true;
  }

  emit(data: unknown) {
    for (const cb of this.listeners) cb({ data });
  }
}

describe("lib/sandbox/pyodide.ts executeInSandbox (Prompt 60)", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker as unknown as typeof Worker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("normal code executes and returns the expected output", async () => {
    const { executeInSandbox } = await import("@/lib/sandbox/pyodide");

    const execPromise = executeInSandbox("print('hello world')");

    // Let ensureWorker() create the fake worker and register listeners.
    await new Promise((r) => setTimeout(r, 0));
    const worker = FakeWorker.instances[0];
    expect(worker).toBeDefined();

    // Simulate the worker announcing readiness, then replying to the execute request.
    worker.emit({ type: "worker_ready" });
    await new Promise((r) => setTimeout(r, 0));

    const executeMsg = worker.postedMessages.find(
      (m) => (m as { type: string }).type === "execute",
    ) as { requestId: string };
    expect(executeMsg).toBeDefined();

    worker.emit({
      type: "result",
      requestId: executeMsg.requestId,
      stdout: "hello world",
      stderr: "",
      result: "",
      isError: false,
      executionTimeMs: 12,
      truncated: false,
    });

    const result = await execPromise;
    expect(result.timedOut).toBe(false);
    expect(result.isError).toBe(false);
    expect(result.stdout).toBe("hello world");
  });

  it("a deliberately infinite-looping snippet is terminated by the timeout rather than hanging the caller", async () => {
    const { executeInSandbox } = await import("@/lib/sandbox/pyodide");

    // Short timeout so the test itself doesn't hang for 10 real seconds —
    // this exercises the exact same race/terminate logic as production,
    // just with a smaller number.
    const execPromise = executeInSandbox("while True: pass", { timeoutMs: 30 });

    await new Promise((r) => setTimeout(r, 0));
    const worker = FakeWorker.instances[0];
    worker.emit({ type: "worker_ready" });

    // Deliberately never emit a "result" message — simulates a genuinely
    // hung/infinite-looping execution that never reports back.
    const result = await execPromise;

    expect(result.timedOut).toBe(true);
    expect(result.isError).toBe(true);
    expect(worker.terminated).toBe(true);
  });

  it("terminating a hung worker means the next call starts a fresh worker instance", async () => {
    const { executeInSandbox } = await import("@/lib/sandbox/pyodide");

    const firstExec = executeInSandbox("while True: pass", { timeoutMs: 20 });
    await new Promise((r) => setTimeout(r, 0));
    FakeWorker.instances[0].emit({ type: "worker_ready" });
    await firstExec;

    expect(FakeWorker.instances[0].terminated).toBe(true);

    const secondExecPromise = executeInSandbox("print('fresh')");
    await new Promise((r) => setTimeout(r, 0));

    expect(FakeWorker.instances.length).toBe(2);
    const secondWorker = FakeWorker.instances[1];
    secondWorker.emit({ type: "worker_ready" });
    await new Promise((r) => setTimeout(r, 0));

    const executeMsg = secondWorker.postedMessages.find(
      (m) => (m as { type: string }).type === "execute",
    ) as { requestId: string };
    secondWorker.emit({
      type: "result",
      requestId: executeMsg.requestId,
      stdout: "fresh",
      stderr: "",
      result: "",
      isError: false,
      executionTimeMs: 5,
      truncated: false,
    });

    const secondResult = await secondExecPromise;
    expect(secondResult.stdout).toBe("fresh");
  });
});

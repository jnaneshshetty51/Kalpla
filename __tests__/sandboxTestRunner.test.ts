import { describe, it, expect, vi, beforeEach } from "vitest";

// lib/sandbox/pyodide.ts is a "use client" module that spins up a real
// browser Worker + WASM Pyodide runtime — it genuinely can't run inside
// vitest's node environment (see __tests__/sandboxExecution.test.ts, which
// covers ITS logic separately by stubbing the Worker global). Here we mock
// the execution boundary itself and test only testRunner.ts's own logic:
// building the harness, and turning executeInSandbox's raw result into a
// TestCaseResult[] (including its failure-path aggregation).
const mockExecuteInSandbox = vi.fn();
vi.mock("@/lib/sandbox/pyodide", () => ({
  executeInSandbox: (code: string, options: unknown) => mockExecuteInSandbox(code, options),
}));

import { runProjectTests, ProjectTestCase } from "@/lib/sandbox/testRunner";

const MARKER = "__KALPLA_TEST_RESULTS__";

function execResult(overrides: Partial<{
  stdout: string;
  stderr: string;
  result: string;
  isError: boolean;
  executionTimeMs: number;
  truncated: boolean;
  timedOut: boolean;
}> = {}) {
  return {
    stdout: "",
    stderr: "",
    result: "",
    isError: false,
    executionTimeMs: 5,
    truncated: false,
    timedOut: false,
    ...overrides,
  };
}

const TWO_CASES: ProjectTestCase[] = [
  { function: "add", input: [1, 2], expected_output: 3 },
  { function: "sub", input: [5, 2], expected_output: 3 },
];

describe("lib/sandbox/testRunner.ts — runProjectTests (harness build + result aggregation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] immediately without invoking the sandbox when there are no test cases", async () => {
    const result = await runProjectTests("def add(a,b): return a+b", []);
    expect(result).toEqual([]);
    expect(mockExecuteInSandbox).not.toHaveBeenCalled();
  });

  it("returns [] immediately when test cases are not provided at all", async () => {
    const result = await runProjectTests("def add(a,b): return a+b", undefined as unknown as ProjectTestCase[]);
    expect(result).toEqual([]);
    expect(mockExecuteInSandbox).not.toHaveBeenCalled();
  });

  it("parses and returns the python-side results verbatim when every test case passes", async () => {
    const pythonResults = [
      { function: "add", input: [1, 2], expected: 3, actual: 3, passed: true, error: null },
      { function: "sub", input: [5, 2], expected: 3, actual: 3, passed: true, error: null },
    ];
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + JSON.stringify(pythonResults) }));

    const result = await runProjectTests("def add(a,b): return a+b\ndef sub(a,b): return a-b", TWO_CASES);
    expect(result).toEqual(pythonResults);
    expect(result.every((r) => r.passed)).toBe(true);
  });

  it("parses and returns results verbatim when every test case fails", async () => {
    const pythonResults = [
      { function: "add", input: [1, 2], expected: 3, actual: 99, passed: false, error: null },
      { function: "sub", input: [5, 2], expected: 3, actual: -1, passed: false, error: null },
    ];
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + JSON.stringify(pythonResults) }));

    const result = await runProjectTests("def add(a,b): return 99\ndef sub(a,b): return -1", TWO_CASES);
    expect(result.every((r) => !r.passed)).toBe(true);
  });

  it("preserves a mixed pass/fail set, including a case that errored/threw during execution", async () => {
    const pythonResults = [
      { function: "add", input: [1, 2], expected: 3, actual: 3, passed: true, error: null },
      { function: "sub", input: [5, 2], expected: 3, actual: null, passed: false, error: "ZeroDivisionError: division by zero" },
    ];
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + JSON.stringify(pythonResults) }));

    const result = await runProjectTests("...", TWO_CASES);
    expect(result[0].passed).toBe(true);
    expect(result[1].passed).toBe(false);
    expect(result[1].error).toContain("ZeroDivisionError");
  });

  it("maps every test case to a timed-out failure when sandbox execution times out", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ timedOut: true }));

    const result = await runProjectTests("while True: pass", TWO_CASES);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.passed === false)).toBe(true);
    expect(result.every((r) => r.error?.includes("timed out"))).toBe(true);
    expect(result.map((r) => r.function)).toEqual(["add", "sub"]);
  });

  it("maps every test case to a failure using stderr text when the results marker is missing (e.g. a syntax error in user code)", async () => {
    mockExecuteInSandbox.mockResolvedValue(
      execResult({ stdout: "", stderr: "SyntaxError: invalid syntax on line 1", isError: true }),
    );

    const result = await runProjectTests("def add(a,b) return a+b", TWO_CASES);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.error === "SyntaxError: invalid syntax on line 1")).toBe(true);
    expect(result.every((r) => r.passed === false)).toBe(true);
  });

  it("falls back to a generic harness-failure message when the marker is missing and stderr is empty", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: "", stderr: "" }));

    const result = await runProjectTests("def add(a,b): return a+b", TWO_CASES);
    expect(result.every((r) => r.error === "Test harness failed to run.")).toBe(true);
  });

  it("falls back to a parse-failure result for every test case when the marker line's JSON is malformed, rather than throwing", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + "{not valid json" }));

    const result = await runProjectTests("def add(a,b): return a+b", TWO_CASES);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.error === "Failed to parse test results.")).toBe(true);
    expect(result.every((r) => r.passed === false)).toBe(true);
  });

  it("embeds the submitted user code verbatim into the executed harness", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + "[]" }));
    await runProjectTests("def add(a, b):\n    return a + b + 999", TWO_CASES);

    const harness = mockExecuteInSandbox.mock.calls[0][0] as string;
    expect(harness).toContain("def add(a, b):\n    return a + b + 999");
  });

  it("passes the given projectId through to executeInSandbox for the chunk-store shim scoping", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + "[]" }));
    await runProjectTests("def add(a,b): return a+b", TWO_CASES, "proj-xyz");

    expect(mockExecuteInSandbox).toHaveBeenCalledWith(expect.any(String), { projectId: "proj-xyz" });
  });

  it("escapes backslashes and triple-quotes in test-case data so the embedded JSON literal round-trips through the Python triple-quoted string", async () => {
    mockExecuteInSandbox.mockResolvedValue(execResult({ stdout: MARKER + "[]" }));

    const tricky: ProjectTestCase[] = [
      { function: "f", input: ["a\\b", 'contains """ triple quotes'], expected_output: "c:\\path\\to\\file" },
    ];
    await runProjectTests("def f(*a): pass", tricky);

    const harness = mockExecuteInSandbox.mock.calls[0][0] as string;
    const match = harness.match(/_test_cases = _json\.loads\("""([\s\S]*?)"""\)\n/);
    expect(match).not.toBeNull();

    // Reverse exactly the two replace() calls testRunner.ts applies:
    // .replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')
    const embedded = match![1];
    const unescaped = embedded.replace(/\\"\\"\\"/g, '"""').replace(/\\\\/g, "\\");
    expect(JSON.parse(unescaped)).toEqual(tricky);
  });
});

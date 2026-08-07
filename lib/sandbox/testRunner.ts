import { executeInSandbox } from "@/lib/sandbox/pyodide";

export interface ProjectTestCase {
  function: string;
  input: unknown[];
  expected_output: unknown;
}

export interface TestCaseResult {
  function: string;
  input: unknown[];
  expected: unknown;
  actual: unknown;
  passed: boolean;
  error: string | null;
}

const RESULTS_MARKER = "__KALPLA_TEST_RESULTS__";

/**
 * Runs a project's predefined test cases (projects.spec.test_cases, Prompt
 * 57) against a user's code inside the Pyodide sandbox, and returns a
 * clear pass/fail list rather than raw stdout. Comparison happens inside
 * Python (so list/dict equality works naturally) using a small numeric
 * tolerance for float results, then the whole result set is shipped back
 * as one JSON line on stdout — avoids any PyProxy marshalling of the
 * return value.
 */
export async function runProjectTests(
  userCode: string,
  testCases: ProjectTestCase[],
  projectId?: string,
): Promise<TestCaseResult[]> {
  if (!testCases || testCases.length === 0) return [];

  const testCasesJson = JSON.stringify(testCases).replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');

  const harness = `
${userCode}

import json as _json

def _kalpla_approx_eq(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(a - b) < 1e-6
    return a == b

_test_cases = _json.loads("""${testCasesJson}""")
_results = []
for _tc in _test_cases:
    _func_name = _tc["function"]
    _args = _tc["input"]
    _expected = _tc["expected_output"]
    try:
        _func = globals().get(_func_name)
        if _func is None:
            raise NameError(f"Function '{_func_name}' is not defined")
        _actual = _func(*_args)
        _passed = _kalpla_approx_eq(_actual, _expected)
        _results.append({
            "function": _func_name, "input": _args, "expected": _expected,
            "actual": _actual, "passed": _passed, "error": None,
        })
    except Exception as _e:
        _results.append({
            "function": _func_name, "input": _args, "expected": _expected,
            "actual": None, "passed": False, "error": str(_e),
        })

print("${RESULTS_MARKER}" + _json.dumps(_results))
`;

  const execResult = await executeInSandbox(harness, { projectId });

  if (execResult.timedOut) {
    return testCases.map((tc) => ({
      function: tc.function,
      input: tc.input,
      expected: tc.expected_output,
      actual: null,
      passed: false,
      error: "Execution timed out before tests could complete.",
    }));
  }

  const markerLine = execResult.stdout
    .split("\n")
    .find((line) => line.startsWith(RESULTS_MARKER));

  if (!markerLine) {
    // The harness itself failed before reaching the marker (e.g. a syntax
    // error in the user's code) — surface it as a single failing result
    // per test case rather than crashing the caller.
    const errorText = execResult.stderr || "Test harness failed to run.";
    return testCases.map((tc) => ({
      function: tc.function,
      input: tc.input,
      expected: tc.expected_output,
      actual: null,
      passed: false,
      error: errorText,
    }));
  }

  try {
    return JSON.parse(markerLine.slice(RESULTS_MARKER.length));
  } catch {
    return testCases.map((tc) => ({
      function: tc.function,
      input: tc.input,
      expected: tc.expected_output,
      actual: null,
      passed: false,
      error: "Failed to parse test results.",
    }));
  }
}

/**
 * Python test harness shared by the in-browser Pyodide runner and the CI verifier, so an exercise
 * behaves identically in both places. Learner code runs once in a fresh namespace; each test then
 * runs against a shallow copy of that namespace. Results are printed as one JSON line.
 */
export interface HarnessTest {
  id: string;
  name: string;
  code: string;
}

export interface HarnessResult {
  setupError?: string;
  results?: { id: string; passed: boolean; message?: string }[];
}

export const HARNESS_MARKER = '__GENPATH_RESULT__';

export function buildHarness(userCode: string, tests: HarnessTest[]): string {
  const payload = JSON.stringify({
    code: userCode,
    tests: tests.map(({ id, code }) => ({ id, code })),
  });
  return `
import json as __gp_json
__gp_payload = __gp_json.loads(${JSON.stringify(payload)})
__gp_ns = {"__name__": "__main__"}
__gp_out = {}
try:
    exec(compile(__gp_payload["code"], "<your code>", "exec"), __gp_ns)
except BaseException as __gp_err:
    __gp_out["setupError"] = f"{type(__gp_err).__name__}: {__gp_err}"
else:
    __gp_results = []
    for __gp_test in __gp_payload["tests"]:
        try:
            exec(compile(__gp_test["code"], "<test " + __gp_test["id"] + ">", "exec"), dict(__gp_ns))
            __gp_results.append({"id": __gp_test["id"], "passed": True})
        except AssertionError as __gp_err:
            __gp_results.append({"id": __gp_test["id"], "passed": False, "message": str(__gp_err) or "Assertion failed"})
        except BaseException as __gp_err:
            __gp_results.append({"id": __gp_test["id"], "passed": False, "message": f"{type(__gp_err).__name__}: {__gp_err}"})
    __gp_out["results"] = __gp_results
print("${HARNESS_MARKER}" + __gp_json.dumps(__gp_out))
`;
}

/** Extracts the harness result from captured stdout. */
export function parseHarnessOutput(stdout: string): HarnessResult | null {
  const line = stdout.split('\n').find((l) => l.startsWith(HARNESS_MARKER));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(HARNESS_MARKER.length)) as HarnessResult;
  } catch {
    return null;
  }
}

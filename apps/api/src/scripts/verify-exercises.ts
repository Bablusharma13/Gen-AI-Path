import { spawnSync } from 'node:child_process';
import { buildHarness, parseHarnessOutput } from '@genpath/shared';
import { loadContent, resolveContentDir } from '../content/loader';

/**
 * Runs every exercise with real CPython, using the same harness as the in-browser runner:
 *  - the reference solution must pass every test;
 *  - the starter code must fail at least one test (otherwise the tests prove nothing).
 * Set PYTHON to choose the interpreter (default: `py -3` on Windows, `python3` elsewhere).
 */
function python(): { cmd: string; args: string[] } {
  if (process.env.PYTHON) return { cmd: process.env.PYTHON, args: [] };
  return process.platform === 'win32' ? { cmd: 'py', args: ['-3'] } : { cmd: 'python3', args: [] };
}

function run(code: string) {
  const { cmd, args } = python();
  // -I: isolated mode (ignores env vars and user site-packages); code is fed on stdin.
  const result = spawnSync(cmd, [...args, '-I', '-'], {
    input: code,
    encoding: 'utf8',
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  return { output: parseHarnessOutput(result.stdout ?? ''), stderr: result.stderr ?? '' };
}

async function main(): Promise<void> {
  const content = await loadContent(resolveContentDir(process.env.CONTENT_DIR));
  let failures = 0;

  for (const exercise of content.exercises) {
    const solution = run(buildHarness(exercise.solution, exercise.tests));
    const failedTests = solution.output?.results?.filter((r) => !r.passed) ?? [];
    if (!solution.output || solution.output.setupError || failedTests.length > 0) {
      failures += 1;
      console.error(`✖ ${exercise.id}: reference solution does not pass`);
      if (solution.output?.setupError) console.error(`    setup: ${solution.output.setupError}`);
      for (const t of failedTests) console.error(`    ${t.id}: ${t.message}`);
      if (!solution.output)
        console.error(`    ${solution.stderr.trim().split('\n').slice(-3).join('\n    ')}`);
      continue;
    }

    const starter = run(buildHarness(exercise.starterCode, exercise.tests));
    const starterFails =
      Boolean(starter.output?.setupError) || (starter.output?.results ?? []).some((r) => !r.passed);
    if (!starterFails) {
      failures += 1;
      console.error(`✖ ${exercise.id}: starter code already passes every test`);
      continue;
    }
    console.log(`✔ ${exercise.id} (${exercise.tests.length} tests)`);
  }

  // Python code examples that declare an expected output must actually produce it.
  let examples = 0;
  for (const lesson of content.lessons) {
    for (const example of lesson.codeExamples) {
      if (!example.variants.python || example.expectedOutput === undefined) continue;
      examples += 1;
      const { cmd, args } = python();
      const result = spawnSync(cmd, [...args, '-I', '-'], {
        input: example.variants.python,
        encoding: 'utf8',
        timeout: 15_000,
      });
      const actual = (result.stdout ?? '').replace(/\r\n/g, '\n').trim();
      const expected = example.expectedOutput.replace(/\r\n/g, '\n').trim();
      if (result.status !== 0 || actual !== expected) {
        failures += 1;
        console.error(`✖ ${lesson.id}/${example.id}: output differs from expectedOutput`);
        console.error(`    expected:\n${expected.replace(/^/gm, '      ')}`);
        console.error(`    actual:\n${(actual || result.stderr.trim()).replace(/^/gm, '      ')}`);
      } else {
        console.log(`✔ ${lesson.id}/${example.id} output matches`);
      }
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed verification`);
    process.exit(1);
  }
  console.log(
    `\nAll ${content.exercises.length} exercises and ${examples} code examples verified with real Python.`,
  );
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

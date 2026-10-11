'use client';

import {
  buildHarness,
  parseHarnessOutput,
  type HarnessResult,
  type HintDto,
} from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Eye,
  FlaskConical,
  Lightbulb,
  Play,
  RefreshCw,
  RotateCcw,
  Terminal,
  XCircle,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { usePython, type RunResult } from '@/features/practice/use-python';
import { api, ApiError, errorMessage } from '@/lib/api';
import { pickList, tx } from '@/lib/localize';
import { useHint } from '@/lib/mentor';
import { useLearnerLanguages } from '@/lib/use-learner';

const CodeEditor = dynamic(
  () => import('@/features/practice/code-editor').then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-80" />,
  },
);

interface ExerciseDto {
  id: string;
  lessonId: string;
  title: { en: string; hinglish: string; hi?: string };
  prompt: { en: string; hinglish: string; hi?: string };
  starterCode: string;
  tests: { id: string; name: string; code: string }[];
  hints: { en: string[]; hinglish: string[]; hi?: string[] };
  attempts: { count: number; passed: boolean };
  solutionAvailable: boolean;
}

const draftKey = (id: string) => `genpath:draft:${id}`;

function readDraft(id: string): string | null {
  try {
    return window.localStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}

function writeDraft(id: string, code: string): void {
  try {
    window.localStorage.setItem(draftKey(id), code);
  } catch {
    // Storage can be unavailable (private mode); drafts are a convenience only.
  }
}

function Output({ run }: { run: RunResult }) {
  if (run.timedOut) {
    return (
      <Alert tone="error" title="Stopped: took too long">
        The code ran longer than the time limit (an infinite loop?). Python was restarted.
      </Alert>
    );
  }
  return (
    <div className="space-y-2">
      {run.stdout ? (
        <pre className="max-h-60 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-xs">
          {run.stdout}
        </pre>
      ) : null}
      {run.stderr || run.error ? (
        <pre className="max-h-60 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs">
          {[run.stderr, run.error].filter(Boolean).join('\n')}
        </pre>
      ) : null}
      {!run.stdout && !run.stderr && !run.error ? (
        <p className="text-xs text-muted-foreground">(no output)</p>
      ) : null}
      {run.truncated ? (
        <p className="text-xs text-muted-foreground">Output truncated at 20,000 characters.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">Ran in {run.durationMs} ms in your browser.</p>
    </div>
  );
}

export function PracticeRunner({ exerciseId }: { exerciseId: string }) {
  const exercise = useQuery({
    queryKey: ['exercise', exerciseId],
    queryFn: () => api<ExerciseDto>(`/exercises/${encodeURIComponent(exerciseId)}`),
  });
  if (exercise.isPending) return <Skeleton className="h-96" />;
  if (exercise.isError) {
    const notFound = exercise.error instanceof ApiError && exercise.error.status === 404;
    return (
      <ErrorState
        title={notFound ? 'Exercise not found' : 'Could not load exercise'}
        onRetry={notFound ? undefined : () => void exercise.refetch()}
      />
    );
  }
  return <PracticeWorkspace key={exercise.data.id} e={exercise.data} />;
}

function PracticeWorkspace({ e }: { e: ExerciseDto }) {
  const exerciseId = e.id;
  const { lang } = useLearnerLanguages();
  const qc = useQueryClient();
  const python = usePython();
  // Restore an unsaved draft once, when the workspace mounts.
  const [current, setCode] = useState(() => readDraft(e.id) ?? e.starterCode);
  const [hintsShown, setHintsShown] = useState(0);
  const [plainRun, setPlainRun] = useState<RunResult | null>(null);
  const [testRun, setTestRun] = useState<{ raw: RunResult; harness: HarnessResult | null } | null>(
    null,
  );
  const [solution, setSolution] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiHints, setAiHints] = useState<HintDto[]>([]);
  const aiHint = useHint();

  const record = useMutation({
    mutationFn: (input: {
      passed: boolean;
      testsPassed: number;
      testsTotal: number;
      hintsUsed: number;
    }) =>
      api<{ xpAwarded: number; solutionAvailable: boolean }>(
        `/exercises/${encodeURIComponent(exerciseId)}/attempts`,
        {
          method: 'POST',
          body: input,
        },
      ),
    onSuccess: async (r, input) => {
      if (input.passed)
        toast.success(r.xpAwarded ? `All tests pass! +${r.xpAwarded} XP` : 'All tests pass!');
      await qc.invalidateQueries({ queryKey: ['exercise', exerciseId] });
      await qc.invalidateQueries({ queryKey: ['lesson'] });
    },
    onError: (err) => toast.error(`Result not saved: ${errorMessage(err)}`),
  });

  useEffect(() => {
    writeDraft(e.id, current);
  }, [e.id, current]);

  const hints = pickList(e.hints, lang).value;

  const runPlain = async () => {
    setBusy(true);
    setTestRun(null);
    setPlainRun(await python.run(current));
    setBusy(false);
  };

  const runTests = async () => {
    setBusy(true);
    setPlainRun(null);
    const raw = await python.run(buildHarness(current, e.tests));
    const harness = raw.timedOut ? null : parseHarnessOutput(raw.stdout);
    setTestRun({ raw, harness });
    setBusy(false);
    const results = harness?.results ?? [];
    const testsPassed = results.filter((r) => r.passed).length;
    record.mutate({
      passed: Boolean(harness && !harness.setupError && testsPassed === e.tests.length),
      testsPassed,
      testsTotal: e.tests.length,
      hintsUsed: hintsShown,
    });
  };

  const showSolution = async () => {
    try {
      const r = await api<{ solution: string }>(`/exercises/${encodeURIComponent(e.id)}/solution`);
      setSolution(r.solution);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const passedCount = testRun?.harness?.results?.filter((r) => r.passed).length ?? 0;
  const loading =
    python.status === 'loading' || (busy && python.status === 'running' && !plainRun && !testRun);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to lesson
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">{tx(e.title, lang)}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Python · runs in your browser</Badge>
          <Badge variant="outline">
            {e.attempts.count} attempt{e.attempts.count === 1 ? '' : 's'}
          </Badge>
          {e.attempts.passed ? <Badge variant="success">Passed</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <Markdown>{tx(e.prompt, lang)}</Markdown>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="size-4 text-warning" aria-hidden /> Hints
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hints.slice(0, hintsShown).map((h, i) => (
                <div key={i} className="rounded-md bg-muted/50 p-3 text-sm">
                  <Markdown className="[&_p]:m-0">{h}</Markdown>
                </div>
              ))}
              {hintsShown < hints.length ? (
                <Button variant="outline" size="sm" onClick={() => setHintsShown((n) => n + 1)}>
                  Show hint {hintsShown + 1} of {hints.length}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">No more lesson hints.</p>
              )}
              <div className="space-y-2 border-t pt-3">
                {aiHints.map((h, i) => (
                  <div
                    key={i}
                    className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <Bot className="size-3.5" aria-hidden />
                      {h.source === 'ai' ? 'AI mentor hint' : 'Lesson hint (AI unavailable)'} ·{' '}
                      {h.concept}
                      {h.isMock ? <Badge variant="warning">Mock AI</Badge> : null}
                    </p>
                    <Markdown className="[&_p]:m-0">{h.hint}</Markdown>
                    <p className="text-xs">
                      <span className="font-medium">Next step: </span>
                      {h.nextStep}
                    </p>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={aiHint.isPending}
                  onClick={() =>
                    aiHint.mutate(
                      {
                        exerciseId: e.id,
                        code: current,
                        failures: (testRun?.harness?.results ?? [])
                          .filter((r) => !r.passed)
                          .map((r) => `${r.id}: ${r.message ?? 'failed'}`)
                          .concat(
                            testRun?.harness?.setupError
                              ? [`setup: ${testRun.harness.setupError}`]
                              : [],
                          ),
                        hintsSoFar: aiHints.length,
                      },
                      {
                        onSuccess: (h) => setAiHints((prev) => [...prev, h]),
                        onError: (err) => toast.error(errorMessage(err)),
                      },
                    )
                  }
                >
                  {aiHint.isPending ? <Spinner /> : <Bot aria-hidden />} Ask the mentor for a hint
                </Button>
                <p className="text-xs text-muted-foreground">
                  The mentor sees your code and failing tests, and gives a hint — not the answer.
                </p>
              </div>
            </CardContent>
          </Card>

          <details className="rounded-xl border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">
              The tests your code must pass ({e.tests.length})
            </summary>
            <ul className="space-y-3 border-t p-5">
              {e.tests.map((t) => (
                <li key={t.id}>
                  <p className="text-xs font-medium">{t.name}</p>
                  <Markdown className="text-xs">{`\`\`\`python\n${t.code.trimEnd()}\n\`\`\``}</Markdown>
                </li>
              ))}
            </ul>
          </details>

          {e.solutionAvailable || solution ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reference solution</CardTitle>
              </CardHeader>
              <CardContent>
                {solution ? (
                  <Markdown>{`\`\`\`python\n${solution.trimEnd()}\n\`\`\``}</Markdown>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void showSolution()}>
                    <Eye aria-hidden /> Show solution
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <p className="text-xs text-muted-foreground">
              The reference solution unlocks after you pass the tests or make three attempts.
            </p>
          )}
        </div>

        <div className="space-y-4">
          <CodeEditor value={current} onChange={setCode} label="Your Python code" />
          <p className="text-xs text-muted-foreground">
            Keyboard: press Esc, then Tab, to move focus out of the editor.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runTests()} disabled={busy}>
              {busy ? <Spinner /> : <FlaskConical aria-hidden />} Run tests
            </Button>
            <Button variant="outline" onClick={() => void runPlain()} disabled={busy}>
              <Play aria-hidden /> Run
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCode(e.starterCode);
                setPlainRun(null);
                setTestRun(null);
              }}
            >
              <RotateCcw aria-hidden /> Reset code
            </Button>
            <Button variant="ghost" onClick={() => python.restart()} disabled={busy}>
              <RefreshCw aria-hidden /> Restart Python
            </Button>
          </div>

          {loading ? (
            <Alert tone="info" title="Loading Python…">
              The first run downloads Python for WebAssembly (~10 MB) and caches it in your browser.
            </Alert>
          ) : null}
          {python.loadError ? (
            <Alert tone="error" title="Python could not start">
              {python.loadError}
            </Alert>
          ) : null}

          {testRun ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  {testRun.harness && passedCount === e.tests.length ? (
                    <CheckCircle2 className="size-5 text-success" aria-hidden />
                  ) : (
                    <XCircle className="size-5 text-destructive" aria-hidden />
                  )}
                  {testRun.raw.timedOut
                    ? 'Stopped: took too long'
                    : testRun.harness?.setupError
                      ? 'Your code raised an error before the tests ran'
                      : `${passedCount} of ${e.tests.length} tests passed`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {testRun.harness?.setupError ? (
                  <pre className="overflow-auto rounded-md bg-destructive/5 p-3 font-mono text-xs">
                    {testRun.harness.setupError}
                  </pre>
                ) : null}
                <ul className="space-y-1.5">
                  {(testRun.harness?.results ?? []).map((r) => {
                    const test = e.tests.find((t) => t.id === r.id);
                    return (
                      <li key={r.id} className="flex items-start gap-2 text-sm">
                        {r.passed ? (
                          <CheckCircle2
                            className="mt-0.5 size-4 shrink-0 text-success"
                            aria-label="Passed"
                          />
                        ) : (
                          <XCircle
                            className="mt-0.5 size-4 shrink-0 text-destructive"
                            aria-label="Failed"
                          />
                        )}
                        <span>
                          {test?.name ?? r.id}
                          {!r.passed && r.message ? (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {r.message}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {testRun.raw.timedOut ? <Output run={testRun.raw} /> : null}
                <p className="text-xs text-muted-foreground">
                  Tests ran in your browser; the result is saved to your progress as self-reported
                  practice, not a graded score.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {plainRun ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Terminal className="size-4" aria-hidden /> Output
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Output run={plainRun} />
              </CardContent>
            </Card>
          ) : null}

          <Link href="/labs" className="block text-xs text-muted-foreground hover:text-foreground">
            Python runs locally via Pyodide (WebAssembly). Your code never runs on GenPath servers.
          </Link>
        </div>
      </div>
    </div>
  );
}

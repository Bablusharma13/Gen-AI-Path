'use client';

import {
  projectSubmissionSchema,
  SKILL_LEVEL_LABELS,
  TRACK_LABELS,
  type LocalizedList,
  type LocalizedText,
  type ProjectDetailDto,
} from '@genpath/shared';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  FileCode2,
  Flag,
  ListChecks,
  MessageSquareText,
  Rocket,
  Send,
  ShieldCheck,
  Target,
  TestTube2,
} from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { TextField } from '@/components/forms';
import { Markdown } from '@/components/markdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Progress, Skeleton, Spinner } from '@/components/ui/feedback';
import { Label, Textarea } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { pickList, pickText, tx } from '@/lib/localize';
import { useProject, useSubmitProject, useToggleMilestone } from '@/lib/projects';
import { useLearnerLanguages } from '@/lib/use-learner';
import { formatRelative } from '@/lib/utils';
import { PROJECT_STATUS } from '../project-list';

function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof Flag;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-3">
      <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold">
        <Icon className="size-5 text-primary" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function LocalList({ list, ordered = false }: { list: LocalizedList; ordered?: boolean }) {
  const { lang } = useLearnerLanguages();
  const items = pickList(list, lang).value;
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag className={ordered ? 'list-decimal space-y-1.5 pl-5' : 'list-disc space-y-1.5 pl-5'}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  );
}

function LocalMarkdown({ text }: { text: LocalizedText }) {
  const { lang } = useLearnerLanguages();
  return <Markdown>{pickText(text, lang).value}</Markdown>;
}

function Milestones({ project }: { project: ProjectDetailDto }) {
  const { lang } = useLearnerLanguages();
  const toggle = useToggleMilestone(project.id);
  // The box flips in the same click (local state), not after the cache update lands — on a slow
  // device the controlled checkbox would otherwise snap back for a moment.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const isDone = (m: ProjectDetailDto['milestones'][number]) =>
    ticked[m.id] ?? Boolean(m.completedAt);
  const done = project.milestones.filter(isDone).length;

  const onToggle = (milestoneId: string, completed: boolean) => {
    setTicked((t) => ({ ...t, [milestoneId]: completed }));
    toggle.mutate(
      { milestoneId, completed },
      {
        onSuccess: (r) => {
          if (r.xpAwarded > 0) toast.success(`Milestone done · +${r.xpAwarded} XP`);
        },
        onError: (err) => toast.error(errorMessage(err)),
        // Hand control back to the server data (rolled back on error, confirmed on success).
        onSettled: () =>
          setTicked((t) => {
            const next = { ...t };
            delete next[milestoneId];
            return next;
          }),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" aria-hidden /> Milestones
        </CardTitle>
        <CardDescription>
          {done} of {project.milestones.length} done. Tick a milestone when its checklist is true in
          your repository.
        </CardDescription>
        <Progress value={(done / project.milestones.length) * 100} label="Milestone progress" />
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {project.milestones.map((m, i) => {
            const checked = isDone(m);
            const pending = toggle.isPending && toggle.variables?.milestoneId === m.id;
            return (
              <li key={m.id} className="space-y-2">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={checked}
                    disabled={pending}
                    onChange={(e) => onToggle(m.id, e.target.checked)}
                  />
                  <span>
                    <span className="block font-medium">
                      {i + 1}. {tx(m.title, lang)}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {tx(m.description, lang)}
                    </span>
                  </span>
                </label>
                <ul
                  className="ml-7 space-y-1 text-sm"
                  aria-label={`Checklist for ${tx(m.title, lang)}`}
                >
                  {pickList(m.checklist, lang).value.map((c) => (
                    <li key={c} className="flex items-start gap-2">
                      {checked ? (
                        <CheckCircle2
                          className="mt-0.5 size-3.5 shrink-0 text-success"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      {c}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function SubmitForm({ project }: { project: ProjectDetailDto }) {
  const { lang } = useLearnerLanguages();
  const submit = useSubmitProject(project.id);
  const [repoUrl, setRepoUrl] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [selfAssessed, setSelfAssessed] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = projectSubmissionSchema.safeParse({
      repoUrl: repoUrl.trim(),
      ...(demoUrl.trim() ? { demoUrl: demoUrl.trim() } : {}),
      notes,
      checklist: project.rubric.map((r) => ({
        criterionId: r.id,
        selfAssessed: Boolean(selfAssessed[r.id]),
      })),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    submit.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Submitted for review');
        setRepoUrl('');
        setDemoUrl('');
        setNotes('');
        setSelfAssessed({});
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="size-4 text-primary" aria-hidden /> Submit your project
        </CardTitle>
        <CardDescription>
          Share a public repository. An instructor reviews it against the rubric — nothing here is
          graded automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextField
            label="Repository URL"
            type="url"
            placeholder="https://github.com/you/project"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            error={errors.repoUrl}
            required
          />
          <TextField
            label="Demo URL (optional)"
            type="url"
            placeholder="https://…"
            value={demoUrl}
            onChange={(e) => setDemoUrl(e.target.value)}
            error={errors.demoUrl}
          />
          <div className="space-y-1.5">
            <Label htmlFor="submission-notes">Notes for the reviewer</Label>
            <Textarea
              id="submission-notes"
              maxLength={4000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What you built, trade-offs you made, what you would improve next"
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Self-assessment — which criteria do you think you meet?
            </legend>
            {project.rubric.map((r) => (
              <label key={r.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={Boolean(selfAssessed[r.id])}
                  onChange={(e) => setSelfAssessed((s) => ({ ...s, [r.id]: e.target.checked }))}
                />
                <span>
                  {tx(r.criterion, lang)}{' '}
                  <span className="text-muted-foreground">({r.points} pts)</span>
                </span>
              </label>
            ))}
          </fieldset>
          {submit.isError ? (
            <Alert tone="error" title="Submission failed">
              {submit.error instanceof ApiError && submit.error.status === 429
                ? 'Too many submissions in a short time. Try again later.'
                : errorMessage(submit.error)}
            </Alert>
          ) : null}
          <Button type="submit" disabled={submit.isPending}>
            {submit.isPending ? <Spinner label="Submitting" /> : <Send aria-hidden />} Submit for
            review
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Submissions({ project }: { project: ProjectDetailDto }) {
  if (project.submissions.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="size-4 text-primary" aria-hidden /> Your submissions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {project.submissions.map((s) => (
            <li key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={s.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="break-all font-medium text-primary hover:underline"
                >
                  {s.repoUrl}
                </a>
                <Badge variant={s.status === 'reviewed' ? 'success' : 'warning'}>
                  {s.status === 'reviewed' ? 'Reviewed' : 'Awaiting review'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Submitted {formatRelative(s.createdAt)}
              </p>
              {s.feedback ? (
                <div className="rounded-md bg-muted/60 p-3">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Feedback{s.reviewerName ? ` from ${s.reviewerName}` : ''}
                  </p>
                  {/* Reviewer feedback is plain text: never rendered as HTML or Markdown. */}
                  <p className="whitespace-pre-wrap">{s.feedback}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ProjectView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const { lang } = useLearnerLanguages();

  if (project.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (project.isError) {
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return (
      <ErrorState
        title={missing ? 'Project not found' : 'Could not load project'}
        message={missing ? 'It may have been removed or renamed.' : errorMessage(project.error)}
        onRetry={missing ? undefined : () => void project.refetch()}
      />
    );
  }

  const p = project.data;
  const status = PROJECT_STATUS[p.status];
  const totalPoints = p.rubric.reduce((sum, r) => sum + r.points, 0);

  return (
    <div className="space-y-6">
      <Link
        href="/projects"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All projects
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{SKILL_LEVEL_LABELS[p.level]}</Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-4" aria-hidden /> ~{p.estimatedHours} hours
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{tx(p.title, lang)}</h1>
        <p className="max-w-3xl text-muted-foreground">{tx(p.summary, lang)}</p>
        <p className="text-sm text-muted-foreground">
          Tracks: {p.tracks.map((t) => TRACK_LABELS[t]).join(' · ')} · Stack:{' '}
          {p.techStack.join(', ')}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-8">
          <Section id="problem" title="Problem" icon={Target}>
            <LocalMarkdown text={p.problemStatement} />
          </Section>
          {p.lessons.length > 0 ? (
            <Section id="prepare" title="Prepare with these lessons" icon={BookOpen}>
              <ul className="space-y-1.5">
                {p.lessons.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    {l.completed ? (
                      <CheckCircle2 className="size-4 text-success" aria-label="Completed" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" aria-label="Not completed" />
                    )}
                    <Link href={`/courses/${l.courseSlug}/${l.slug}`} className="hover:underline">
                      {tx(l.title, lang)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section id="requirements" title="Requirements" icon={ListChecks}>
            <LocalList list={p.requirements} />
          </Section>
          <Section id="acceptance" title="Acceptance criteria" icon={Flag}>
            <LocalList list={p.acceptanceCriteria} />
          </Section>
          <Section id="architecture" title="Architecture" icon={FileCode2}>
            <LocalMarkdown text={p.architecture} />
          </Section>
          <Section id="data-model" title="Data model" icon={FileCode2}>
            <LocalMarkdown text={p.dataModel} />
          </Section>
          {p.apiDesign ? (
            <Section id="api" title="API design" icon={FileCode2}>
              <LocalMarkdown text={p.apiDesign} />
            </Section>
          ) : null}
          <Section id="tests" title="Test requirements" icon={TestTube2}>
            <LocalList list={p.testRequirements} />
          </Section>
          <Section id="security" title="Security checklist" icon={ShieldCheck}>
            <LocalList list={p.securityChecklist} />
          </Section>
          <Section id="deployment" title="Deployment" icon={Rocket}>
            <LocalMarkdown text={p.deployment} />
          </Section>
          <Section id="readme" title="README must include" icon={BookOpen}>
            <LocalList list={p.readmeRequirements} />
          </Section>
          <Section id="rubric" title={`Rubric (${totalPoints} points)`} icon={CheckCircle2}>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">
                      Criterion
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Points
                    </th>
                    <th scope="col" className="px-3 py-2 font-medium">
                      What excellent looks like
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {p.rubric.map((r) => (
                    <tr key={r.id}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {tx(r.criterion, lang)}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">{r.points}</td>
                      <td className="px-3 py-2 text-muted-foreground">{tx(r.excellent, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>

        <aside
          className="space-y-4 lg:sticky lg:top-20 lg:self-start"
          aria-label="Project progress"
        >
          <Milestones project={p} />
          <SubmitForm project={p} />
          <Submissions project={p} />
        </aside>
      </div>
    </div>
  );
}

import {
  ArrowRight,
  Binary,
  Bot,
  BrainCircuit,
  FlaskConical,
  Gauge,
  Hammer,
  Lightbulb,
  Rocket,
  SearchCode,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

const LOOP = [
  {
    icon: Lightbulb,
    title: 'Learn',
    text: 'Short Hinglish explanations with English technical terms and real-world analogies.',
  },
  {
    icon: Waypoints,
    title: 'Visualize',
    text: 'See tokens, embeddings, attention and RAG pipelines step by step.',
  },
  {
    icon: FlaskConical,
    title: 'Experiment',
    text: 'Change chunk sizes, temperatures and vectors. Watch what actually happens.',
  },
  {
    icon: SearchCode,
    title: 'Implement',
    text: 'Write real Python in an in-browser sandbox with test cases.',
  },
  {
    icon: Gauge,
    title: 'Evaluate',
    text: 'Measure retrieval quality, groundedness and cost — not vibes.',
  },
  {
    icon: Hammer,
    title: 'Build',
    text: 'Guided projects with acceptance criteria, from CLI tools to RAG apps.',
  },
  {
    icon: Rocket,
    title: 'Get job-ready',
    text: 'Interview questions, architecture practice and a portfolio you can explain.',
  },
];

const LEVELS = [
  'Python for AI',
  'AI, ML and vectors',
  'Neural network basics',
  'Tokens, transformers and attention',
  'Prompt engineering',
  'LLM API integration',
  'Embeddings, vector search and RAG',
  'Tool calling and agents',
  'Evaluation and production',
];

const TRACKS = [
  {
    code: 'A',
    title: 'GenAI Application Engineer',
    text: 'LLM APIs, RAG, structured outputs, evaluation, deployment.',
  },
  {
    code: 'B',
    title: 'AI Agent Engineer',
    text: 'Tool calling, state, memory, human approvals, reliability.',
  },
  {
    code: 'C',
    title: 'ML/LLM Engineer',
    text: 'PyTorch, transformers, datasets, fine-tuning, inference.',
  },
  {
    code: 'D',
    title: 'AI Platform / MLOps',
    text: 'Serving, monitoring, pipelines, scalable inference.',
  },
  {
    code: 'E',
    title: 'Research Foundations',
    text: 'Math, papers, experiment design, reproducibility.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Start learning</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-primary)_14%,transparent),transparent)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" aria-hidden />
              Hinglish-first · English technical terms · Python & TypeScript
            </p>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              From Zero to Generative AI Engineer
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted-foreground text-pretty">
              Learn how AI systems actually work, experiment with the mechanisms, write real code,
              and build reliable applications. No memorizing buzzwords.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/register">
                  Create your free roadmap <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">I already have an account</Link>
              </Button>
            </div>
          </div>
        </section>

        <section aria-labelledby="loop-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="loop-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            One loop, repeated until you are job-ready
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {LOOP.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-xl border bg-card p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="levels-heading" className="border-y bg-muted/40">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 id="levels-heading" className="text-2xl font-semibold tracking-tight sm:text-3xl">
                A curriculum with prerequisites, not a playlist
              </h2>
              <p className="mt-3 text-muted-foreground">
                Every lesson has objectives, an analogy, a visual or lab, working code, a guided
                exercise, a quiz and common mistakes. Already a developer? Skip what you know.
              </p>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {LEVELS.map((level) => (
                  <li key={level} className="flex items-center gap-2 text-sm">
                    <Binary className="size-4 text-primary" aria-hidden />
                    {level}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Pick a career track
              </h2>
              <ul className="mt-6 space-y-3">
                {TRACKS.map((track) => (
                  <li key={track.code} className="flex gap-3 rounded-lg border bg-card p-4">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                      {track.code}
                    </span>
                    <div>
                      <p className="font-medium">{track.title}</p>
                      <p className="text-sm text-muted-foreground">{track.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="mentor-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-6">
              <Bot className="size-6 text-primary" aria-hidden />
              <h2 id="mentor-heading" className="mt-3 font-semibold">
                An AI mentor that knows your progress
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Hints before solutions, explanations in your language, code in your programming
                language. Works with OpenAI-compatible APIs, Anthropic, Gemini or a free local
                model.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <BrainCircuit className="size-6 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">Labs that show the mechanism</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Real tokenizers, real cosine similarity, real attention math. Every simplification
                is labelled — we never pass off a toy as a production model.
              </p>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <ShieldCheck className="size-6 text-primary" aria-hidden />
              <h2 className="mt-3 font-semibold">Honest by design</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                No fake scores, no fake training runs, no job guarantees. Your progress is private
                unless you choose to share it.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} GenPath AI</p>
          <Link href="/status" className="hover:text-foreground">
            System status
          </Link>
        </div>
      </footer>
    </div>
  );
}

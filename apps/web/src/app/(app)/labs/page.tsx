import { LAB_IDS } from '@genpath/shared';
import { FlaskConical, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { LAB_META } from '@/features/labs/meta';

export const metadata: Metadata = { title: 'Interactive labs' };

export default function LabsPage() {
  return (
    <>
      <PageHeader
        title="Interactive labs"
        description="See the mechanisms behind GenAI. Everything is computed live and deterministically in your browser — and every simplification is labelled."
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_IDS.map((id) => {
          const meta = LAB_META[id];
          return (
            <li key={id}>
              <Card className="relative h-full transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <FlaskConical className="size-5" aria-hidden />
                  </span>
                  <h2 className="font-semibold">
                    <Link
                      href={`/labs/${id}`}
                      className="after:absolute after:inset-0 after:content-['']"
                    >
                      {meta.title}
                    </Link>
                  </h2>
                  <p className="flex-1 text-sm text-muted-foreground">{meta.summary}</p>
                  <p className="flex gap-1.5 text-xs text-muted-foreground">
                    <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-3">{meta.honesty}</span>
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}

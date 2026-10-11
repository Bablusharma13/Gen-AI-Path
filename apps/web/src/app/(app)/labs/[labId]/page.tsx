import { LAB_IDS, type LabId } from '@genpath/shared';
import { ArrowLeft, Info } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { LAB_META } from '@/features/labs/meta';
import { LabPageClient } from './lab-page-client';

const isLabId = (id: string): id is LabId => (LAB_IDS as readonly string[]).includes(id);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ labId: string }>;
}): Promise<Metadata> {
  const { labId } = await params;
  return { title: isLabId(labId) ? LAB_META[labId].title : 'Lab' };
}

export default async function LabPage({ params }: { params: Promise<{ labId: string }> }) {
  const { labId } = await params;
  if (!isLabId(labId)) notFound();
  const meta = LAB_META[labId];
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/labs"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> All labs
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{meta.title}</h1>
        <p className="max-w-3xl text-muted-foreground">{meta.summary}</p>
      </div>
      <Card className="border-info/30 bg-info/5">
        <CardContent className="flex gap-2 p-4 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>
            <span className="font-medium">What is real here: </span>
            {meta.honesty}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 sm:p-6">
          <LabPageClient id={labId} />
        </CardContent>
      </Card>
    </div>
  );
}

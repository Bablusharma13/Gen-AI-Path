import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { RoadmapView } from './roadmap-view';

export const metadata: Metadata = { title: 'Learning path' };

export default function PathPage() {
  return (
    <>
      <PageHeader
        title="Your learning path"
        description="Built from your goal, experience and progress with transparent rules. Every recommendation says why — and you can change it."
      />
      <Suspense>
        <RoadmapView />
      </Suspense>
    </>
  );
}

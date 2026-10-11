import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { MentorView } from './mentor-view';

export const metadata: Metadata = { title: 'AI Mentor' };

export default function MentorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[70vh]" />}>
      <MentorView />
    </Suspense>
  );
}

'use client';

import type { LabId } from '@genpath/shared';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/feedback';

const LabRenderer = dynamic(
  () => import('@/features/labs/lab-renderer').then((m) => m.LabRenderer),
  {
    ssr: false,
    loading: () => <Skeleton className="h-96" />,
  },
);

export function LabPageClient({ id }: { id: LabId }) {
  return <LabRenderer id={id} config={{}} />;
}

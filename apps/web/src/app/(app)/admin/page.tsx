import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/feedback';
import { AdminView } from './admin-view';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminPage() {
  return (
    <>
      <PageHeader
        title="Admin"
        description="Platform health, people, AI usage and cost, project reviews and the audit trail."
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <AdminView />
      </Suspense>
    </>
  );
}

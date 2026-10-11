'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMe } from '@/lib/auth';
import { AuditPanel } from './audit-panel';
import { OverviewPanel } from './overview-panel';
import { ReviewPanel } from './review-panel';
import { UsagePanel } from './usage-panel';
import { UsersPanel } from './users-panel';

const PLATFORM_TABS = ['overview', 'users', 'ai', 'reviews', 'audit'] as const;
type Tab = (typeof PLATFORM_TABS)[number];

/**
 * Admin UI. The tabs shown follow the role, but every endpoint enforces its own permission —
 * hiding a tab is a convenience, not the security boundary.
 */
export function AdminView() {
  const me = useMe();
  const params = useSearchParams();
  const router = useRouter();

  if (me.isPending) return <Skeleton className="h-96" />;
  const role = me.data?.role;

  if (role === 'instructor') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          As an instructor you review project submissions. Organization knowledge bases are managed
          on the{' '}
          <Link href="/knowledge" className="text-primary hover:underline">
            Knowledge Base
          </Link>{' '}
          page.
        </p>
        <ReviewPanel />
      </div>
    );
  }
  if (role === 'org_admin') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Organization tools live on the Knowledge Base page"
        description="Create organizations, add members, upload documents and check retrieval there."
        action={
          <Button asChild>
            <Link href="/knowledge">Open Knowledge Base</Link>
          </Button>
        }
      />
    );
  }
  if (role !== 'platform_admin' || !me.data) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Administrators only"
        description="Your account does not have access to this area."
      />
    );
  }

  const requested = params.get('tab');
  const tab: Tab = PLATFORM_TABS.includes(requested as Tab) ? (requested as Tab) : 'overview';
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(`/admin?tab=${value}`, { scroll: false })}
    >
      <div className="overflow-x-auto pb-1">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="ai">AI usage</TabsTrigger>
          <TabsTrigger value="reviews">Project reviews</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="overview">
        <OverviewPanel />
      </TabsContent>
      <TabsContent value="users">
        <UsersPanel currentUserId={me.data.id} />
      </TabsContent>
      <TabsContent value="ai">
        <UsagePanel />
      </TabsContent>
      <TabsContent value="reviews">
        <ReviewPanel />
      </TabsContent>
      <TabsContent value="audit">
        <AuditPanel />
      </TabsContent>
    </Tabs>
  );
}

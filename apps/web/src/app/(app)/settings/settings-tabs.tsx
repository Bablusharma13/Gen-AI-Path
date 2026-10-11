'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProfile } from '@/lib/auth';
import { AppearanceSettings } from './appearance-settings';
import { LearningSettings } from './learning-settings';
import { PrivacySettings } from './privacy-settings';
import { ProfileSettings } from './profile-settings';
import { SecuritySettings } from './security-settings';

const TABS = ['learning', 'appearance', 'profile', 'privacy', 'security'] as const;
type Tab = (typeof TABS)[number];

export function SettingsTabs() {
  const params = useSearchParams();
  const router = useRouter();
  const profile = useProfile();
  const requested = params.get('tab');
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'learning';

  if (profile.isPending) return <Skeleton className="h-96" />;
  if (profile.isError)
    return <ErrorState message="Could not load settings" onRetry={() => void profile.refetch()} />;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => router.replace(`/settings?tab=${value}`, { scroll: false })}
    >
      <div className="overflow-x-auto pb-1">
        <TabsList>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="privacy">AI & Privacy</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="learning">
        <LearningSettings profile={profile.data} />
      </TabsContent>
      <TabsContent value="appearance">
        <AppearanceSettings profile={profile.data} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileSettings profile={profile.data} />
      </TabsContent>
      <TabsContent value="privacy">
        <PrivacySettings profile={profile.data} />
      </TabsContent>
      <TabsContent value="security">
        <SecuritySettings />
      </TabsContent>
    </Tabs>
  );
}

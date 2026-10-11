import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { SettingsTabs } from './settings-tabs';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Every preference is independent — changing your explanation language never changes your programming language."
      />
      <Suspense>
        <SettingsTabs />
      </Suspense>
    </>
  );
}

import type { Metadata } from 'next';
import { Logo } from '@/components/brand';
import { SystemStatus } from './system-status';

export const metadata: Metadata = { title: 'System status' };

export default function StatusPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Logo />
      <h1 className="mt-8 text-2xl font-semibold tracking-tight">System status</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Live readiness checks from the GenPath API. Values are measured on each refresh.
      </p>
      <div className="mt-6">
        <SystemStatus />
      </div>
    </main>
  );
}

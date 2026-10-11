import type { Metadata } from 'next';
import { PracticeRunner } from './practice-runner';

export const metadata: Metadata = { title: 'Practice' };

export default async function PracticePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;
  return <PracticeRunner exerciseId={exerciseId} />;
}

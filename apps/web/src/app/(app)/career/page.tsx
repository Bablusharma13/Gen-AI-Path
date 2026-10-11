import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { CareerView } from './career-view';

export const metadata: Metadata = { title: 'Career Center' };

export default function CareerPage() {
  return (
    <>
      <PageHeader
        title="Career Center"
        description="See what you have actually done towards your goal, and practise interview questions with key points and model answers."
      />
      <CareerView />
    </>
  );
}

import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { AssessmentList } from './assessment-list';

export const metadata: Metadata = { title: 'Assessments' };

export default function AssessmentsPage() {
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Every quiz is scored on the server with a published rubric. Retake as often as you like — we track your best score and what you missed."
      />
      <AssessmentList />
    </>
  );
}

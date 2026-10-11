import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { CourseCatalog } from './course-catalog';

export const metadata: Metadata = { title: 'Courses' };

export default function CoursesPage() {
  return (
    <>
      <PageHeader
        title="Courses"
        description="A structured curriculum with prerequisites — from Python to production GenAI. Open any course; your roadmap explains what to do first."
      />
      <CourseCatalog />
    </>
  );
}

import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { ProjectList } from './project-list';

export const metadata: Metadata = { title: 'Projects' };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Guided projects"
        description="Portfolio projects with real requirements, acceptance criteria, tests and a rubric. Build them in your own repository and submit the link for review."
      />
      <ProjectList />
    </>
  );
}

import type { Metadata } from 'next';
import { PageHeader } from '@/components/page-header';
import { KnowledgeView } from './knowledge-view';

export const metadata: Metadata = { title: 'Knowledge Base' };

export default function KnowledgePage() {
  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="Ask questions answered only from your organization’s documents, with every source cited and checked."
      />
      <KnowledgeView />
    </>
  );
}

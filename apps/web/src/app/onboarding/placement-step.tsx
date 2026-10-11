'use client';

import { CheckboxCards } from '@/components/ui/choice-group';
import { Alert, Skeleton } from '@/components/ui/feedback';
import { useCourses } from '@/lib/curriculum';
import { tx } from '@/lib/localize';

/**
 * Lets experienced learners skip courses they already know. Nothing is hidden: marked courses
 * count as done for prerequisites and stay open for review.
 */
export function PlacementStep({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const courses = useCourses();
  if (courses.isPending) return <Skeleton className="h-48" />;
  if (courses.isError) {
    return (
      <Alert tone="warning" title="Course list unavailable">
        You can skip this step and mark known courses later on your learning path.
      </Alert>
    );
  }
  return (
    <CheckboxCards
      legend="I already know"
      hint="Optional. Leave everything unticked if you are not sure."
      columns={2}
      values={selected}
      onChange={onChange}
      choices={courses.data.map((c) => ({
        value: c.id,
        title: `Level ${c.level} · ${tx(c.title, 'en')}`,
        description: tx(c.summary, 'en'),
      }))}
    />
  );
}

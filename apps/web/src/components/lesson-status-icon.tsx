import type { LessonStatus } from '@genpath/shared';
import { Circle, CircleCheck, CircleDot } from 'lucide-react';

export function LessonStatusIcon({ status }: { status: LessonStatus }) {
  if (status === 'completed') {
    return <CircleCheck className="size-5 shrink-0 text-success" aria-label="Completed" />;
  }
  if (status === 'in_progress') {
    return <CircleDot className="size-5 shrink-0 text-info" aria-label="In progress" />;
  }
  return <Circle className="size-5 shrink-0 text-muted-foreground/60" aria-label="Not started" />;
}

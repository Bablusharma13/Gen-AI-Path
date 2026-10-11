'use client';

import type { CourseSummaryDto, ExplanationLanguage } from '@genpath/shared';
import { BookOpen, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/feedback';
import { tx } from '@/lib/localize';

export function CourseCard({
  course,
  lang,
}: {
  course: CourseSummaryDto;
  lang: ExplanationLanguage;
}) {
  const { progress } = course;
  const percent = progress.totalLessons
    ? (progress.completedLessons / progress.totalLessons) * 100
    : 0;
  return (
    <Card className="group relative flex h-full flex-col transition-shadow hover:shadow-md">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary">Level {course.level}</Badge>
          {progress.status === 'completed' ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden /> Completed
            </Badge>
          ) : progress.status === 'in_progress' ? (
            <Badge variant="info">In progress</Badge>
          ) : null}
        </div>
        <h3 className="font-semibold leading-snug">
          <Link
            href={`/courses/${course.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {tx(course.title, lang)}
          </Link>
        </h3>
        <p className="line-clamp-3 flex-1 text-sm text-muted-foreground">
          {tx(course.summary, lang)}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="size-3.5" aria-hidden /> {course.lessonCount} lessons
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> ~{course.estimatedHours} h
          </span>
        </div>
        {progress.status !== 'not_started' ? (
          <div className="space-y-1">
            <Progress value={percent} label={`${tx(course.title, lang)} progress`} />
            <p className="text-xs text-muted-foreground">
              {progress.completedLessons}/{progress.totalLessons} lessons
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

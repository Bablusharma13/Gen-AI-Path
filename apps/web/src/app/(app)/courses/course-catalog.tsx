'use client';

import { TRACK_LABELS, TRACKS, type Track } from '@genpath/shared';
import { BookOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useId, useState } from 'react';
import { CourseCard } from '@/components/course-card';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, NativeSelect } from '@/components/ui/input';
import { useCourses, useSearch } from '@/lib/curriculum';
import { tx } from '@/lib/localize';
import { useLearnerLanguages } from '@/lib/use-learner';

export function CourseCatalog() {
  const courses = useCourses();
  const { lang } = useLearnerLanguages();
  const [track, setTrack] = useState<Track | 'all'>('all');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const search = useSearch(deferredQuery);
  const searchId = useId();
  const trackId = useId();

  const visible = (courses.data ?? []).filter((c) => track === 'all' || c.tracks.includes(track));
  const searching = deferredQuery.length >= 2;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search lessons and courses
          </label>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={searchId}
            type="search"
            placeholder="Search lessons — try “embeddings” or “retry”"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="sm:w-64">
          <label htmlFor={trackId} className="sr-only">
            Filter by career track
          </label>
          <NativeSelect
            id={trackId}
            value={track}
            onChange={(e) => setTrack(e.target.value as Track | 'all')}
          >
            <option value="all">All tracks</option>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                Track {t} — {TRACK_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {searching ? (
        <section aria-label="Search results" className="space-y-3">
          {search.isPending ? (
            <Skeleton className="h-24" />
          ) : search.isError ? (
            <ErrorState message="Search failed" onRetry={() => void search.refetch()} />
          ) : search.data.lessons.length === 0 && search.data.courses.length === 0 ? (
            <EmptyState
              icon={Search}
              title={`No results for “${deferredQuery}”`}
              description="Try a broader word."
            />
          ) : (
            <ul className="grid gap-2">
              {search.data.courses.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/courses/${c.slug}`}
                    className="block rounded-lg border bg-card p-4 hover:bg-accent/40"
                  >
                    <p className="text-xs font-medium text-primary">Course</p>
                    <p className="font-medium">{tx(c.title, lang)}</p>
                    <p className="text-sm text-muted-foreground">{tx(c.summary, lang)}</p>
                  </Link>
                </li>
              ))}
              {search.data.lessons.map((l) => (
                <li key={l.id}>
                  <Link
                    href={`/courses/${l.courseSlug}/${l.slug}`}
                    className="block rounded-lg border bg-card p-4 hover:bg-accent/40"
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      Lesson · {tx(l.courseTitle, lang)}
                    </p>
                    <p className="font-medium">{tx(l.title, lang)}</p>
                    <p className="text-sm text-muted-foreground">{tx(l.summary, lang)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : courses.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-52" />
          ))}
        </div>
      ) : courses.isError ? (
        <ErrorState message="Could not load courses" onRetry={() => void courses.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses for this track yet" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((course) => (
            <li key={course.id}>
              <CourseCard course={course} lang={lang} />
            </li>
          ))}
        </ul>
      )}

      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          More levels — machine learning, advanced RAG, agent frameworks, fine-tuning, MLOps and
          multimodal — are designed and will be published as they are written and reviewed. We
          don&apos;t publish placeholder lessons.
        </CardContent>
      </Card>
    </div>
  );
}

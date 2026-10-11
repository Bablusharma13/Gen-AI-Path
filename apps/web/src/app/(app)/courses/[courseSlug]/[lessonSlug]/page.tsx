import { LessonView } from './lesson-view';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ courseSlug: string; lessonSlug: string }>;
}) {
  const { courseSlug, lessonSlug } = await params;
  return <LessonView courseSlug={courseSlug} lessonSlug={lessonSlug} />;
}

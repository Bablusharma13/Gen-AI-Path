import { CourseDetail } from './course-detail';

export default async function CoursePage({ params }: { params: Promise<{ courseSlug: string }> }) {
  const { courseSlug } = await params;
  return <CourseDetail slug={courseSlug} />;
}

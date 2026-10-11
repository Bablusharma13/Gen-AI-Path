import { QuizRunner } from './quiz-runner';

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  return <QuizRunner assessmentId={assessmentId} />;
}

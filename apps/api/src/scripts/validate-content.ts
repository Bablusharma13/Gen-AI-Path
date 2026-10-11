import { ContentValidationError, loadContent, resolveContentDir } from '../content/loader';

/** Validates every curriculum/project file without touching a database (used in CI). */
async function main(): Promise<void> {
  const dir = resolveContentDir(process.env.CONTENT_DIR);
  try {
    const content = await loadContent(dir);
    const questions = content.assessments.reduce((n, a) => n + a.questions.length, 0);
    console.log(`✔ Content valid (${dir})`);
    console.log(
      `  ${content.courses.length} courses · ${content.lessons.length} lessons · ` +
        `${content.assessments.length} assessments (${questions} questions) · ` +
        `${content.exercises.length} exercises · ${content.projects.length} projects · ` +
        `${content.interviewQuestions.length} interview questions`,
    );
    for (const warning of content.warnings) console.warn(`  ⚠ ${warning}`);
  } catch (err) {
    if (err instanceof ContentValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});

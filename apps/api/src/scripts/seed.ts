import mongoose from 'mongoose';
import { loadConfig } from '../config/env';
import { loadEnvFile } from '../config/load-env-file';
import { ContentValidationError, loadContent, resolveContentDir } from '../content/loader';
import { seedContent, type SeedCounts } from '../content/seed';

const fmt = (c: SeedCounts) =>
  `${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged, ${c.archived} archived`;

/** Validates content and loads it into MongoDB. Idempotent; never deletes learner progress. */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const dir = resolveContentDir(config.contentDir);

  const content = await loadContent(dir);
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
    const report = await seedContent(content);
    console.log(`✔ Seeded ${mongoose.connection.name} from ${dir}`);
    console.log(`  courses:     ${fmt(report.courses)}`);
    console.log(`  lessons:     ${fmt(report.lessons)}`);
    console.log(`  assessments: ${fmt(report.assessments)}`);
    console.log(`  exercises:   ${fmt(report.exercises)}`);
    console.log(`  projects:    ${fmt(report.projects)}`);
    console.log(`  interview:   ${fmt(report.interviewQuestions)}`);
    for (const warning of report.warnings) console.warn(`  ⚠ ${warning}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof ContentValidationError ? err.message : err);
  process.exit(1);
});

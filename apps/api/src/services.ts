import type { AppContext } from './context';
import { AdminService } from './modules/admin/admin.service';
import { MentorService } from './modules/ai/mentor.service';
import { AssessmentService } from './modules/assessments/assessment.service';
import { AuditService } from './modules/audit/audit.service';
import { AuthService } from './modules/auth/auth.service';
import { CareerService } from './modules/career/career.service';
import { AccessTokens } from './modules/auth/tokens';
import { InlineJobQueue } from './lib/jobs';
import { CurriculumService } from './modules/curriculum/curriculum.service';
import { ExerciseService } from './modules/exercises/exercise.service';
import { IngestionService } from './modules/knowledge/ingestion.service';
import { KnowledgeService } from './modules/knowledge/knowledge.service';
import { LearningService } from './modules/learning/learning.service';
import { ProfileService } from './modules/profile/profile.service';
import { ProgressService } from './modules/progress/progress.service';
import { ProjectService } from './modules/projects/project.service';
import { RoadmapService } from './modules/roadmap/roadmap.service';

/** Application services, built once per app instance from the infrastructure context. */
export interface Services {
  tokens: AccessTokens;
  auth: AuthService;
  audit: AuditService;
  profile: ProfileService;
  learning: LearningService;
  curriculum: CurriculumService;
  assessments: AssessmentService;
  exercises: ExerciseService;
  roadmap: RoadmapService;
  progress: ProgressService;
  projects: ProjectService;
  career: CareerService;
  mentor: MentorService;
  knowledge: KnowledgeService;
  ingestion: IngestionService;
  admin: AdminService;
}

export function buildServices(ctx: AppContext): Services {
  const { config, logger, mailer } = ctx;
  const tokens = new AccessTokens(config.auth.jwtSecret, config.auth.accessTtlSec);
  const audit = new AuditService(config.auth.refreshSecret, logger);
  const auth = new AuthService({ config, logger, mailer, tokens });
  const profile = new ProfileService();
  const learning = new LearningService();
  const curriculum = new CurriculumService(learning);
  const roadmap = new RoadmapService(curriculum);
  const progress = new ProgressService(curriculum, roadmap);

  const mentor = new MentorService(ctx, learning, progress);
  const ingestion = new IngestionService(ctx);
  // In development the queue runs jobs in this process; in production a worker consumes them.
  if (ctx.jobs instanceof InlineJobQueue) ctx.jobs.setHandler((job) => ingestion.process(job));

  return {
    tokens,
    auth,
    audit,
    profile,
    learning,
    curriculum,
    assessments: new AssessmentService(learning),
    exercises: new ExerciseService(learning),
    roadmap,
    progress,
    projects: new ProjectService(learning),
    career: new CareerService(curriculum),
    mentor,
    knowledge: new KnowledgeService(ctx, mentor),
    ingestion,
    admin: new AdminService(ctx, auth),
  };
}

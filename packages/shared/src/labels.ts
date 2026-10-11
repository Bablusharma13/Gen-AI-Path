import type {
  CareerGoal,
  DailyMinutes,
  Experience,
  ExplanationLanguage,
  LearningStyle,
  ProgrammingLanguage,
  Role,
  SkillLevel,
  Theme,
  Track,
} from './enums';

/** Human-readable labels shared by the UI and AI prompts. */
export const CAREER_GOAL_LABELS: Record<CareerGoal, { title: string; description: string }> = {
  genai_app_engineer: {
    title: 'GenAI Application Engineer',
    description:
      'Build LLM-powered products: prompts, RAG, structured outputs, evaluation, deployment.',
  },
  ai_agent_engineer: {
    title: 'AI Agent Engineer',
    description: 'Design tool-calling agents and workflows with state, memory and human approvals.',
  },
  ml_llm_engineer: {
    title: 'ML/LLM Engineer',
    description: 'Train and adapt models: ML, PyTorch, transformers, fine-tuning, inference.',
  },
  ai_platform_engineer: {
    title: 'AI Platform / MLOps Engineer',
    description: 'Serve, monitor and scale models with reliable deployment pipelines.',
  },
  research_foundations: {
    title: 'AI Research Foundations',
    description: 'Mathematics, papers, experiment design and reproducibility.',
  },
  general: {
    title: 'General AI Learning',
    description: 'Understand AI deeply without committing to a specific role yet.',
  },
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const EXPERIENCE_LABELS: Record<Experience, string> = {
  none: 'No programming experience',
  basic_programming: 'Basic programming',
  web_development: 'Web development',
  python_development: 'Python development',
  ml_ai: 'ML / AI experience',
};

export const PROGRAMMING_LANGUAGE_LABELS: Record<ProgrammingLanguage, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
};

export const EXPLANATION_LANGUAGE_LABELS: Record<
  ExplanationLanguage,
  { title: string; sample: string }
> = {
  hinglish: { title: 'Hinglish', sample: 'Embeddings text ko numbers mein convert karte hain.' },
  en: { title: 'English', sample: 'Embeddings convert text into numbers.' },
  hi: { title: 'हिन्दी (Hindi)', sample: 'Embeddings टेक्स्ट को संख्याओं में बदलते हैं।' },
};

export const LEARNING_STYLE_LABELS: Record<LearningStyle, { title: string; description: string }> =
  {
    beginner_friendly: {
      title: 'Beginner Friendly',
      description: 'Slow pace, no assumed knowledge.',
    },
    short_simple: { title: 'Short and Simple', description: 'Just the essentials, quickly.' },
    detailed: { title: 'Detailed', description: 'Thorough explanations with context.' },
    interview_focused: {
      title: 'Interview Focused',
      description: 'Crisp answers, trade-offs, follow-ups.',
    },
    code_first: { title: 'Code First', description: 'Show the code, then explain it.' },
    deep_technical: { title: 'Deep Technical', description: 'Internals, math and edge cases.' },
    visual: { title: 'Visual Learning', description: 'Diagrams, labs and step-by-step visuals.' },
  };

export const DAILY_MINUTES_LABELS: Record<DailyMinutes, string> = {
  15: '15 minutes',
  30: '30 minutes',
  60: '1 hour',
  120: '2 hours or more',
};

export const THEME_LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  instructor: 'Instructor',
  org_admin: 'Organization Admin',
  platform_admin: 'Platform Admin',
};

export const TRACK_LABELS: Record<Track, string> = {
  A: 'GenAI Application Engineer',
  B: 'AI Agent Engineer',
  C: 'ML/LLM Engineer',
  D: 'AI Platform/MLOps Engineer',
  E: 'AI Research Foundations',
};

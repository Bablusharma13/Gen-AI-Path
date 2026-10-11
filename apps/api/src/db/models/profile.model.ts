import {
  CAREER_GOALS,
  DAILY_MINUTES,
  DEFAULT_PREFERENCES,
  EXPERIENCE_LEVELS,
  EXPLANATION_LANGUAGES,
  FONT_SCALES,
  LEARNING_STYLES,
  PROGRAMMING_LANGUAGES,
  SKILL_LEVELS,
  THEMES,
} from '@genpath/shared';
import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const preferencesSchema = new Schema(
  {
    explanationLanguage: {
      type: String,
      enum: EXPLANATION_LANGUAGES,
      default: DEFAULT_PREFERENCES.explanationLanguage,
    },
    programmingLanguages: {
      type: [{ type: String, enum: PROGRAMMING_LANGUAGES }],
      default: DEFAULT_PREFERENCES.programmingLanguages,
      validate: [(v: string[]) => v.length >= 1 && v.length <= 3, 'Choose 1–3 languages'],
    },
    primaryProgrammingLanguage: {
      type: String,
      enum: PROGRAMMING_LANGUAGES,
      default: DEFAULT_PREFERENCES.primaryProgrammingLanguage,
    },
    learningStyle: {
      type: String,
      enum: LEARNING_STYLES,
      default: DEFAULT_PREFERENCES.learningStyle,
    },
    dailyMinutes: { type: Number, enum: DAILY_MINUTES, default: DEFAULT_PREFERENCES.dailyMinutes },
    theme: { type: String, enum: THEMES, default: DEFAULT_PREFERENCES.theme },
    reducedMotion: { type: Boolean, default: DEFAULT_PREFERENCES.reducedMotion },
    fontScale: { type: Number, enum: FONT_SCALES, default: DEFAULT_PREFERENCES.fontScale },
    mentorPersonalization: { type: Boolean, default: DEFAULT_PREFERENCES.mentorPersonalization },
  },
  { _id: false },
);

const statsSchema = new Schema(
  {
    xp: { type: Number, default: 0, min: 0 },
    currentStreak: { type: Number, default: 0, min: 0 },
    longestStreak: { type: Number, default: 0, min: 0 },
    /** Calendar day (YYYY-MM-DD, UTC) of the last learning activity. */
    lastActiveDay: { type: String, default: null },
  },
  { _id: false },
);

const profileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    bio: { type: String, default: '', maxlength: 500 },
    careerGoal: { type: String, enum: [...CAREER_GOALS, null], default: null },
    level: { type: String, enum: [...SKILL_LEVELS, null], default: null },
    experience: { type: String, enum: [...EXPERIENCE_LEVELS, null], default: null },
    knownCourseIds: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 30, 'Too many courses'],
    },
    /** Roadmap courses the learner pinned to prioritise. */
    pinnedCourseIds: {
      type: [String],
      default: [],
      validate: [(v: string[]) => v.length <= 30, 'Too many courses'],
    },
    preferences: { type: preferencesSchema, default: () => ({}) },
    stats: { type: statsSchema, default: () => ({}) },
    onboardingCompletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type Profile = InferSchemaType<typeof profileSchema> & { _id: Types.ObjectId };
export const ProfileModel = model('Profile', profileSchema);

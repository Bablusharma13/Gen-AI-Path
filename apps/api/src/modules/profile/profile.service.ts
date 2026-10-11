import {
  DEFAULT_PREFERENCES,
  type onboardingSchema,
  type CareerGoal,
  type Experience,
  type Preferences,
  type ProfileDto,
  type SkillLevel,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
} from '@genpath/shared';
import type { z } from 'zod';
import { ProfileModel, type Profile } from '../../db/models/profile.model';
import { UserModel } from '../../db/models/user.model';
import { AppError } from '../../lib/errors';
import { effectiveStreak } from '../learning/learning.service';

type OnboardingData = z.output<typeof onboardingSchema>;

function toPreferences(p: Profile['preferences'] | undefined): Preferences {
  return { ...DEFAULT_PREFERENCES, ...(p ?? {}) } as Preferences;
}

export class ProfileService {
  /** Loads the profile, creating it with defaults if missing (e.g. accounts created by scripts). */
  async getOrCreate(userId: string): Promise<Profile> {
    const profile = await ProfileModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    return profile as Profile;
  }

  async get(userId: string): Promise<ProfileDto> {
    const [user, profile] = await Promise.all([
      UserModel.findById(userId).select('name email').lean(),
      this.getOrCreate(userId),
    ]);
    if (!user) throw new AppError('NOT_FOUND', 'Account not found');
    return {
      userId,
      name: user.name,
      email: user.email,
      bio: profile.bio ?? '',
      careerGoal: (profile.careerGoal ?? null) as CareerGoal | null,
      level: (profile.level ?? null) as SkillLevel | null,
      experience: (profile.experience ?? null) as Experience | null,
      knownCourseIds: profile.knownCourseIds ?? [],
      preferences: toPreferences(profile.preferences),
      stats: {
        xp: profile.stats?.xp ?? 0,
        currentStreak: effectiveStreak(profile.stats),
        longestStreak: profile.stats?.longestStreak ?? 0,
        lastActiveDay: profile.stats?.lastActiveDay ?? null,
      },
      onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
    };
  }

  async getPreferences(userId: string): Promise<Preferences> {
    return toPreferences((await this.getOrCreate(userId)).preferences);
  }

  async update(userId: string, input: UpdateProfileInput): Promise<ProfileDto> {
    const { name, ...rest } = input;
    if (name !== undefined) await UserModel.updateOne({ _id: userId }, { $set: { name } });
    if (Object.keys(rest).length > 0) {
      await this.getOrCreate(userId);
      await ProfileModel.updateOne({ userId }, { $set: rest }, { runValidators: true });
    }
    return this.get(userId);
  }

  /**
   * Updates only the fields provided. Preferences are independent: e.g. changing the explanation
   * language never modifies programming languages.
   */
  async updatePreferences(userId: string, input: UpdatePreferencesInput): Promise<ProfileDto> {
    const current = await this.getPreferences(userId);
    const next = { ...current, ...input };
    if (!next.programmingLanguages.includes(next.primaryProgrammingLanguage)) {
      throw new AppError('VALIDATION_ERROR', 'Invalid preferences', [
        {
          path: 'primaryProgrammingLanguage',
          message: 'Primary language must be one of your selected programming languages',
        },
      ]);
    }
    const $set = Object.fromEntries(
      Object.entries(input).map(([key, value]) => [`preferences.${key}`, value]),
    );
    await ProfileModel.updateOne({ userId }, { $set }, { runValidators: true });
    return this.get(userId);
  }

  async completeOnboarding(userId: string, input: OnboardingData): Promise<ProfileDto> {
    await this.getOrCreate(userId);
    await ProfileModel.updateOne(
      { userId },
      {
        $set: {
          careerGoal: input.careerGoal,
          level: input.level,
          experience: input.experience,
          knownCourseIds: input.knownCourseIds,
          'preferences.programmingLanguages': input.programmingLanguages,
          'preferences.primaryProgrammingLanguage': input.primaryProgrammingLanguage,
          'preferences.explanationLanguage': input.explanationLanguage,
          'preferences.learningStyle': input.learningStyle,
          'preferences.dailyMinutes': input.dailyMinutes,
          onboardingCompletedAt: new Date(),
        },
      },
      { runValidators: true },
    );
    return this.get(userId);
  }
}

'use client';

import {
  CAREER_GOAL_LABELS,
  CAREER_GOALS,
  EXPERIENCE_LABELS,
  EXPERIENCE_LEVELS,
  SKILL_LEVEL_LABELS,
  SKILL_LEVELS,
  updateProfileSchema,
  type CareerGoal,
  type Experience,
  type ProfileDto,
  type SkillLevel,
} from '@genpath/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/feedback';
import { Label, NativeSelect, Textarea } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';
import { meKey, profileKey } from '@/lib/auth';

export function ProfileSettings({ profile }: { profile: ProfileDto }) {
  const qc = useQueryClient();
  const ids = { bio: useId(), goal: useId(), level: useId(), exp: useId() };
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [careerGoal, setCareerGoal] = useState<CareerGoal | ''>(profile.careerGoal ?? '');
  const [level, setLevel] = useState<SkillLevel | ''>(profile.level ?? '');
  const [experience, setExperience] = useState<Experience | ''>(profile.experience ?? '');
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: (input: unknown) => api<ProfileDto>('/profile', { method: 'PATCH', body: input }),
    onSuccess: async (data) => {
      qc.setQueryData(profileKey, data);
      await qc.invalidateQueries({ queryKey: meKey });
      toast.success('Profile saved');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const input = {
      name,
      bio,
      ...(careerGoal ? { careerGoal } : {}),
      ...(level ? { level } : {}),
      ...(experience ? { experience } : {}),
    };
    const parsed = updateProfileSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    save.mutate(parsed.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium text-foreground">{profile.email}</span>. Your
          profile is private.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-xl gap-4">
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            error={error}
          />
          <div className="space-y-1.5">
            <Label htmlFor={ids.bio}>About you</Label>
            <Textarea
              id={ids.bio}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              placeholder="What are you learning AI for?"
            />
            <p className="text-xs text-muted-foreground">{bio.length}/500</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={ids.goal}>Career goal</Label>
            <NativeSelect
              id={ids.goal}
              value={careerGoal}
              onChange={(e) => setCareerGoal(e.target.value as CareerGoal)}
            >
              <option value="" disabled>
                Choose a goal
              </option>
              {CAREER_GOALS.map((g) => (
                <option key={g} value={g}>
                  {CAREER_GOAL_LABELS[g].title}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.level}>Level</Label>
              <NativeSelect
                id={ids.level}
                value={level}
                onChange={(e) => setLevel(e.target.value as SkillLevel)}
              >
                <option value="" disabled>
                  Choose
                </option>
                {SKILL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SKILL_LEVEL_LABELS[l]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.exp}>Experience</Label>
              <NativeSelect
                id={ids.exp}
                value={experience}
                onChange={(e) => setExperience(e.target.value as Experience)}
              >
                <option value="" disabled>
                  Choose
                </option>
                {EXPERIENCE_LEVELS.map((x) => (
                  <option key={x} value={x}>
                    {EXPERIENCE_LABELS[x]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner label="Saving" /> : null}
              Save profile
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

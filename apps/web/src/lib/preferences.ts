'use client';

import type { ProfileDto, UpdatePreferencesInput } from '@genpath/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from './api';
import { profileKey } from './auth';

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) =>
      api<ProfileDto>('/profile/preferences', { method: 'PATCH', body: input }),
    onSuccess: (profile) => qc.setQueryData(profileKey, profile),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Applies accessibility preferences to the document root. */
export function applyAccessibility(prefs: { reducedMotion: boolean; fontScale: number }): void {
  const root = document.documentElement;
  root.dataset.reducedMotion = String(prefs.reducedMotion);
  root.style.setProperty('--font-scale', String(prefs.fontScale));
}

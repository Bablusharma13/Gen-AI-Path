'use client';

import type { LoginInput, ProfileDto, PublicUser, RegisterInput } from '@genpath/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const meKey = ['me'] as const;
export const profileKey = ['profile'] as const;

/** Signed-in user, or null when signed out. */
export function useMe() {
  return useQuery({
    queryKey: meKey,
    queryFn: async () => {
      try {
        return await api<PublicUser>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: profileKey,
    queryFn: () => api<ProfileDto>('/profile'),
    enabled,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) =>
      api<PublicUser>('/auth/login', { method: 'POST', body: input, skipRefresh: true }),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterInput) =>
      api<PublicUser>('/auth/register', { method: 'POST', body: input, skipRefresh: true }),
    onSuccess: (user) => {
      qc.clear();
      qc.setQueryData(meKey, user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST', skipRefresh: true }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(meKey, null);
    },
  });
}

/** Only allow same-site relative redirects after sign-in (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\'))
    return fallback;
  return next;
}

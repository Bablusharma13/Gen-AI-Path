import { z } from 'zod';
import { emailSchema } from './common';
import type { Role } from './enums';

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9\W_]/.test(value), {
    message: 'Mix letters with numbers or symbols',
  });

export const nameSchema = z.string().trim().min(1, 'Enter your name').max(80);

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Do not enforce complexity on login: only length bounds.
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/, 'Invalid or expired link');

export const resetPasswordSchema = z.object({
  token: tokenSchema,
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({ token: tokenSchema });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});

/** What the API returns about the signed-in user. Never includes secrets. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  createdAt: string;
}

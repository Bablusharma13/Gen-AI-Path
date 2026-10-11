'use client';

import { loginSchema } from '@genpath/shared';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PasswordField, TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { ApiError, errorMessage } from '@/lib/api';
import { safeNext, useLogin } from '@/lib/auth';

type Errors = Partial<Record<'email' | 'password', string>>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [errors, setErrors] = useState<Errors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues)
        next[issue.path[0] as keyof Errors] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    try {
      const user = await login.mutateAsync(parsed.data);
      router.replace(user.onboardingCompleted ? safeNext(params.get('next')) : '/onboarding');
    } catch {
      // Rendered from login.error below.
    }
  }

  const apiError = login.error instanceof ApiError ? login.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Welcome back</CardTitle>
        <CardDescription>Sign in to continue your learning path.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          {login.isError ? <Alert tone="error">{errorMessage(login.error)}</Alert> : null}
          {params.get('reset') === '1' ? (
            <Alert tone="success">Password updated. Sign in with your new password.</Alert>
          ) : null}
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            required
            error={errors.email ?? apiError?.fieldError('email')}
          />
          <PasswordField
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            error={errors.password}
          />
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? <Spinner label="Signing in" /> : null}
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          New to GenPath AI?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

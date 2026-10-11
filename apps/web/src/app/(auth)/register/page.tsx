'use client';

import { PASSWORD_MIN, registerSchema } from '@genpath/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PasswordField, TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { ApiError, errorMessage } from '@/lib/api';
import { useRegister } from '@/lib/auth';

type Errors = Partial<Record<'name' | 'email' | 'password', string>>;

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const [errors, setErrors] = useState<Errors>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      name: form.get('name'),
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
      await register.mutateAsync(parsed.data);
      router.replace('/onboarding');
    } catch {
      // Rendered below.
    }
  }

  const apiError = register.error instanceof ApiError ? register.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Create your account</CardTitle>
        <CardDescription>Free forever for the core curriculum. No credit card.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
          {register.isError && !apiError?.details ? (
            <Alert tone="error">{errorMessage(register.error)}</Alert>
          ) : null}
          <TextField
            label="Name"
            name="name"
            autoComplete="name"
            required
            error={errors.name ?? apiError?.fieldError('name')}
          />
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
            autoComplete="new-password"
            required
            hint={`At least ${PASSWORD_MIN} characters, mixing letters with numbers or symbols.`}
            error={errors.password ?? apiError?.fieldError('password')}
          />
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? <Spinner label="Creating account" /> : null}
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

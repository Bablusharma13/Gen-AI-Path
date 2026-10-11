'use client';

import { PASSWORD_MIN, passwordSchema } from '@genpath/shared';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState, type FormEvent } from 'react';
import { PasswordField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState<string>();
  const reset = useMutation({
    mutationFn: (password: string) =>
      api('/auth/reset-password', { method: 'POST', body: { token, password }, skipRefresh: true }),
    onSuccess: () => router.replace('/login?reset=1'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    if (password !== confirm) return setError('Passwords do not match');
    setError(undefined);
    reset.mutate(password);
  }

  if (!token) {
    return (
      <Alert tone="error" title="Missing reset token">
        Open the link from your email again, or{' '}
        <Link href="/forgot-password" className="text-primary underline">
          request a new one
        </Link>
        .
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {reset.isError ? <Alert tone="error">{errorMessage(reset.error)}</Alert> : null}
      <PasswordField
        label="New password"
        name="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={error}
      />
      <PasswordField label="Confirm new password" name="confirm" autoComplete="new-password" />
      <Button type="submit" className="w-full" disabled={reset.isPending}>
        {reset.isPending ? <Spinner label="Saving" /> : null}
        Set new password
      </Button>
      <p className="text-xs text-muted-foreground">You will be signed out on all devices.</p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          This link works once and expires 30 minutes after it was sent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ResetForm />
        </Suspense>
      </CardContent>
    </Card>
  );
}

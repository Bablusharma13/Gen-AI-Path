'use client';

import { forgotPasswordSchema } from '@genpath/shared';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string>();
  const request = useMutation({
    mutationFn: (email: string) =>
      api<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: { email },
        skipRefresh: true,
      }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({
      email: new FormData(event.currentTarget).get('email'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    request.mutate(parsed.data.email);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          We will email you a single-use link that expires in 30 minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {request.isSuccess ? (
          <Alert tone="success" title="Check your inbox">
            <span className="flex items-center gap-2">
              <MailCheck className="size-4" aria-hidden /> {request.data.message}
            </span>
          </Alert>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {request.isError ? <Alert tone="error">{errorMessage(request.error)}</Alert> : null}
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              error={error}
            />
            <Button type="submit" className="w-full" disabled={request.isPending}>
              {request.isPending ? <Spinner label="Sending" /> : null}
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

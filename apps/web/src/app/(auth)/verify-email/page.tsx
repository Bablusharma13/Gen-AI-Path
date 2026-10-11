'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { meKey } from '@/lib/auth';

function Verify() {
  const token = useSearchParams().get('token') ?? '';
  const qc = useQueryClient();
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: () =>
      api('/auth/verify-email', { method: 'POST', body: { token }, skipRefresh: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: meKey }),
  });
  const { mutate } = verify;

  useEffect(() => {
    // Tokens are single-use: never submit twice (React strict mode runs effects twice in dev).
    if (token && !started.current) {
      started.current = true;
      mutate();
    }
  }, [token, mutate]);

  if (!token) return <Alert tone="error">This verification link is incomplete.</Alert>;
  if (verify.isPending || verify.isIdle) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Verifying your email…
      </p>
    );
  }
  if (verify.isError) {
    return (
      <Alert tone="error" title="Could not verify">
        {errorMessage(verify.error)} You can request a new link from Settings.
      </Alert>
    );
  }
  return (
    <div className="space-y-4">
      <Alert tone="success" title="Email verified">
        Your account is secured.
      </Alert>
      <Button asChild className="w-full">
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Email verification</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <Verify />
        </Suspense>
      </CardContent>
    </Card>
  );
}

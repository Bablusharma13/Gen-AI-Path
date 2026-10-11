'use client';

import { changePasswordSchema, PASSWORD_MIN } from '@genpath/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MailCheck, ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PasswordField } from '@/components/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { meKey, useMe } from '@/lib/auth';

function EmailVerification() {
  const me = useMe();
  const resend = useMutation({
    mutationFn: () => api<{ sent: boolean }>('/auth/resend-verification', { method: 'POST' }),
    onSuccess: (r) =>
      toast.success(r.sent ? 'Verification email sent' : 'Your email is already verified'),
    onError: (err) => toast.error(errorMessage(err)),
  });
  if (!me.data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Email
          {me.data.emailVerified ? (
            <Badge variant="success">Verified</Badge>
          ) : (
            <Badge variant="warning">Not verified</Badge>
          )}
        </CardTitle>
        <CardDescription>{me.data.email}</CardDescription>
      </CardHeader>
      {!me.data.emailVerified ? (
        <CardContent>
          <Button variant="outline" onClick={() => resend.mutate()} disabled={resend.isPending}>
            {resend.isPending ? <Spinner /> : <MailCheck aria-hidden />}
            Resend verification email
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

function ChangePassword() {
  const [error, setError] = useState<string>();
  const change = useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) =>
      api('/auth/change-password', { method: 'POST', body: input }),
    onSuccess: () => toast.success('Password changed. Other devices were signed out.'),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    change.mutate(parsed.data, { onSuccess: () => formEl.reset() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>Changing your password signs out every other device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid max-w-md gap-4" noValidate>
          <PasswordField
            label="Current password"
            name="currentPassword"
            autoComplete="current-password"
          />
          <PasswordField
            label="New password"
            name="newPassword"
            autoComplete="new-password"
            hint={`At least ${PASSWORD_MIN} characters.`}
            error={error ?? (change.isError ? errorMessage(change.error) : undefined)}
          />
          <div>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? <Spinner /> : null}
              Update password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SignOutEverywhere() {
  const router = useRouter();
  const qc = useQueryClient();
  const logoutAll = useMutation({
    mutationFn: () => api('/auth/logout-all', { method: 'POST' }),
    onSuccess: () => {
      qc.clear();
      qc.setQueryData(meKey, null);
      router.replace('/login');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign out everywhere</CardTitle>
        <CardDescription>Ends every session on every device, including this one.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">
              <ShieldAlert aria-hidden /> Sign out of all devices
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader
              title="Sign out of all devices?"
              description="You will need to sign in again on every device."
            />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => logoutAll.mutate()}
                disabled={logoutAll.isPending}
              >
                {logoutAll.isPending ? <Spinner /> : null}
                Sign out everywhere
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export function SecuritySettings() {
  return (
    <div className="grid gap-6">
      <EmailVerification />
      <ChangePassword />
      <SignOutEverywhere />
    </div>
  );
}

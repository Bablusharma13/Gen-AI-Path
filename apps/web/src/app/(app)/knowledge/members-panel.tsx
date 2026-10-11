'use client';

import { ORG_ROLES, type OrgRole } from '@genpath/shared';
import { UserPlus, UserMinus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Label, NativeSelect } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useMemberActions, useMembers } from '@/lib/knowledge';
import { formatRelative } from '@/lib/utils';

const ROLE_LABEL: Record<OrgRole, string> = {
  member: 'Member',
  instructor: 'Instructor',
  admin: 'Admin',
};

export function MembersPanel({ orgId, currentUserId }: { orgId: string; currentUserId: string }) {
  const members = useMembers(orgId, true);
  const { add, update, remove } = useMemberActions(orgId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrgRole>('member');
  const roleId = useId();

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    add.mutate(
      { email: email.trim(), role },
      {
        onSuccess: (m) => {
          toast.success(`${m.name} added`);
          setEmail('');
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a member</CardTitle>
          <CardDescription>
            They need a GenPath account first. Members can ask questions; admins also manage
            documents and people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={onAdd}
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
          >
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <div className="space-y-1.5">
              <Label htmlFor={roleId}>Role</Label>
              <NativeSelect
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.target.value as OrgRole)}
              >
                {ORG_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? <Spinner label="Adding" /> : <UserPlus aria-hidden />} Add
            </Button>
          </form>
          {add.isError ? (
            <Alert tone="error" className="mt-4">
              {errorMessage(add.error)}
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {members.isPending ? (
        <Skeleton className="h-40" />
      ) : members.isError ? (
        <ErrorState message="Could not load members" onRetry={() => void members.refetch()} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {members.data.map((m) => (
                <li
                  key={m.userId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {m.name}{' '}
                      {m.userId === currentUserId ? (
                        <span className="text-xs text-muted-foreground">(you)</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.email} · joined {formatRelative(m.joinedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <NativeSelect
                      aria-label={`Role of ${m.name}`}
                      className="h-8 w-32 text-xs"
                      value={m.role}
                      disabled={update.isPending}
                      onChange={(e) =>
                        update.mutate(
                          { userId: m.userId, role: e.target.value as OrgRole },
                          { onError: (err) => toast.error(errorMessage(err)) },
                        )
                      }
                    >
                      {ORG_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${m.name}`}
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(m.userId, {
                          onError: (err) => toast.error(errorMessage(err)),
                        })
                      }
                    >
                      <UserMinus aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

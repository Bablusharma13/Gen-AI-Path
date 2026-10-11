'use client';

import { ROLE_LABELS, ROLES, type AdminUserDto, type Role, type UserStatus } from '@genpath/shared';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Input, Label, NativeSelect } from '@/components/ui/input';
import { useAdminUsers, useUpdateUser, type UserFilters } from '@/lib/admin';
import { errorMessage } from '@/lib/api';
import { formatRelative } from '@/lib/utils';

function UserRow({ user, isSelf }: { user: AdminUserDto; isSelf: boolean }) {
  const update = useUpdateUser();
  const change = (input: { role?: Role; status?: UserStatus }, message: string) =>
    update.mutate(
      { userId: user.id, ...input },
      { onSuccess: () => toast.success(message), onError: (err) => toast.error(errorMessage(err)) },
    );

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <p className="font-medium">
          {user.name} {isSelf ? <span className="text-xs text-muted-foreground">(you)</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-3 py-2">
        <NativeSelect
          aria-label={`Role of ${user.name}`}
          className="h-8 w-40 text-xs"
          value={user.role}
          disabled={isSelf || update.isPending}
          onChange={(e) =>
            change(
              { role: e.target.value as Role },
              `${user.name} is now ${ROLE_LABELS[e.target.value as Role]}`,
            )
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </NativeSelect>
      </td>
      <td className="px-3 py-2">
        <Badge variant={user.status === 'active' ? 'success' : 'destructive'}>
          {user.status === 'active' ? 'Active' : 'Suspended'}
        </Badge>
        {!user.emailVerified ? (
          <span className="ml-1 text-xs text-muted-foreground">email unverified</span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        Joined {formatRelative(user.createdAt)}
        <br />
        {user.lastLoginAt ? `Last login ${formatRelative(user.lastLoginAt)}` : 'Never logged in'}
      </td>
      <td className="px-3 py-2 text-right">
        {isSelf ? null : user.status === 'active' ? (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => change({ status: 'suspended' }, `${user.name} suspended and signed out`)}
          >
            {update.isPending ? <Spinner label="Saving" /> : null} Suspend
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={() => change({ status: 'active' }, `${user.name} reactivated`)}
          >
            Reactivate
          </Button>
        )}
      </td>
    </tr>
  );
}

export function UsersPanel({ currentUserId }: { currentUserId: string }) {
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState<UserFilters>({ q: '', role: '', status: '' });
  const users = useAdminUsers(filters);
  const ids = { q: useId(), role: useId(), status: useId() };
  const rows = users.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilters((f) => ({ ...f, q: draft }));
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={ids.q}>Search name or email</Label>
          <Input
            id={ids.q}
            className="w-64"
            value={draft}
            maxLength={100}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.role}>Role</Label>
          <NativeSelect
            id={ids.role}
            className="w-44"
            value={filters.role}
            onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value as Role | '' }))}
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor={ids.status}>Status</Label>
          <NativeSelect
            id={ids.status}
            className="w-36"
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value as UserStatus | '' }))
            }
          >
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">
          <Search aria-hidden /> Search
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Role and status changes apply on the person’s next request. Suspending also signs them out
        everywhere. Every change is written to the audit log.
      </p>
      {users.isPending ? (
        <Skeleton className="h-64" />
      ) : users.isError ? (
        <ErrorState message="Could not load users" onRetry={() => void users.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Search} title="No users match" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    User
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Activity
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((u) => (
                  <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} />
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {users.hasNextPage ? (
        <Button
          variant="outline"
          disabled={users.isFetchingNextPage}
          onClick={() => void users.fetchNextPage()}
        >
          {users.isFetchingNextPage ? <Spinner label="Loading" /> : null} Load more
        </Button>
      ) : null}
    </div>
  );
}

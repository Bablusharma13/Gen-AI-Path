'use client';

import type { OrganizationDto, Role } from '@genpath/shared';
import { Building2, Plus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { TextField } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Label, NativeSelect } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { useCreateOrganization, useOrganizations } from '@/lib/knowledge';
import { AskPanel } from './ask-panel';
import { DiagnosticsPanel } from './diagnostics-panel';
import { DocumentsPanel } from './documents-panel';
import { MembersPanel } from './members-panel';

const CREATOR_ROLES: Role[] = ['instructor', 'org_admin', 'platform_admin'];

function CreateOrganization({ compact = false }: { compact?: boolean }) {
  const create = useCreateOrganization();
  const [name, setName] = useState('');
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    create.mutate(name.trim(), {
      onSuccess: (org) => {
        toast.success(`Created ${org.name}`);
        setName('');
      },
    });
  };
  return (
    <form onSubmit={onSubmit} className={compact ? 'flex flex-wrap items-end gap-2' : 'space-y-3'}>
      <TextField
        label="Organization name"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
      />
      <Button type="submit" disabled={create.isPending || name.trim().length < 2}>
        {create.isPending ? <Spinner label="Creating" /> : <Plus aria-hidden />} Create organization
      </Button>
      {create.isError ? <Alert tone="error">{errorMessage(create.error)}</Alert> : null}
    </form>
  );
}

function OrganizationWorkspace({ org, userId }: { org: OrganizationDto; userId: string }) {
  const isAdmin = org.role === 'admin';
  return (
    <Tabs defaultValue="ask">
      <div className="overflow-x-auto pb-1">
        <TabsList>
          <TabsTrigger value="ask">Ask</TabsTrigger>
          <TabsTrigger value="documents">Documents ({org.documentCount})</TabsTrigger>
          {isAdmin ? <TabsTrigger value="members">Members ({org.memberCount})</TabsTrigger> : null}
          {isAdmin ? <TabsTrigger value="diagnostics">Retrieval check</TabsTrigger> : null}
        </TabsList>
      </div>
      <TabsContent value="ask">
        <AskPanel orgId={org.id} documentCount={org.documentCount} />
      </TabsContent>
      <TabsContent value="documents">
        <DocumentsPanel orgId={org.id} isAdmin={isAdmin} />
      </TabsContent>
      {isAdmin ? (
        <TabsContent value="members">
          <MembersPanel orgId={org.id} currentUserId={userId} />
        </TabsContent>
      ) : null}
      {isAdmin ? (
        <TabsContent value="diagnostics">
          <DiagnosticsPanel orgId={org.id} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
}

export function KnowledgeView() {
  const me = useMe();
  const orgs = useOrganizations();
  const [selected, setSelected] = useState<string | null>(null);
  const selectId = useId();

  if (orgs.isPending || me.isPending) return <Skeleton className="h-96" />;
  if (orgs.isError)
    return (
      <ErrorState message="Could not load organizations" onRetry={() => void orgs.refetch()} />
    );
  const canCreate = Boolean(me.data && CREATOR_ROLES.includes(me.data.role));

  if (orgs.data.length === 0) {
    return canCreate ? (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">Create your first organization</CardTitle>
          <CardDescription>
            An organization is a private knowledge base: its documents are only searchable by its
            members.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateOrganization />
        </CardContent>
      </Card>
    ) : (
      <EmptyState
        icon={Building2}
        title="You are not in an organization yet"
        description="Knowledge bases belong to organizations (a company, college or cohort). Ask your organization admin to add your account."
      />
    );
  }

  const org = orgs.data.find((o) => o.id === selected) ?? orgs.data[0]!;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {orgs.data.length > 1 ? (
          <div className="space-y-1.5">
            <Label htmlFor={selectId}>Organization</Label>
            <NativeSelect
              id={selectId}
              className="w-64"
              value={org.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {orgs.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{org.name}</span> · you are{' '}
            {org.role === 'admin' ? 'an admin' : `a ${org.role}`}
          </p>
        )}
        {canCreate ? <CreateOrganization compact /> : null}
      </div>
      {me.data ? <OrganizationWorkspace key={org.id} org={org} userId={me.data.id} /> : null}
    </div>
  );
}

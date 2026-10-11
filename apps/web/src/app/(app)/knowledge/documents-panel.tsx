'use client';

import {
  KNOWLEDGE_FILE_TYPES,
  type DocumentStatus,
  type DocumentVisibility,
  type KnowledgeDocumentDto,
} from '@genpath/shared';
import { FileUp, RefreshCw, Trash2 } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { TextField } from '@/components/forms';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, Skeleton, Spinner } from '@/components/ui/feedback';
import { Label, NativeSelect } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { useDocumentActions, useDocuments, useUploadDocument } from '@/lib/knowledge';
import { formatRelative } from '@/lib/utils';

const STATUS: Record<
  DocumentStatus,
  { label: string; variant: 'outline' | 'info' | 'success' | 'destructive' }
> = {
  queued: { label: 'Queued', variant: 'outline' },
  processing: { label: 'Processing', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
};

const ACCEPT = '.txt,.md,.markdown,.pdf,.docx';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function UploadForm({ orgId }: { orgId: string }) {
  const upload = useUploadDocument(orgId);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<DocumentVisibility>('members');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileId = useId();
  const visId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    upload.mutate(
      { file, ...(title.trim() ? { title: title.trim() } : {}), visibility },
      {
        onSuccess: (doc) => {
          toast.success(`Uploaded “${doc.title}” — indexing started`);
          setFile(null);
          setTitle('');
          if (inputRef.current) inputRef.current.value = '';
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Upload a document</CardTitle>
        <CardDescription>
          {Object.values(KNOWLEDGE_FILE_TYPES)
            .map((t) => t.label)
            .join(', ')}
          . Files are checked by type and content, then split into passages and embedded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={onSubmit}
          className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_minmax(0,1fr)_auto] md:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor={fileId}>File</Label>
            <input
              id={fileId}
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <TextField
            label="Title (optional)"
            value={title}
            maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="space-y-1.5">
            <Label htmlFor={visId}>Who can retrieve it</Label>
            <NativeSelect
              id={visId}
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as DocumentVisibility)}
            >
              <option value="members">All members</option>
              <option value="admins">Admins only</option>
            </NativeSelect>
          </div>
          <Button type="submit" disabled={!file || upload.isPending}>
            {upload.isPending ? <Spinner label="Uploading" /> : <FileUp aria-hidden />} Upload
          </Button>
        </form>
        {upload.isError ? (
          <Alert tone="error" title="Upload failed" className="mt-4">
            {errorMessage(upload.error)}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  doc,
  orgId,
  isAdmin,
}: {
  doc: KnowledgeDocumentDto;
  orgId: string;
  isAdmin: boolean;
}) {
  const { remove, reindex, visibility } = useDocumentActions(orgId);
  const [confirming, setConfirming] = useState(false);
  const status = STATUS[doc.status];
  const busy = remove.isPending || reindex.isPending || visibility.isPending;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 font-medium">
          {doc.title}
          <Badge variant={status.variant}>
            {doc.status === 'processing' || doc.status === 'queued' ? (
              <Spinner label={status.label} className="size-3" />
            ) : null}
            {status.label}
          </Badge>
          {doc.visibility === 'admins' ? <Badge variant="warning">Admins only</Badge> : null}
        </p>
        <p className="text-xs text-muted-foreground">
          {doc.filename} · {KNOWLEDGE_FILE_TYPES[doc.fileType].label} · {formatBytes(doc.sizeBytes)}{' '}
          · uploaded by {doc.uploadedBy} {formatRelative(doc.createdAt)}
          {doc.status === 'ready' ? ` · ${doc.chunkCount} passages · ${doc.embeddingModel}` : ''}
        </p>
        {doc.error ? <p className="text-sm text-destructive">{doc.error}</p> : null}
      </div>
      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label={`Visibility of ${doc.title}`}
            className="h-8 w-36 text-xs"
            value={doc.visibility}
            disabled={busy}
            onChange={(e) =>
              visibility.mutate(
                { documentId: doc.id, visibility: e.target.value as DocumentVisibility },
                { onError: (err) => toast.error(errorMessage(err)) },
              )
            }
          >
            <option value="members">All members</option>
            <option value="admins">Admins only</option>
          </NativeSelect>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || doc.status === 'queued' || doc.status === 'processing'}
            onClick={() =>
              reindex.mutate(doc.id, { onError: (err) => toast.error(errorMessage(err)) })
            }
          >
            <RefreshCw aria-hidden /> Re-index
          </Button>
          {confirming ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  remove.mutate(doc.id, {
                    onSuccess: () => toast.success('Document and its passages deleted'),
                    onError: (err) => toast.error(errorMessage(err)),
                  })
                }
              >
                Confirm delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Delete ${doc.title}`}
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function DocumentsPanel({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const docs = useDocuments(orgId);
  return (
    <div className="space-y-4">
      {isAdmin ? <UploadForm orgId={orgId} /> : null}
      {docs.isPending ? (
        <Skeleton className="h-48" />
      ) : docs.isError ? (
        <ErrorState message="Could not load documents" onRetry={() => void docs.refetch()} />
      ) : docs.data.length === 0 ? (
        <EmptyState
          icon={FileUp}
          title="No documents yet"
          description={
            isAdmin ? 'Upload the first one above.' : 'An admin has not uploaded any documents.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {docs.data.map((d) => (
                <DocumentRow key={d.id} doc={d} orgId={orgId} isAdmin={isAdmin} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

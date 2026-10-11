'use client';

import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
import { errorMessage } from '@/lib/api';
import { useChatSessions, useDeleteAllSessions } from '@/lib/mentor';

export function ChatHistoryControls() {
  const sessions = useChatSessions();
  const deleteAll = useDeleteAllSessions();
  const count = sessions.data?.length ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversation history</CardTitle>
        <CardDescription>
          {count === 0
            ? 'You have no saved conversations.'
            : `${count} saved conversation${count === 1 ? '' : 's'}.`}{' '}
          Deleting removes every message permanently. Usage counters (no message text) are kept for
          quotas.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={count === 0}>
              <Trash2 aria-hidden /> Delete all conversations
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader title="Delete all conversations?" description="This cannot be undone." />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button
                  variant="destructive"
                  disabled={deleteAll.isPending}
                  onClick={() =>
                    deleteAll.mutate(undefined, {
                      onSuccess: (r) =>
                        toast.success(
                          `Deleted ${r.sessions} conversations and ${r.messages} messages`,
                        ),
                      onError: (err) => toast.error(errorMessage(err)),
                    })
                  }
                >
                  {deleteAll.isPending ? <Spinner /> : null} Delete everything
                </Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

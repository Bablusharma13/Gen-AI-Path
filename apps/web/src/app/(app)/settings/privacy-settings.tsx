'use client';

import type { ProfileDto } from '@genpath/shared';
import { useId } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useUpdatePreferences } from '@/lib/preferences';
import { ChatHistoryControls } from './chat-history-controls';

export function PrivacySettings({ profile }: { profile: ProfileDto }) {
  const update = useUpdatePreferences();
  const switchId = useId();
  const enabled = profile.preferences.mentorPersonalization;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>AI Mentor personalization</CardTitle>
          <CardDescription>
            Controls which of your learning data the mentor may use when it answers you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
            <div>
              <label htmlFor={switchId} className="text-sm font-medium">
                Use my learning progress
              </label>
              <p className="text-sm text-muted-foreground">
                Level, career goal, current lesson, completed lessons and recent quiz mistakes.
              </p>
            </div>
            <Switch
              id={switchId}
              checked={enabled}
              onCheckedChange={(mentorPersonalization) =>
                update.mutate(
                  { mentorPersonalization },
                  {
                    onSuccess: () =>
                      toast.success(
                        mentorPersonalization ? 'Personalization on' : 'Personalization off',
                      ),
                  },
                )
              }
            />
          </div>
          <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Always used, even when personalization is off
            </p>
            <ul className="mt-1 list-disc pl-5">
              <li>Your explanation language and programming language (so answers are readable).</li>
              <li>The mentor mode you pick for a conversation.</li>
              <li>The lesson you are viewing, only when you ask from that lesson.</li>
            </ul>
            <p className="mt-2">
              Never used: your email, password, other learners&apos; data, or anything outside
              GenPath.
            </p>
          </div>
        </CardContent>
      </Card>
      <ChatHistoryControls />
    </div>
  );
}

import { Settings2 } from 'lucide-react';
import { Markdown } from '@/components/markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const GUIDE = `Set these in the server's \`.env\` and restart the API:

**Free, local (Ollama)**
\`\`\`bash
AI_PROVIDER=openai-compatible
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
\`\`\`

**Anthropic (Claude)**
\`\`\`bash
AI_PROVIDER=anthropic
AI_API_KEY=...        # server-side only, never in the browser
AI_MODEL=claude-opus-5-5
\`\`\`

**OpenAI** — \`AI_PROVIDER=openai-compatible\`, \`AI_API_KEY\`, \`AI_MODEL\` ·
**Gemini** — \`AI_PROVIDER=gemini\`, \`AI_API_KEY\`, \`AI_MODEL\`

For UI development only: \`AI_PROVIDER=mock\` (answers are labelled as mock).`;

export function SetupGuide({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="size-5 text-primary" aria-hidden /> The AI Mentor is not connected
          yet
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? 'Connect any supported provider. Lessons, labs, quizzes and exercise hints from the curriculum keep working without it.'
            : 'An administrator needs to connect an AI provider. Meanwhile, lessons, labs, quizzes and curriculum hints all work.'}
        </p>
      </CardHeader>
      {isAdmin ? (
        <CardContent>
          <Markdown className="text-sm">{GUIDE}</Markdown>
        </CardContent>
      ) : null}
    </Card>
  );
}

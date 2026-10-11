'use client';

import type { LabId } from '@genpath/shared';
import { AttentionLab } from './attention-lab';
import { EmbeddingsLab } from './embeddings-lab';
import { GradientDescentLab } from './gradient-descent-lab';
import { RagLab } from './rag-lab';
import { TokensLab } from './tokens-lab';

/** Maps a lab id from lesson content to its implementation. Config is validated by each lab. */
export function LabRenderer({ id, config }: { id: LabId; config: Record<string, unknown> }) {
  switch (id) {
    case 'tokens':
      return <TokensLab config={config} />;
    case 'embeddings':
      return <EmbeddingsLab config={config} />;
    case 'attention':
      return <AttentionLab config={config} />;
    case 'rag-pipeline':
      return <RagLab config={config} />;
    case 'gradient-descent':
      return <GradientDescentLab config={config} />;
  }
}

import type { Request } from 'express';
import { AuditLogModel } from '../../db/models/audit-log.model';
import { hashIp } from '../../lib/crypto';
import type { Logger } from '../../lib/logger';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export class AuditService {
  constructor(
    private readonly ipSecret: string,
    private readonly logger: Logger,
  ) {}

  /** Best effort: an audit failure is logged but never breaks the user's request. */
  async record(req: Request | null, entry: AuditEntry): Promise<void> {
    try {
      await AuditLogModel.create({
        actorId: entry.actorId ?? req?.auth?.userId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? {},
        requestId: req ? String(req.id ?? '') : null,
        ipHash: req ? hashIp(this.ipSecret, req.ip) : null,
      });
    } catch (err) {
      this.logger.error({ err, action: entry.action }, 'audit log write failed');
    }
  }
}

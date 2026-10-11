import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true, maxlength: 80 },
    targetType: { type: String, default: null, maxlength: 40 },
    targetId: { type: String, default: null, maxlength: 80 },
    /** Small, non-secret context (never passwords, tokens or document contents). */
    metadata: { type: Schema.Types.Mixed, default: {} },
    requestId: { type: String, default: null },
    ipHash: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'auditLogs' },
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

export type AuditLog = InferSchemaType<typeof auditLogSchema> & { _id: Types.ObjectId };
export const AuditLogModel = model('AuditLog', auditLogSchema);

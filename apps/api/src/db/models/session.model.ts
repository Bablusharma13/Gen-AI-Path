import { model, Schema, type InferSchemaType, type Types } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    /** Hash of the token this one replaced — presenting it again signals token theft. */
    previousTokenHash: { type: String, default: null },
    rotatedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 300, default: null },
    ipHash: { type: String, default: null },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true },
);

sessionSchema.index(
  { previousTokenHash: 1 },
  { partialFilterExpression: { previousTokenHash: { $type: 'string' } } },
);
sessionSchema.index({ userId: 1, revokedAt: 1 });
// MongoDB removes expired sessions automatically.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type Session = InferSchemaType<typeof sessionSchema> & { _id: Types.ObjectId };
export const SessionModel = model('Session', sessionSchema);

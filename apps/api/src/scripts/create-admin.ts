import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { emailSchema, nameSchema, passwordSchema } from '@genpath/shared';
import mongoose from 'mongoose';
import { loadConfig } from '../config/env';
import { loadEnvFile } from '../config/load-env-file';
import { AuditLogModel } from '../db/models/audit-log.model';
import { ProfileModel } from '../db/models/profile.model';
import { UserModel } from '../db/models/user.model';
import { hashPassword } from '../modules/auth/password';

const USAGE = `Usage: pnpm create-admin -- --email you@example.com [--name "Your Name"]

Creates a platform admin, or promotes an existing account. The password is read from
ADMIN_PASSWORD or prompted (hidden). It is never accepted as a command-line argument,
so it does not end up in shell history.`;

/** Reads a line without echoing it to the terminal. */
function promptHidden(question: string): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _enc, done) {
      if (!muted) process.stdout.write(chunk);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function main(): Promise<void> {
  // pnpm forwards the `--` separator from `pnpm create-admin -- --email …`; drop it.
  const args = process.argv.slice(2).filter((arg, i) => !(i === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: { email: { type: 'string' }, name: { type: 'string' }, help: { type: 'boolean' } },
  });
  if (values.help || !values.email) {
    console.log(USAGE);
    process.exit(values.help ? 0 : 1);
  }

  loadEnvFile();
  const config = loadConfig();
  const email = emailSchema.parse(values.email);
  await mongoose.connect(config.mongo.uri, { serverSelectionTimeoutMS: 5000 });

  try {
    const existing = await UserModel.findOne({ email });
    if (existing) {
      const previousRole = existing.role;
      existing.role = 'platform_admin';
      await existing.save();
      await AuditLogModel.create({
        action: 'admin.promoted_by_cli',
        targetType: 'user',
        targetId: existing._id.toString(),
        metadata: { previousRole },
      });
      console.log(`✔ ${email} is now a platform admin (was ${previousRole}). Password unchanged.`);
      return;
    }

    const name = nameSchema.parse(values.name ?? 'Platform Admin');
    const password =
      process.env.ADMIN_PASSWORD ?? (await promptHidden('Password for the new admin: '));
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      console.error(`✖ ${parsed.error.issues[0]?.message ?? 'Invalid password'}`);
      process.exitCode = 1;
      return;
    }
    const user = await UserModel.create({
      email,
      name,
      role: 'platform_admin',
      passwordHash: await hashPassword(parsed.data),
      emailVerifiedAt: new Date(),
    });
    await ProfileModel.create({ userId: user._id });
    await AuditLogModel.create({
      action: 'admin.created_by_cli',
      targetType: 'user',
      targetId: user._id.toString(),
    });
    console.log(`✔ Created platform admin ${email}`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

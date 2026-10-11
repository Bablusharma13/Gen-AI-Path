import { createTransport } from 'nodemailer';
import type { AppConfig } from '../config/env';
import type { Logger } from './logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  readonly transport: 'log' | 'smtp' | 'memory';
  send(message: MailMessage): Promise<void>;
}

/** Development only: writes the message (including links) to the log. Refused in production. */
class LogMailer implements Mailer {
  readonly transport = 'log' as const;
  constructor(private readonly logger: Logger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.info(
      { to: message.to, subject: message.subject },
      `[dev mail — not sent]\n${message.text}`,
    );
  }
}

class SmtpMailer implements Mailer {
  readonly transport = 'smtp' as const;
  private readonly transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transporter = createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...message });
  }
}

/** Test helper: keeps messages in memory for assertions. */
export class MemoryMailer implements Mailer {
  readonly transport = 'memory' as const;
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastTo(email: string): MailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === email);
  }
}

export function createMailer(config: AppConfig, logger: Logger): Mailer {
  if (config.mail.transport === 'smtp' && config.mail.smtpUrl) {
    return new SmtpMailer(config.mail.smtpUrl, config.mail.from);
  }
  return new LogMailer(logger);
}

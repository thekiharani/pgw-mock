import nodemailer, { type Transporter } from 'nodemailer';

import { settings } from '@/config.js';
import type { MailMessage, MailTransport } from '@/mail/types.js';

export function createSmtpTransport(): MailTransport {
  let transporter: Transporter | null = null;

  function get(): Transporter {
    if (transporter) return transporter;
    if (!settings.SMTP_HOST) {
      throw new Error('SMTP_HOST is required when MAIL_DRIVER=smtp');
    }
    transporter = nodemailer.createTransport({
      host: settings.SMTP_HOST,
      port: settings.SMTP_PORT,
      secure: settings.SMTP_SECURE,
      auth: settings.SMTP_USER
        ? { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD ?? '' }
        : undefined,
    });
    return transporter;
  }

  return {
    name: 'smtp',
    async send(message: MailMessage): Promise<void> {
      await get().sendMail({
        from: settings.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}

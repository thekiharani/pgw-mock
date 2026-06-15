import { Resend } from 'resend';

import { settings } from '@/config.js';
import type { MailMessage, MailTransport } from '@/mail/types.js';

export function createResendTransport(): MailTransport {
  let client: Resend | null = null;

  function get(): Resend {
    if (client) return client;
    if (!settings.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is required when MAIL_DRIVER=resend');
    }
    client = new Resend(settings.RESEND_API_KEY);
    return client;
  }

  return {
    name: 'resend',
    async send(message: MailMessage): Promise<void> {
      const { error } = await get().emails.send({
        from: settings.MAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? message.text,
      });
      if (error) throw new Error(`Resend failed: ${error.message}`);
    },
  };
}

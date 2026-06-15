import { settings } from '@/config.js';
import { createConsoleTransport } from '@/mail/drivers/console.js';
import { createResendTransport } from '@/mail/drivers/resend.js';
import { createSesTransport } from '@/mail/drivers/ses.js';
import { createSmtpTransport } from '@/mail/drivers/smtp.js';
import type { MailMessage, MailTransport } from '@/mail/types.js';

let transport: MailTransport | null = null;

function resolveTransport(): MailTransport {
  switch (settings.MAIL_DRIVER) {
    case 'smtp':
      return createSmtpTransport();
    case 'resend':
      return createResendTransport();
    case 'ses':
      return createSesTransport();
    case 'console':
      return createConsoleTransport();
  }
}

export function getMailTransport(): MailTransport {
  if (!transport) transport = resolveTransport();
  return transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  await getMailTransport().send(message);
}

import type { MailTransport } from '@/mail/types.js';

// Placeholder for a future AWS SES driver.
export function createSesTransport(): MailTransport {
  return {
    name: 'ses',
    async send(): Promise<void> {
      throw new Error('MAIL_DRIVER=ses is not implemented yet');
    },
  };
}

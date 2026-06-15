import type { MailMessage, MailTransport } from '@/mail/types.js';

export function createConsoleTransport(): MailTransport {
  return {
    name: 'console',
    async send(message: MailMessage): Promise<void> {
      console.info(`[mail:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
    },
  };
}

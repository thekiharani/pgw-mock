import { render } from 'react-email';

import { OtpEmail, type OtpEmailProps } from '@/mail/templates/otp-email.js';

export interface RenderedEmail {
  html: string;
  text: string;
}

export async function renderOtpEmail(props: OtpEmailProps): Promise<RenderedEmail> {
  const element = OtpEmail(props);
  const [html, text] = await Promise.all([
    render(element, { pretty: true }),
    render(element, { plainText: true }),
  ]);
  return { html, text };
}

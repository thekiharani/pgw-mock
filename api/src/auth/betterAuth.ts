import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';

import { settings } from '@/config.js';
import { db } from '@/db/client.js';
import { accounts, sessions, users, verifications } from '@/db/schema.js';
import { sendMail } from '@/mail/index.js';
import { renderOtpEmail } from '@/mail/templates/index.js';
import { uuid7 } from '@/utils/generators.js';

const socialProviders =
  settings.GOOGLE_CLIENT_ID && settings.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: settings.GOOGLE_CLIENT_ID,
          clientSecret: settings.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};

export const auth = betterAuth({
  baseURL: settings.AUTH_BASE_URL,
  basePath: '/api/auth',
  secret: settings.AUTH_SECRET,
  trustedOrigins: settings.AUTH_TRUSTED_ORIGINS,
  advanced: { database: { generateId: () => uuid7() } },
  database: drizzleAdapter(db, {
    provider: 'mysql',
    schema: { user: users, session: sessions, account: accounts, verification: verifications },
  }),
  socialProviders,
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      async sendVerificationOTP({ email, otp, type }) {
        const { html, text } = await renderOtpEmail({ otp, type, expiresInMinutes: 10 });
        await sendMail({
          to: email,
          subject: 'Your Noria Payments code',
          text,
          html,
        });
      },
    }),
  ],
});

export type Auth = typeof auth;

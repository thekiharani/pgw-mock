try {
  const path = process.env.DOTENV_CONFIG_PATH ?? '.env';
  process.loadEnvFile(path);
} catch {
  // no .env file is fine
}

function envStr(key: string, fallback: string): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function envOptional(key: string): string | null {
  const v = process.env[key];
  return v === undefined || v === '' ? null : v;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

function envFloat(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? fallback : n;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function envList(key: string, fallback: string[]): string[] {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface Settings {
  APP_HOST: string;
  APP_PORT: number;
  APP_RELOAD: boolean;
  LOG_LEVEL: string;
  LOG_REQUEST_BODIES: boolean;
  REQUEST_LOG_BODY_MAX_BYTES: number;
  HTTP_TIMEOUT_SECONDS: number;
  WEBHOOK_MAX_ATTEMPTS: number;
  WEBHOOK_RETRY_DELAY_SECONDS: number;
  SERVICE_URL: string;
  RELAXED_WAAS_KYC: boolean;
  STRICT_PROVIDER_AUTH: boolean;
  STRICT_PROVIDER_VALIDATION: boolean;
  MPESA_PASSKEY: string | null;
  MPESA_SECURITY_CREDENTIAL: string | null;
  MPESA_INITIATOR_NAME: string | null;
  MOCK_CALLBACK_DELAY_SECONDS: number;
  SERVE_DASHBOARD: boolean;
  DASHBOARD_DIST: string;
  AUTH_SECRET: string;
  AUTH_BASE_URL: string;
  AUTH_TRUSTED_ORIGINS: string[];
  DASHBOARD_URL: string;
  GOOGLE_CLIENT_ID: string | null;
  GOOGLE_CLIENT_SECRET: string | null;
  MAIL_DRIVER: 'console' | 'smtp' | 'resend' | 'ses';
  MAIL_FROM: string;
  SMTP_HOST: string | null;
  SMTP_PORT: number;
  SMTP_USER: string | null;
  SMTP_PASSWORD: string | null;
  SMTP_SECURE: boolean;
  RESEND_API_KEY: string | null;
  DATABASE_URL: string | null;
  DB_HOST: string;
  DB_PORT: number;
  DB_USER: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_CONNECTION_LIMIT: number;
  readonly databaseUrl: string;
}

function buildSettings(): Settings {
  const DATABASE_URL = envOptional('DATABASE_URL');
  const DB_HOST = envStr('DB_HOST', '127.0.0.1');
  const DB_PORT = envInt('DB_PORT', 5432);
  const DB_USER = envStr('DB_USER', 'postgres');
  const DB_PASSWORD = envStr('DB_PASSWORD', '');
  const DB_NAME = envStr('DB_NAME', 'pgw_mock');

  return {
    APP_HOST: envStr('APP_HOST', '0.0.0.0'),
    APP_PORT: envInt('APP_PORT', 4200),
    APP_RELOAD: envBool('APP_RELOAD', false),
    LOG_LEVEL: envStr('LOG_LEVEL', 'INFO'),
    LOG_REQUEST_BODIES: envBool('LOG_REQUEST_BODIES', false),
    REQUEST_LOG_BODY_MAX_BYTES: envInt('REQUEST_LOG_BODY_MAX_BYTES', 256),
    HTTP_TIMEOUT_SECONDS: envFloat('HTTP_TIMEOUT_SECONDS', 10),
    WEBHOOK_MAX_ATTEMPTS: envInt('WEBHOOK_MAX_ATTEMPTS', 2),
    WEBHOOK_RETRY_DELAY_SECONDS: envFloat('WEBHOOK_RETRY_DELAY_SECONDS', 1),
    SERVICE_URL: envStr('SERVICE_URL', 'http://127.0.0.1:4200'),
    RELAXED_WAAS_KYC: envBool('RELAXED_WAAS_KYC', false),
    STRICT_PROVIDER_AUTH: envBool('STRICT_PROVIDER_AUTH', true),
    STRICT_PROVIDER_VALIDATION: envBool('STRICT_PROVIDER_VALIDATION', true),
    MPESA_PASSKEY: envOptional('MPESA_PASSKEY'),
    MPESA_SECURITY_CREDENTIAL: envOptional('MPESA_SECURITY_CREDENTIAL'),
    MPESA_INITIATOR_NAME: envOptional('MPESA_INITIATOR_NAME'),
    MOCK_CALLBACK_DELAY_SECONDS: envFloat('MOCK_CALLBACK_DELAY_SECONDS', 0),
    SERVE_DASHBOARD: envBool('SERVE_DASHBOARD', false),
    DASHBOARD_DIST: envStr('DASHBOARD_DIST', './public'),
    AUTH_SECRET: envStr('AUTH_SECRET', 'dev-insecure-secret-change-me'),
    AUTH_BASE_URL: envStr('AUTH_BASE_URL', 'http://localhost:3200'),
    AUTH_TRUSTED_ORIGINS: envList('AUTH_TRUSTED_ORIGINS', ['http://localhost:3200']),
    // Public origin the dashboard is served from; used to build invite links.
    DASHBOARD_URL: envStr('DASHBOARD_URL', envStr('AUTH_BASE_URL', 'http://localhost:3200')),
    GOOGLE_CLIENT_ID: envOptional('GOOGLE_CLIENT_ID'),
    GOOGLE_CLIENT_SECRET: envOptional('GOOGLE_CLIENT_SECRET'),
    MAIL_DRIVER: envStr('MAIL_DRIVER', 'console') as Settings['MAIL_DRIVER'],
    MAIL_FROM: envStr('MAIL_FROM', 'Noria Payments Mock <no-reply@noria.local>'),
    SMTP_HOST: envOptional('SMTP_HOST'),
    SMTP_PORT: envInt('SMTP_PORT', 1025),
    SMTP_USER: envOptional('SMTP_USER'),
    SMTP_PASSWORD: envOptional('SMTP_PASSWORD'),
    SMTP_SECURE: envBool('SMTP_SECURE', false),
    RESEND_API_KEY: envOptional('RESEND_API_KEY'),
    DATABASE_URL,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_CONNECTION_LIMIT: envInt('DB_CONNECTION_LIMIT', 10),
    get databaseUrl(): string {
      if (DATABASE_URL) {
        return DATABASE_URL.replace(/^([a-z]+)\+[a-z0-9]+:\/\//i, '$1://');
      }
      const pwd = encodeURIComponent(DB_PASSWORD);
      return `postgresql://${DB_USER}:${pwd}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    },
  };
}

export const settings: Settings = buildSettings();

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
  PAYMENTS_SERVICE_URL: string;
  RELAXED_WAAS_KYC: boolean;
  STRICT_PROVIDER_AUTH: boolean;
  STRICT_PROVIDER_VALIDATION: boolean;
  MPESA_PASSKEY: string | null;
  MPESA_SECURITY_CREDENTIAL: string | null;
  MPESA_INITIATOR_NAME: string | null;
  MOCK_CALLBACK_DELAY_SECONDS: number;
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
  const DB_PORT = envInt('DB_PORT', 3306);
  const DB_USER = envStr('DB_USER', 'root');
  const DB_PASSWORD = envStr('DB_PASSWORD', '');
  const DB_NAME = envStr('DB_NAME', 'pgw_mock');

  return {
    APP_HOST: envStr('APP_HOST', '0.0.0.0'),
    APP_PORT: envInt('APP_PORT', 4002),
    APP_RELOAD: envBool('APP_RELOAD', false),
    LOG_LEVEL: envStr('LOG_LEVEL', 'INFO'),
    LOG_REQUEST_BODIES: envBool('LOG_REQUEST_BODIES', false),
    REQUEST_LOG_BODY_MAX_BYTES: envInt('REQUEST_LOG_BODY_MAX_BYTES', 256),
    HTTP_TIMEOUT_SECONDS: envFloat('HTTP_TIMEOUT_SECONDS', 10),
    WEBHOOK_MAX_ATTEMPTS: envInt('WEBHOOK_MAX_ATTEMPTS', 2),
    WEBHOOK_RETRY_DELAY_SECONDS: envFloat('WEBHOOK_RETRY_DELAY_SECONDS', 1),
    SERVICE_URL: envStr('SERVICE_URL', 'http://127.0.0.1:4002'),
    PAYMENTS_SERVICE_URL: envStr('PAYMENTS_SERVICE_URL', 'http://127.0.0.1:4001'),
    RELAXED_WAAS_KYC: envBool('RELAXED_WAAS_KYC', false),
    STRICT_PROVIDER_AUTH: envBool('STRICT_PROVIDER_AUTH', true),
    STRICT_PROVIDER_VALIDATION: envBool('STRICT_PROVIDER_VALIDATION', true),
    MPESA_PASSKEY: envOptional('MPESA_PASSKEY'),
    MPESA_SECURITY_CREDENTIAL: envOptional('MPESA_SECURITY_CREDENTIAL'),
    MPESA_INITIATOR_NAME: envOptional('MPESA_INITIATOR_NAME'),
    MOCK_CALLBACK_DELAY_SECONDS: envFloat('MOCK_CALLBACK_DELAY_SECONDS', 0),
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
      return `mysql://${DB_USER}:${pwd}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
    },
  };
}

export const settings: Settings = buildSettings();

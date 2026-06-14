/** Mirrors app/utils/generators.py. */
import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { ulid } from 'ulid';
import { v7 as uuidV7 } from 'uuid';

export function generateUlid(): string {
  return ulid().toLowerCase();
}

export function uuid7(): string {
  return uuidV7();
}

export function preUuid(prefix = ''): string {
  return `${prefix}${uuidV7().replace(/-/g, '')}`;
}

/**
 * SasaPay v1 access token — a HS256 JWT signed with a fake secret.
 * Mirrors generators.generate_token() (python-jose jwt.encode).
 */
export async function generateToken(): Promise<string> {
  const secret = new TextEncoder().encode('Fake Secret');
  return await new SignJWT({ id: 'Fake Merchant ID' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);
}

/** Daraja-style 32-char alphanumeric token. Mirrors generate_daraja_token(). */
export function generateDarajaToken(): string {
  const chunks: string[] = [];
  let length = 0;
  while (length < 32) {
    const b64 = randomBytes(24).toString('base64');
    const filtered = b64.replace(/[^a-zA-Z0-9]/g, '');
    chunks.push(filtered);
    length += filtered.length;
  }
  return chunks.join('').slice(0, 32);
}

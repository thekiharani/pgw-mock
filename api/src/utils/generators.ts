import { randomBytes } from 'node:crypto';
import { SignJWT } from 'jose';
import { v7 as uuidV7 } from 'uuid';

export function uuid7(): string {
  return uuidV7();
}

export function preUuid(prefix = ''): string {
  return `${prefix}${uuidV7().replace(/-/g, '')}`;
}

export async function generateToken(subject?: string): Promise<string> {
  const secret = new TextEncoder().encode('Fake Secret');
  return await new SignJWT({ id: subject ?? 'Fake Merchant ID' })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(randomBytes(16).toString('hex'))
    .setExpirationTime('1h')
    .sign(secret);
}

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

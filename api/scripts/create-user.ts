/**
 * Create a console user (admin by default) straight against the database.
 *
 * It reuses the exact same building blocks the console "New user" flow uses —
 * `createUser` / `emailExists` from the admin actions, `uuid7` for the id — so a
 * user made here is indistinguishable from one made in the UI. Auth is email-OTP
 * only (no password): we preset `email_verified`, so the new user just requests a
 * code on the login screen and signs in.
 *
 * Three ways to provide the details (first match wins):
 *   1. --file <path>     read JSON from a file
 *   2. --json '<json>'   inline JSON on the command line
 *   3. piped stdin       echo '<json>' | pnpm user:create
 *   4. (none of the above, and a terminal) interactive prompts
 *
 * The JSON is either one object or an array of them:
 *   { "name": "Jane Doe", "email": "jane@noria.co.ke", "role": "admin" }
 *   [ { "name": "...", "email": "..." }, { "name": "...", "email": "...", "role": "user" } ]
 *
 * `role` is optional and defaults to "admin". Run with:
 *   pnpm --dir api user:create
 *   pnpm --dir api user:create --file ./new-admin.json
 *   pnpm --dir api user:create --json '{"name":"Jane","email":"jane@noria.co.ke"}'
 */
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import type { PlatformRole } from '@shared/dto/admin.js';

import { db, pool } from '@/db/client.js';
import { createUser, emailExists } from '@/actions/admin.js';
import { uuid7 } from '@/utils/generators.js';

interface UserInput {
  name: string;
  email: string;
  role?: string;
}

const ROLES: PlatformRole[] = ['user', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --flag <value> pairs; unknown flags are ignored.
function readFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Decide where the payload comes from, in priority order. Returns null when we
// should fall through to interactive prompts.
async function loadPayload(): Promise<string | null> {
  const file = readFlag('--file');
  if (file) return readFile(file, 'utf8');

  const inline = readFlag('--json');
  if (inline) return inline;

  // Data piped in (not a TTY) — read it all from stdin.
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text) return text;
  }

  return null;
}

async function promptForUser(): Promise<UserInput> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const name = (await rl.question('Full name: ')).trim();
    const email = (await rl.question('Email: ')).trim();
    const role = (await rl.question('Role [admin]: ')).trim() || 'admin';
    return { name, email, role };
  } finally {
    rl.close();
  }
}

// Validate + normalise one record. Throws with a clear message on bad input.
function normalise(raw: UserInput): { name: string; email: string; role: PlatformRole } {
  const name = (raw.name ?? '').trim();
  const email = (raw.email ?? '').trim().toLowerCase();
  const role = ((raw.role ?? 'admin') as string).trim().toLowerCase();

  if (!name) throw new Error('name is required');
  if (!EMAIL_RE.test(email)) throw new Error(`invalid email: ${JSON.stringify(raw.email)}`);
  if (!ROLES.includes(role as PlatformRole)) {
    throw new Error(`role must be one of ${ROLES.join(' | ')} (got ${JSON.stringify(raw.role)})`);
  }
  return { name, email, role: role as PlatformRole };
}

async function main(): Promise<void> {
  const payload = await loadPayload();

  let inputs: UserInput[];
  if (payload) {
    const parsed: unknown = JSON.parse(payload);
    inputs = Array.isArray(parsed) ? (parsed as UserInput[]) : [parsed as UserInput];
  } else {
    inputs = [await promptForUser()];
  }

  if (inputs.length === 0) throw new Error('no users to create');

  let created = 0;
  for (const raw of inputs) {
    const user = normalise(raw);

    if (await emailExists(db, user.email)) {
      console.warn(`↷ skip ${user.email} — a user with that email already exists`);
      continue;
    }

    const id = uuid7();
    await createUser(db, { id, ...user });
    created += 1;
    console.info(`✓ created ${user.role} ${user.email} (${id})`);
  }

  console.info(
    created > 0
      ? `\nDone. ${created} user(s) created. They sign in at the console with an email-OTP code — no password.`
      : '\nNothing created.',
  );
}

main()
  .catch((err: unknown) => {
    console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

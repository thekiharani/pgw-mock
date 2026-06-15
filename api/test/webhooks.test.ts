import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const { postWebhook } =
  await vi.importActual<typeof import('@/utils/webhooks.js')>('@/utils/webhooks.js');

let server: Server;
let base: string;

type Handler = (path: string) => { status: number; body: string; contentType?: string };
let handler: Handler = () => ({
  status: 200,
  body: '{"ok":true}',
  contentType: 'application/json',
});

beforeAll(async () => {
  server = createServer((req, res) => {
    const out = handler(req.url ?? '/');
    res.writeHead(out.status, { 'content-type': out.contentType ?? 'application/json' });
    res.end(out.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('postWebhook', () => {
  it('returns 200 with parsed dict body', async () => {
    handler = () => ({ status: 200, body: '{"received":true}' });
    const res = await postWebhook(`${base}/ok`, { a: 1 });
    expect(res.status).toBe(200);
    expect(res.attempts).toBe(1);
    expect(res.body).toEqual({ received: true });
    expect(res.message).toContain('Webhook sent to');
  });

  it('normalizes a non-dict JSON body to null', async () => {
    handler = () => ({ status: 200, body: '[1,2,3]' });
    const res = await postWebhook(`${base}/arr`, {});
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('normalizes a non-JSON body to null', async () => {
    handler = () => ({ status: 200, body: 'plain text', contentType: 'text/plain' });
    const res = await postWebhook(`${base}/text`, {});
    expect(res.body).toBeNull();
  });

  it('non-2xx returns its status without retrying', async () => {
    handler = () => ({ status: 500, body: '{"err":true}' });
    const res = await postWebhook(`${base}/fail`, {});
    expect(res.status).toBe(500);
    expect(res.attempts).toBe(1);
  });

  it('unreachable host retries then reports failure', async () => {
    const res = await postWebhook('http://127.0.0.1:1/never', {});
    expect(res.status).toBe(500);
    expect(res.attempts).toBe(2);
    expect(res.body).toBeNull();
    expect(res.message).toContain('Webhook failed to send to');
  });
});

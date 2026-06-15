import { resolve } from 'node:path';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

import { settings } from '@/config.js';

const API_PREFIXES = [
  '/api',
  '/mpesa',
  '/sasapay',
  '/mock',
  '/docs',
  '/openapi.json',
  '/ping',
  '/healthz',
  '/readyz',
];

export function isApiPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// Serve the built dashboard (SPA) as static assets. The history fallback to
// index.html lives in the not-found handler so client routes resolve.
export function registerDashboard(app: FastifyInstance): void {
  if (!settings.SERVE_DASHBOARD) return;
  app.register(fastifyStatic, {
    root: resolve(process.cwd(), settings.DASHBOARD_DIST),
    prefix: '/',
    wildcard: false,
  });
}

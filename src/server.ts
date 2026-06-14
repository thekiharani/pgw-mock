import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import ScalarApiReference from '@scalar/fastify-api-reference';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { settings } from '@/config.js';
import { registerErrorHandlers } from '@/plugins/errorHandler.js';
import { registerRequestLogger } from '@/plugins/requestLogger.js';
import { registerBackgroundTasks } from '@/utils/background.js';
import { billManagerRoutes } from '@/routes/billManager.js';
import { homeRoutes } from '@/routes/home.js';
import { mockAdminRoutes } from '@/routes/mockAdmin.js';
import { oauthRoutes } from '@/routes/oauth.js';
import { b2bExpressRoutes } from '@/routes/mpesa/b2bExpress.js';
import { mpesaCoreRoutes } from '@/routes/mpesa/index.js';
import { standingOrderRoutes } from '@/routes/mpesa/standingOrder.js';
import { sasapayV1Routes } from '@/routes/sasapay/index.js';
import { waasV2Routes } from '@/routes/sasapay/waas.js';

const LOG_LEVELS: Record<string, string> = {
  CRITICAL: 'fatal',
  ERROR: 'error',
  WARNING: 'warn',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

function gatewayTag(url: string): string {
  if (url.startsWith('/sasapay')) return 'SasaPay';
  if (url.startsWith('/mpesa')) return 'M-Pesa';
  return 'Shared';
}

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const level = LOG_LEVELS[settings.LOG_LEVEL.toUpperCase()] ?? 'info';
  const app = Fastify({
    logger: opts.logger === false ? false : { level },
    bodyLimit: 10 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addContentTypeParser('*', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, body);
    }
  });

  app.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  });

  registerBackgroundTasks(app);
  registerRequestLogger(app);
  registerErrorHandlers(app);

  // Tag each route by gateway (from its URL prefix) so the docs group by provider.
  app.addHook('onRoute', (route) => {
    route.schema ??= {};
    const schema = route.schema as { hide?: boolean; tags?: string[] };
    if (schema.hide || schema.tags) return;
    schema.tags = [gatewayTag(route.url)];
  });

  // OpenAPI generated from the Zod route schemas; must be registered before routes.
  app.register(swagger, {
    openapi: {
      info: { title: 'Noria Payments API Mock', version: '0.1.0' },
      tags: [
        { name: 'M-Pesa', description: 'Safaricom Daraja (M-Pesa) gateway endpoints' },
        { name: 'SasaPay', description: 'SasaPay gateway endpoints (v1 + WaaS v2)' },
        { name: 'Shared', description: 'Health checks, root, and mock-server controls' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  app.register(homeRoutes);
  app.register(mockAdminRoutes, { prefix: '/mock' });

  // M-Pesa: gateway `/mpesa` + the official Daraja path verbatim (swap host
  // api.safaricom.co.ke -> <mock>/mpesa). Daraja's transactional paths already
  // start with /mpesa, so those become /mpesa/mpesa/...; oauth/standingorder don't.
  app.register(oauthRoutes, { prefix: '/mpesa/oauth' });
  app.register(mpesaCoreRoutes, { prefix: '/mpesa/mpesa' });
  app.register(b2bExpressRoutes, { prefix: '/mpesa' });
  app.register(standingOrderRoutes, { prefix: '/mpesa' });
  app.register(billManagerRoutes, { prefix: '/mpesa/v1/billmanager-invoice' });

  // SasaPay: gateway `/sasapay` + official path (host swap keeps /api/v1, /api/v2/waas).
  app.register(sasapayV1Routes, { prefix: '/sasapay/api/v1' });
  app.register(waasV2Routes, { prefix: '/sasapay/api/v2/waas' });

  app.register(ScalarApiReference, { routePrefix: '/docs' });
  app.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());

  return app;
}

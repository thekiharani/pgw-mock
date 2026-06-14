/** Builds the Fastify app. Mirrors create_app() in app/main.py. */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { settings } from './config.js';
import { registerErrorHandlers } from './plugins/errorHandler.js';
import { registerRequestLogger } from './plugins/requestLogger.js';
import { registerBackgroundTasks } from './utils/background.js';
import { billManagerRoutes } from './routes/billManager.js';
import { homeRoutes } from './routes/home.js';
import { mockAdminRoutes } from './routes/mockAdmin.js';
import { oauthRoutes } from './routes/oauth.js';
import { b2bExpressRoutes } from './routes/mpesa/b2bExpress.js';
import { mpesaCoreRoutes } from './routes/mpesa/index.js';
import { standingOrderRoutes } from './routes/mpesa/standingOrder.js';
import { sasapayV1Routes } from './routes/sasapay/index.js';
import { waasV2Routes } from './routes/sasapay/waas.js';

const LOG_LEVELS: Record<string, string> = {
  CRITICAL: 'fatal',
  ERROR: 'error',
  WARNING: 'warn',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
};

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const level = LOG_LEVELS[settings.LOG_LEVEL.toUpperCase()] ?? 'info';
  const app = Fastify({
    logger: opts.logger === false ? false : { level },
    bodyLimit: 10 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Permissive parser so undocumented/non-JSON bodies (Bill Manager fallback)
  // don't 415 — mirrors FastAPI reading request.json() best-effort.
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

  // Root-mounted routers.
  app.register(homeRoutes);
  app.register(oauthRoutes, { prefix: '/oauth' });
  app.register(mockAdminRoutes, { prefix: '/mock' });
  app.register(billManagerRoutes, { prefix: '/v1/billmanager-invoice' });

  // M-Pesa core under /mpesa, plus the mirrored /mpesa/mpesa namespace.
  app.register(mpesaCoreRoutes, { prefix: '/mpesa' });
  app.register(mpesaCoreRoutes, { prefix: '/mpesa/mpesa' });

  // Daraja endpoints that live at the service root and under /mpesa.
  app.register(b2bExpressRoutes);
  app.register(standingOrderRoutes);
  app.register(b2bExpressRoutes, { prefix: '/mpesa' });
  app.register(standingOrderRoutes, { prefix: '/mpesa' });

  // Daraja OAuth mirror under /mpesa/oauth.
  app.register(oauthRoutes, { prefix: '/mpesa/oauth' });

  // SasaPay v1 + WaaS v2.
  app.register(sasapayV1Routes, { prefix: '/sasapay/api/v1' });
  app.register(waasV2Routes, { prefix: '/sasapay/api/v2/waas' });

  return app;
}

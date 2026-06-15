import type { FastifyError, FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

import { settings } from '@/config.js';
import { AppError } from '@/errors.js';
import { isApiPath } from '@/plugins/dashboard.js';

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    // History fallback: serve the SPA shell for unmatched browser navigations.
    if (
      settings.SERVE_DASHBOARD &&
      request.method === 'GET' &&
      !isApiPath(request.url) &&
      String(request.headers.accept ?? '').includes('text/html')
    ) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ status: false, message: 'Route not found' });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      request.log.warn(`Validation error on ${request.method} ${request.url}`);
      return reply.code(422).send({
        status: false,
        message: 'Validation error',
        errors: error.validation.map((v) => ({
          path: v.instancePath,
          message: v.message,
          ...(v.params ?? {}),
        })),
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response serialization error');
      return reply.code(500).send({ status: false, message: 'Internal server error' });
    }

    if (error instanceof AppError) {
      request.log.warn(`Application error on ${request.method} ${request.url}: ${error.message}`);
      return reply.code(error.statusCode).send(error.payload);
    }

    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ status: false, message: error.message });
    }

    request.log.error({ err: error }, `Unhandled error on ${request.method} ${request.url}`);
    return reply.code(500).send({ status: false, message: 'Internal server error' });
  });
}

/** Global error handlers. Mirrors the exception handlers in app/main.py. */
import type { FastifyError, FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

import { AppError } from '../errors.js';

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ status: false, message: 'Route not found' });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Request body/params/query validation failures (Zod type provider).
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

    // Fastify's own body parse / generic 4xx (e.g. malformed JSON).
    if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ status: false, message: error.message });
    }

    request.log.error({ err: error }, `Unhandled error on ${request.method} ${request.url}`);
    return reply.code(500).send({ status: false, message: 'Internal server error' });
  });
}

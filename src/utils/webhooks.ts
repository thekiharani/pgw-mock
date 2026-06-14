/** Mirrors app/utils/webhooks.py. */
import { settings } from '../config.js';

const log = console;

export interface WebhookResult {
  message: string;
  status: number;
  attempts: number;
  body: Record<string, any> | null;
}

const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));

export async function postWebhook(url: string, data: Record<string, any>): Promise<WebhookResult> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= settings.WEBHOOK_MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), settings.HTTP_TIMEOUT_SECONDS * 1000);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      log.info(`Webhook sent to ${url} status=${response.status} attempt=${attempt}`);
      let body: Record<string, any> | null = null;
      try {
        const parsed = await response.json();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body = parsed as Record<string, any>;
        }
      } catch {
        body = null;
      }
      return {
        message: `Webhook sent to ${url}`,
        status: response.status,
        attempts: attempt,
        body,
      };
    } catch (exc) {
      lastError = exc;
      log.warn(
        `Webhook attempt ${attempt}/${settings.WEBHOOK_MAX_ATTEMPTS} failed for ${url}: ${exc}`,
      );
      if (attempt < settings.WEBHOOK_MAX_ATTEMPTS) {
        await sleep(settings.WEBHOOK_RETRY_DELAY_SECONDS);
      }
    }
  }

  log.error(
    `Webhook failed after ${settings.WEBHOOK_MAX_ATTEMPTS} attempts to ${url}: ${lastError}`,
  );
  return {
    message: `Webhook failed to send to ${url}`,
    status: 500,
    attempts: settings.WEBHOOK_MAX_ATTEMPTS,
    body: null,
  };
}

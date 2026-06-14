import { settings } from '@/config.js';
import { buildApp } from '@/server.js';

const app = buildApp();

app
  .listen({ host: settings.APP_HOST, port: settings.APP_PORT })
  .then(() => {
    app.log.info(`Noria Payments API Mock listening on ${settings.APP_HOST}:${settings.APP_PORT}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    app.close().then(() => process.exit(0));
  });
}

import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createAnalyticsRouter } from './routes/analytics.routes';

const config = loadConfig('analytics-service', 3013);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createAnalyticsRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start analytics service:', error);
  process.exit(1);
});

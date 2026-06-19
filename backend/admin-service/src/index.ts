import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createAdminRouter } from './routes/admin.routes';

const config = loadConfig('admin-service', 3015);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createAdminRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start admin service:', error);
  process.exit(1);
});

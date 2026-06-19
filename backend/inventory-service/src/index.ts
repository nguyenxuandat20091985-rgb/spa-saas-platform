import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createInventoryRouter } from './routes/inventory.routes';

const config = loadConfig('inventory-service', 3005);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createInventoryRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start inventory service:', error);
  process.exit(1);
});

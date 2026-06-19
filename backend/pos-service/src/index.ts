import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createPosRouter } from './routes/pos.routes';

const config = loadConfig('pos-service', 3004);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createPosRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start POS service:', error);
  process.exit(1);
});

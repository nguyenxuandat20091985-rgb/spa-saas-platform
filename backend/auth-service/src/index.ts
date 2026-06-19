import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createAuthRouter } from './routes/auth.routes';

const config = loadConfig('auth-service', 3001);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createAuthRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start auth service:', error);
  process.exit(1);
});

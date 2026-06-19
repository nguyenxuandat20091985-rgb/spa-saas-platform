import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createAiRouter } from './routes/ai.routes';

const config = loadConfig('ai-gateway', 3010);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createAiRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start AI gateway:', error);
  process.exit(1);
});

import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createCrmRouter } from './routes/crm.routes';

const config = loadConfig('crm-service', 3006);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createCrmRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start CRM service:', error);
  process.exit(1);
});

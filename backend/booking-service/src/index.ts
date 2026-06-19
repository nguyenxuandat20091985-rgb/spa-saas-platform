import { loadConfig } from '../../shared/config';
import { createServer } from '../../shared/utils/base-server';
import { createBookingRouter } from './routes/booking.routes';

const config = loadConfig('booking-service', 3003);

async function main(): Promise<void> {
  const { start } = await createServer(config, (deps) => createBookingRouter(deps));
  await start();
}

main().catch((error) => {
  console.error('Failed to start booking service:', error);
  process.exit(1);
});

import path from 'node:path';
import { createApp } from './app';
import { openLedger } from './ledger';
import { openRequests } from './requests';

const port = Number(process.env.PORT ?? 3000);
const internalPort = Number(process.env.INTERNAL_PORT ?? 3001);
const dbPath = process.env.LEDGER_DB_PATH ?? './data/ledger.db';
const dataDir = path.dirname(dbPath);
let ledger: ReturnType<typeof openLedger>;
let store: ReturnType<typeof openRequests>;
try {
  ledger = openLedger(dbPath);
  store = openRequests(process.env.REQUESTS_DB_PATH ?? path.join(dataDir, 'requests.db'));
} catch (err) {
  console.error(`[db] could not open the databases in ${dataDir}:`, err);
  process.exit(1);
}
const workerToken = process.env.WORKER_TOKEN || undefined;
const { httpServer, internalApp } = createApp({
  ledger,
  requests: {
    store,
    adminEmail: process.env.REQUESTS_ADMIN_EMAIL,
    workerToken,
    shotsDir: process.env.REQUEST_SHOTS_DIR ?? path.join(dataDir, 'request-shots'),
  },
});
httpServer.listen(port, () => {
  console.log(`Poker server em http://localhost:${port}`);
});
// The worker API stays off unless a token is configured; the host publishes this port on loopback only.
if (workerToken && internalApp) {
  internalApp.listen(internalPort, () => console.log(`[requests] worker API on :${internalPort}`));
}

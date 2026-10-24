import { createApp } from './app';
import { openLedger } from './ledger';

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.LEDGER_DB_PATH ?? './data/ledger.db';
let ledger: ReturnType<typeof openLedger>;
try {
  ledger = openLedger(dbPath);
} catch (err) {
  console.error(`[ledger] could not open ${dbPath}:`, err);
  process.exit(1);
}
const { httpServer } = createApp({ ledger });
httpServer.listen(port, () => {
  console.log(`Poker server em http://localhost:${port}`);
});

import { createApp } from './app';
import { openLedger } from './ledger';

const port = Number(process.env.PORT ?? 3000);
const ledger = openLedger(process.env.LEDGER_DB_PATH ?? './data/ledger.db');
const { httpServer } = createApp({ ledger });
httpServer.listen(port, () => {
  console.log(`Poker server em http://localhost:${port}`);
});

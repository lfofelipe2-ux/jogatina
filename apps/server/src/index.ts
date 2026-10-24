import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
const { httpServer } = createApp();
httpServer.listen(port, () => {
  console.log(`Poker server em http://localhost:${port}`);
});

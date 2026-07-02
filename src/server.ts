import { createApp } from './app.js';
import { createDb } from './db.js';

const porta = Number(process.env.PORT ?? 3000);
const db = createDb();
const app = createApp(db);

app.listen(porta, () => {
  console.log(`Logística rodando em http://localhost:${porta}`);
});

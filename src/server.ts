import os from 'node:os';
import { createApp } from './app.js';
import { createDb } from './db.js';

const porta = Number(process.env.PORT ?? 3000);
const db = createDb();
const app = createApp(db);

app.listen(porta, () => {
  console.log(`Controle de Fretes rodando:`);
  console.log(`  Neste computador:  http://localhost:${porta}`);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const rede of interfaces ?? []) {
      if (rede.family === 'IPv4' && !rede.internal) {
        console.log(`  No celular (mesma rede Wi-Fi):  http://${rede.address}:${porta}`);
      }
    }
  }
});

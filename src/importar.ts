/**
 * Importa a planilha de fretes pela linha de comando.
 *
 * Uso: npm run importar -- caminho/para/planilha.xlsx
 */
import fs from 'node:fs';
import { createDb } from './db.js';
import { importarPlanilha } from './importar-planilha.js';

const caminho = process.argv[2];
if (!caminho) {
  console.error('Uso: npm run importar -- caminho/para/planilha.xlsx');
  process.exit(1);
}

const db = createDb();
const { importados, ignorados } = importarPlanilha(db, fs.readFileSync(caminho));
console.log(`Importação concluída: ${importados} fretes importados, ${ignorados} linhas ignoradas.`);

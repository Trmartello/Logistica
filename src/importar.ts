/**
 * Importa a planilha de fretes (formato "BASE DADOS") para o banco.
 *
 * Uso: npm run importar -- caminho/para/planilha.xlsx
 *
 * Colunas esperadas: Motorista | PLACA / CC | DATA | MÊS | ORIGEM | DESTINO |
 * NOTA | PESO | FRETE VALOR | FRETE PESO NF | FRETE TOTAL
 * O campo NOTA aceita múltiplas notas separadas por "/", "," ou ";".
 */
import XLSX from 'xlsx';
import { createDb } from './db.js';

const caminho = process.argv[2];
if (!caminho) {
  console.error('Uso: npm run importar -- caminho/para/planilha.xlsx');
  process.exit(1);
}

function serialParaData(serial: number): string {
  // Datas do Excel: dias desde 1899-12-30
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString().slice(0, 10);
}

function extrairNotas(celula: unknown): string[] {
  if (celula == null || celula === '') return [];
  return String(celula)
    .split(/[/,;]/)
    .map((n) => n.trim())
    .filter((n) => n !== '');
}

const planilha = XLSX.readFile(caminho);
const primeiraAba = planilha.SheetNames[0];
if (!primeiraAba) {
  console.error('Planilha sem abas.');
  process.exit(1);
}
const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha.Sheets[primeiraAba]!, {
  header: 1,
  raw: true,
});

const db = createDb();
const insereFrete = db.prepare(
  `INSERT INTO fretes (motorista, placa_cc, data, origem, destino, peso_ton, valor_ton, frete_total)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insereNota = db.prepare('INSERT INTO notas (frete_id, numero) VALUES (?, ?)');

let importados = 0;
let ignorados = 0;

db.exec('BEGIN');
for (const linha of linhas.slice(1)) {
  const [motorista, placaCc, data, , origem, destino, nota, peso, valorTon, , freteTotal] = linha;
  if (motorista == null || String(motorista).trim() === '') continue;

  if (typeof data !== 'number' || origem == null || destino == null || valorTon == null) {
    ignorados++;
    console.warn(`Linha ignorada (dados incompletos): ${JSON.stringify(linha).slice(0, 120)}`);
    continue;
  }

  const resultado = insereFrete.run(
    String(motorista).trim(),
    placaCc != null ? String(placaCc).trim() : null,
    serialParaData(data),
    String(origem).trim(),
    String(destino).trim(),
    typeof peso === 'number' ? peso : null,
    Number(valorTon),
    freteTotal != null ? Number(freteTotal) : Number(valorTon) * 34
  );
  for (const numero of extrairNotas(nota)) {
    insereNota.run(resultado.lastInsertRowid as number, numero);
  }
  importados++;
}
db.exec('COMMIT');

console.log(`Importação concluída: ${importados} fretes importados, ${ignorados} linhas ignoradas.`);

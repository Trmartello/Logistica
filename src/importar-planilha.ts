/**
 * Importação da planilha de fretes (formato "BASE DADOS") a partir de um
 * buffer .xlsx — usada pela linha de comando (importar.ts) e pela tela
 * do sistema (POST /api/importar).
 *
 * Colunas esperadas: Motorista | PLACA / CC | DATA | MÊS | ORIGEM | DESTINO |
 * NOTA | PESO | FRETE VALOR | FRETE PESO NF | FRETE TOTAL
 * O campo NOTA aceita múltiplas notas separadas por "/", "," ou ";".
 */
import XLSX from 'xlsx';
import type { DatabaseSync } from 'node:sqlite';
import { cadastrarLocaisDosFretes } from './db.js';

export interface ResultadoImportacao {
  importados: number;
  ignorados: number;
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

export function importarPlanilha(
  db: DatabaseSync,
  conteudo: Buffer,
  opcoes: { limparAntes?: boolean } = {}
): ResultadoImportacao {
  const planilha = XLSX.read(conteudo, { type: 'buffer' });
  const primeiraAba = planilha.SheetNames[0];
  if (!primeiraAba) throw new Error('Planilha sem abas');
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(planilha.Sheets[primeiraAba]!, {
    header: 1,
    raw: true,
  });

  const cabecalho = (linhas[0] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
  if (!cabecalho.some((c) => c.startsWith('motorista'))) {
    throw new Error('Formato não reconhecido: a primeira linha deve ter a coluna "Motorista"');
  }

  const insereFrete = db.prepare(
    `INSERT INTO fretes (motorista, placa_cc, data, origem, destino, peso_ton, valor_ton, frete_total)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insereNota = db.prepare('INSERT INTO notas (frete_id, numero) VALUES (?, ?)');

  let importados = 0;
  let ignorados = 0;

  db.exec('BEGIN');
  try {
    if (opcoes.limparAntes) db.exec('DELETE FROM fretes');

    for (const linha of linhas.slice(1)) {
      const [motorista, placaCc, data, , origem, destino, nota, peso, valorTon, , freteTotal] =
        linha;
      if (motorista == null || String(motorista).trim() === '') continue;

      if (typeof data !== 'number' || origem == null || destino == null || valorTon == null) {
        ignorados++;
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

    cadastrarLocaisDosFretes(db);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }

  return { importados, ignorados };
}

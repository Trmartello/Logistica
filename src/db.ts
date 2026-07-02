import { DatabaseSync } from 'node:sqlite';
import { FILIAIS, MUNICIPIOS } from './dados/locais.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fretes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  motorista   TEXT NOT NULL,
  placa_cc    TEXT,
  data        TEXT NOT NULL,             -- YYYY-MM-DD
  origem      TEXT NOT NULL,
  destino     TEXT NOT NULL,
  peso_ton    REAL,                      -- peso real da carga, em toneladas
  valor_ton   REAL,                      -- R$ por tonelada (NULL = valor pendente de lançamento)
  frete_total REAL,                      -- R$ cobrado (padrão: 34 t × valor_ton)
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notas (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  frete_id INTEGER NOT NULL REFERENCES fretes(id) ON DELETE CASCADE,
  numero   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locais (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT NOT NULL UNIQUE,
  tipo  TEXT NOT NULL CHECK (tipo IN ('FILIAL', 'MUNICIPIO')),
  ordem INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fretes_data ON fretes(data);
CREATE INDEX IF NOT EXISTS idx_fretes_motorista ON fretes(motorista);
CREATE INDEX IF NOT EXISTS idx_notas_frete ON notas(frete_id);
CREATE INDEX IF NOT EXISTS idx_notas_numero ON notas(numero);
`;

/** Peso de cobrança padrão: capacidade do caminhão (34 t). */
export const PESO_COBRANCA_PADRAO_TON = 34;

/**
 * Bancos criados antes do suporte a "valor pendente" têm valor_ton/frete_total
 * como NOT NULL. O SQLite não permite remover a restrição diretamente, então a
 * tabela é reconstruída preservando os dados.
 */
function migrarValorOpcional(db: DatabaseSync): void {
  const coluna = db
    .prepare(`SELECT "notnull" AS obrigatorio FROM pragma_table_info('fretes') WHERE name = 'valor_ton'`)
    .get() as { obrigatorio: number } | undefined;
  if (!coluna || coluna.obrigatorio === 0) return;

  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec('BEGIN');
  try {
    db.exec(`
      CREATE TABLE fretes_novo (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        motorista   TEXT NOT NULL,
        placa_cc    TEXT,
        data        TEXT NOT NULL,
        origem      TEXT NOT NULL,
        destino     TEXT NOT NULL,
        peso_ton    REAL,
        valor_ton   REAL,
        frete_total REAL,
        criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO fretes_novo SELECT * FROM fretes;
      DROP TABLE fretes;
      ALTER TABLE fretes_novo RENAME TO fretes;
      CREATE INDEX IF NOT EXISTS idx_fretes_data ON fretes(data);
      CREATE INDEX IF NOT EXISTS idx_fretes_motorista ON fretes(motorista);
    `);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

/**
 * Cadastra os locais fixos (filiais e municípios-UF). A tabela é somente de
 * referência: se a quantidade gravada divergir das listas do código (ex.:
 * banco semeado com uma versão anterior), ela é reconstruída.
 */
function semearLocais(db: DatabaseSync): void {
  const contagem = db
    .prepare(
      `SELECT
         SUM(CASE tipo WHEN 'FILIAL' THEN 1 ELSE 0 END) AS filiais,
         SUM(CASE tipo WHEN 'MUNICIPIO' THEN 1 ELSE 0 END) AS municipios
       FROM locais`
    )
    .get() as { filiais: number | null; municipios: number | null };
  if (contagem.filiais === FILIAIS.length && contagem.municipios === MUNICIPIOS.length) return;

  const insere = db.prepare('INSERT INTO locais (nome, tipo, ordem) VALUES (?, ?, ?)');
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM locais');
    FILIAIS.forEach((nome, indice) => insere.run(nome, 'FILIAL', indice));
    MUNICIPIOS.forEach((nome, indice) => insere.run(nome, 'MUNICIPIO', indice));
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

export function createDb(path: string = process.env.DB_PATH ?? 'logistica.db'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrarValorOpcional(db);
  semearLocais(db);
  return db;
}

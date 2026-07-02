import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fretes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  motorista   TEXT NOT NULL,
  placa_cc    TEXT,
  data        TEXT NOT NULL,             -- YYYY-MM-DD
  origem      TEXT NOT NULL,
  destino     TEXT NOT NULL,
  peso_ton    REAL,                      -- peso real da carga, em toneladas
  valor_ton   REAL NOT NULL,             -- R$ por tonelada
  frete_total REAL NOT NULL,             -- R$ cobrado (padrão: 34 t × valor_ton)
  criado_em   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notas (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  frete_id INTEGER NOT NULL REFERENCES fretes(id) ON DELETE CASCADE,
  numero   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fretes_data ON fretes(data);
CREATE INDEX IF NOT EXISTS idx_fretes_motorista ON fretes(motorista);
CREATE INDEX IF NOT EXISTS idx_notas_frete ON notas(frete_id);
CREATE INDEX IF NOT EXISTS idx_notas_numero ON notas(numero);
`;

/** Peso de cobrança padrão: capacidade do caminhão (34 t). */
export const PESO_COBRANCA_PADRAO_TON = 34;

export function createDb(path: string = process.env.DB_PATH ?? 'logistica.db'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

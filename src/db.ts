import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clientes (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  email     TEXT,
  telefone  TEXT,
  endereco  TEXT
);

CREATE TABLE IF NOT EXISTS motoristas (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  nome      TEXT NOT NULL,
  cnh       TEXT NOT NULL UNIQUE,
  telefone  TEXT
);

CREATE TABLE IF NOT EXISTS veiculos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  placa         TEXT NOT NULL UNIQUE,
  modelo        TEXT,
  capacidade_kg REAL
);

CREATE TABLE IF NOT EXISTS entregas (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo        TEXT NOT NULL UNIQUE,
  cliente_id    INTEGER NOT NULL REFERENCES clientes(id),
  motorista_id  INTEGER REFERENCES motoristas(id),
  veiculo_id    INTEGER REFERENCES veiculos(id),
  origem        TEXT NOT NULL,
  destino       TEXT NOT NULL,
  peso_kg       REAL,
  status        TEXT NOT NULL DEFAULT 'PENDENTE',
  criada_em     TEXT NOT NULL DEFAULT (datetime('now')),
  atualizada_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eventos_entrega (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entrega_id    INTEGER NOT NULL REFERENCES entregas(id) ON DELETE CASCADE,
  status        TEXT NOT NULL,
  observacao    TEXT,
  registrado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas(status);
CREATE INDEX IF NOT EXISTS idx_eventos_entrega ON eventos_entrega(entrega_id);
`;

export function createDb(path: string = process.env.DB_PATH ?? 'logistica.db'): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

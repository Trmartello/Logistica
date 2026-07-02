import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { FILIAIS, MUNICIPIOS } from './dados/locais.js';

/**
 * Caminho padrão do banco: respeita DB_PATH; sem ela, usa automaticamente o
 * volume persistente /data quando existir (Railway/Fly.io) — assim a
 * hospedagem funciona sem configurar variável nenhuma.
 */
function caminhoPadraoBanco(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    if (fs.statSync('/data').isDirectory()) return '/data/logistica.db';
  } catch {
    // /data não existe — uso local
  }
  return 'logistica.db';
}

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
  tipo  TEXT NOT NULL CHECK (tipo IN ('FILIAL', 'MUNICIPIO', 'PERSONALIZADO')),
  ordem INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fretes_data ON fretes(data);
CREATE INDEX IF NOT EXISTS idx_fretes_motorista ON fretes(motorista);
CREATE INDEX IF NOT EXISTS idx_notas_frete ON notas(frete_id);
CREATE INDEX IF NOT EXISTS idx_notas_numero ON notas(numero);
`;

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

/** Bancos criados antes do tipo PERSONALIZADO têm um CHECK que o rejeita. */
function migrarLocaisPersonalizados(db: DatabaseSync): void {
  const definicao = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'locais'")
    .get() as { sql: string } | undefined;
  if (definicao && !definicao.sql.includes('PERSONALIZADO')) {
    // Só há dados fixos na tabela antiga — o seed repõe tudo em seguida.
    db.exec('DROP TABLE locais');
    db.exec(SCHEMA);
  }
}

/**
 * Cadastra os locais fixos (filiais e municípios-UF). Se a quantidade gravada
 * divergir das listas do código (ex.: banco semeado com uma versão anterior),
 * os locais fixos são reconstruídos — preservando os personalizados.
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
  const fixosAtualizados =
    contagem.filiais === FILIAIS.length && contagem.municipios === MUNICIPIOS.length;

  db.exec('BEGIN');
  try {
    if (!fixosAtualizados) {
      db.exec("DELETE FROM locais WHERE tipo IN ('FILIAL', 'MUNICIPIO')");
      const insere = db.prepare('INSERT INTO locais (nome, tipo, ordem) VALUES (?, ?, ?)');
      FILIAIS.forEach((nome, indice) => insere.run(nome, 'FILIAL', indice));
      MUNICIPIOS.forEach((nome, indice) => insere.run(nome, 'MUNICIPIO', indice));
    }
    // Origens/destinos já usados em fretes e ainda fora do cadastro entram
    // como locais personalizados (ex.: dados importados da planilha).
    db.exec(`
      INSERT INTO locais (nome, tipo, ordem)
      SELECT v, 'PERSONALIZADO', 0
        FROM (SELECT origem AS v FROM fretes UNION SELECT destino AS v FROM fretes)
       WHERE NOT EXISTS (SELECT 1 FROM locais l WHERE l.nome = v COLLATE NOCASE)
    `);
    db.exec('COMMIT');
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

export function createDb(path: string = caminhoPadraoBanco()): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
    console.log(`Banco de dados: ${path}`);
  }
  db.exec(SCHEMA);
  migrarValorOpcional(db);
  migrarLocaisPersonalizados(db);
  semearLocais(db);
  return db;
}

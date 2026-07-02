import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { PESO_COBRANCA_PADRAO_TON } from '../db.js';

interface Frete {
  id: number;
  frete_total: number;
  [chave: string]: unknown;
}

interface DadosFrete {
  motorista: string;
  placa_cc: string | null;
  data: string;
  origem: string;
  destino: string;
  peso_ton: number | null;
  valor_ton: number;
  frete_total: number;
  notas: string[];
}

function validarFrete(corpo: Record<string, unknown>): { erro: string } | { dados: DadosFrete } {
  const { motorista, placa_cc, data, origem, destino, peso_ton, valor_ton, frete_total, notas } =
    corpo;

  const obrigatorios: Record<string, unknown> = { motorista, data, origem, destino, valor_ton };
  const faltando = Object.keys(obrigatorios).filter(
    (c) => obrigatorios[c] == null || obrigatorios[c] === ''
  );
  if (faltando.length > 0) return { erro: `Campos obrigatórios: ${faltando.join(', ')}` };

  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { erro: 'Campo data deve estar no formato YYYY-MM-DD' };
  }
  const valor = Number(valor_ton);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { erro: 'Campo valor_ton deve ser um número positivo' };
  }
  const peso = peso_ton == null || peso_ton === '' ? null : Number(peso_ton);
  if (peso !== null && (!Number.isFinite(peso) || peso < 0)) {
    return { erro: 'Campo peso_ton deve ser um número positivo' };
  }
  const total =
    frete_total == null || frete_total === ''
      ? valor * PESO_COBRANCA_PADRAO_TON
      : Number(frete_total);
  if (!Number.isFinite(total) || total < 0) {
    return { erro: 'Campo frete_total deve ser um número positivo' };
  }

  const listaNotas = Array.isArray(notas)
    ? notas.map((n) => String(n).trim()).filter((n) => n !== '')
    : [];

  return {
    dados: {
      motorista: String(motorista).trim(),
      placa_cc: placa_cc ? String(placa_cc).trim() : null,
      data,
      origem: String(origem).trim(),
      destino: String(destino).trim(),
      peso_ton: peso,
      valor_ton: valor,
      frete_total: total,
      notas: listaNotas,
    },
  };
}

export function rotasFretes(db: DatabaseSync): Router {
  const router = Router();

  const anexarNotas = (fretes: Frete[]): unknown[] => {
    if (fretes.length === 0) return [];
    const porFrete = new Map<number, string[]>();
    const ids = fretes.map((f) => f.id);
    const marcadores = ids.map(() => '?').join(', ');
    const linhas = db
      .prepare(`SELECT frete_id, numero FROM notas WHERE frete_id IN (${marcadores}) ORDER BY id`)
      .all(...ids) as { frete_id: number; numero: string }[];
    for (const { frete_id, numero } of linhas) {
      const lista = porFrete.get(frete_id) ?? [];
      lista.push(numero);
      porFrete.set(frete_id, lista);
    }
    return fretes.map((f) => {
      const notas = porFrete.get(f.id) ?? [];
      return {
        ...f,
        notas,
        valor_por_nota: notas.length > 0 ? Number((f.frete_total / notas.length).toFixed(2)) : null,
      };
    });
  };

  router.get('/', (req, res) => {
    const { mes, motorista, nota } = req.query;
    const condicoes: string[] = [];
    const parametros: string[] = [];

    if (typeof mes === 'string' && mes !== '') {
      if (!/^\d{4}-\d{2}$/.test(mes)) {
        return res.status(400).json({ erro: 'Parâmetro mes deve estar no formato YYYY-MM' });
      }
      condicoes.push("strftime('%Y-%m', f.data) = ?");
      parametros.push(mes);
    }
    if (typeof motorista === 'string' && motorista !== '') {
      condicoes.push('f.motorista = ?');
      parametros.push(motorista);
    }
    if (typeof nota === 'string' && nota !== '') {
      condicoes.push('f.id IN (SELECT frete_id FROM notas WHERE numero LIKE ?)');
      parametros.push(`%${nota}%`);
    }

    const where = condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '';
    const fretes = db
      .prepare(`SELECT f.* FROM fretes f ${where} ORDER BY f.data DESC, f.id DESC`)
      .all(...parametros) as Frete[];
    res.json(anexarNotas(fretes));
  });

  router.get('/:id', (req, res) => {
    const frete = db.prepare('SELECT * FROM fretes WHERE id = ?').get(req.params.id) as
      | Frete
      | undefined;
    if (!frete) return res.status(404).json({ erro: 'Frete não encontrado' });
    res.json(anexarNotas([frete])[0]);
  });

  router.post('/', (req, res) => {
    const resultado = validarFrete(req.body ?? {});
    if ('erro' in resultado) return res.status(400).json({ erro: resultado.erro });
    const { dados } = resultado;

    db.exec('BEGIN');
    try {
      const inserido = db
        .prepare(
          `INSERT INTO fretes (motorista, placa_cc, data, origem, destino, peso_ton, valor_ton, frete_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dados.motorista,
          dados.placa_cc,
          dados.data,
          dados.origem,
          dados.destino,
          dados.peso_ton,
          dados.valor_ton,
          dados.frete_total
        );
      const id = inserido.lastInsertRowid as number;
      const insereNota = db.prepare('INSERT INTO notas (frete_id, numero) VALUES (?, ?)');
      for (const numero of dados.notas) insereNota.run(id, numero);
      db.exec('COMMIT');

      const frete = db.prepare('SELECT * FROM fretes WHERE id = ?').get(id) as Frete;
      res.status(201).json(anexarNotas([frete])[0]);
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
  });

  router.put('/:id', (req, res) => {
    const existente = db.prepare('SELECT id FROM fretes WHERE id = ?').get(req.params.id);
    if (!existente) return res.status(404).json({ erro: 'Frete não encontrado' });

    const resultado = validarFrete(req.body ?? {});
    if ('erro' in resultado) return res.status(400).json({ erro: resultado.erro });
    const { dados } = resultado;

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE fretes SET motorista = ?, placa_cc = ?, data = ?, origem = ?, destino = ?,
                           peso_ton = ?, valor_ton = ?, frete_total = ?
         WHERE id = ?`
      ).run(
        dados.motorista,
        dados.placa_cc,
        dados.data,
        dados.origem,
        dados.destino,
        dados.peso_ton,
        dados.valor_ton,
        dados.frete_total,
        req.params.id as string
      );
      db.prepare('DELETE FROM notas WHERE frete_id = ?').run(req.params.id as string);
      const insereNota = db.prepare('INSERT INTO notas (frete_id, numero) VALUES (?, ?)');
      for (const numero of dados.notas) insereNota.run(req.params.id as string, numero);
      db.exec('COMMIT');

      const frete = db.prepare('SELECT * FROM fretes WHERE id = ?').get(req.params.id) as Frete;
      res.json(anexarNotas([frete])[0]);
    } catch (erro) {
      db.exec('ROLLBACK');
      throw erro;
    }
  });

  router.delete('/:id', (req, res) => {
    const resultado = db.prepare('DELETE FROM fretes WHERE id = ?').run(req.params.id as string);
    if (resultado.changes === 0) return res.status(404).json({ erro: 'Frete não encontrado' });
    res.status(204).end();
  });

  return router;
}

/** Busca de valor de frete por número de nota — a consulta central do sistema. */
export function rotaNotas(db: DatabaseSync): Router {
  const router = Router();
  router.get('/:numero', (req, res) => {
    const linhas = db
      .prepare(
        `SELECT n.numero, f.id AS frete_id, f.motorista, f.placa_cc, f.data, f.origem, f.destino,
                f.peso_ton, f.valor_ton, f.frete_total,
                (SELECT COUNT(*) FROM notas n2 WHERE n2.frete_id = f.id) AS total_notas
           FROM notas n
           JOIN fretes f ON f.id = n.frete_id
          WHERE n.numero = ?
          ORDER BY f.data DESC`
      )
      .all(req.params.numero) as { frete_total: number; total_notas: number }[];
    if (linhas.length === 0) return res.status(404).json({ erro: 'Nota não encontrada' });
    res.json(
      linhas.map((l) => ({
        ...l,
        valor_por_nota: Number((l.frete_total / l.total_notas).toFixed(2)),
      }))
    );
  });
  return router;
}

/** Valores distintos já cadastrados, para autocompletar o formulário. */
export function rotaOpcoes(db: DatabaseSync): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    const coluna = (sql: string) => (db.prepare(sql).all() as { v: string }[]).map((l) => l.v);
    res.json({
      motoristas: coluna('SELECT DISTINCT motorista AS v FROM fretes ORDER BY motorista'),
      placas: coluna(
        'SELECT DISTINCT placa_cc AS v FROM fretes WHERE placa_cc IS NOT NULL ORDER BY placa_cc'
      ),
      cidades: coluna(
        `SELECT DISTINCT v FROM (
           SELECT origem AS v FROM fretes UNION SELECT destino AS v FROM fretes
         ) ORDER BY v`
      ),
    });
  });
  return router;
}

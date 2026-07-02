import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { ehStatusValido, podeTransicionar, proximosStatus, type StatusEntrega } from '../status.js';

interface Entrega {
  id: number;
  codigo: string;
  status: StatusEntrega;
  [chave: string]: unknown;
}

const SQL_ENTREGA_COMPLETA = `
  SELECT e.*,
         c.nome AS cliente_nome,
         m.nome AS motorista_nome,
         v.placa AS veiculo_placa
    FROM entregas e
    JOIN clientes c ON c.id = e.cliente_id
    LEFT JOIN motoristas m ON m.id = e.motorista_id
    LEFT JOIN veiculos v ON v.id = e.veiculo_id
`;

function gerarCodigo(): string {
  return `LG-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function rotasEntregas(db: DatabaseSync): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { status } = req.query;
    if (typeof status === 'string' && status !== '') {
      if (!ehStatusValido(status)) {
        return res.status(400).json({ erro: `Status inválido: ${status}` });
      }
      const linhas = db
        .prepare(`${SQL_ENTREGA_COMPLETA} WHERE e.status = ? ORDER BY e.id DESC`)
        .all(status);
      return res.json(linhas);
    }
    const linhas = db.prepare(`${SQL_ENTREGA_COMPLETA} ORDER BY e.id DESC`).all();
    res.json(linhas);
  });

  router.get('/:id', (req, res) => {
    const entrega = db
      .prepare(`${SQL_ENTREGA_COMPLETA} WHERE e.id = ?`)
      .get(req.params.id) as Entrega | undefined;
    if (!entrega) return res.status(404).json({ erro: 'Entrega não encontrada' });
    const eventos = db
      .prepare('SELECT status, observacao, registrado_em FROM eventos_entrega WHERE entrega_id = ? ORDER BY id')
      .all(entrega.id);
    res.json({ ...entrega, eventos, proximos_status: proximosStatus(entrega.status) });
  });

  router.post('/', (req, res) => {
    const { cliente_id, motorista_id, veiculo_id, origem, destino, peso_kg } = req.body ?? {};
    if (!cliente_id || !origem || !destino) {
      return res.status(400).json({ erro: 'Campos obrigatórios: cliente_id, origem, destino' });
    }
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) return res.status(400).json({ erro: 'Cliente não encontrado' });

    const codigo = gerarCodigo();
    const resultado = db
      .prepare(
        `INSERT INTO entregas (codigo, cliente_id, motorista_id, veiculo_id, origem, destino, peso_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(codigo, cliente_id, motorista_id ?? null, veiculo_id ?? null, origem, destino, peso_kg ?? null);
    const id = resultado.lastInsertRowid as number;
    db.prepare('INSERT INTO eventos_entrega (entrega_id, status, observacao) VALUES (?, ?, ?)').run(
      id,
      'PENDENTE',
      'Entrega registrada'
    );
    const criada = db.prepare(`${SQL_ENTREGA_COMPLETA} WHERE e.id = ?`).get(id);
    res.status(201).json(criada);
  });

  router.patch('/:id/status', (req, res) => {
    const { status, observacao } = req.body ?? {};
    if (typeof status !== 'string' || !ehStatusValido(status)) {
      return res.status(400).json({ erro: 'Informe um status válido' });
    }
    const entrega = db
      .prepare('SELECT * FROM entregas WHERE id = ?')
      .get(req.params.id) as Entrega | undefined;
    if (!entrega) return res.status(404).json({ erro: 'Entrega não encontrada' });
    if (!podeTransicionar(entrega.status, status)) {
      return res.status(422).json({
        erro: `Transição inválida: ${entrega.status} → ${status}`,
        proximos_status: proximosStatus(entrega.status),
      });
    }
    db.prepare("UPDATE entregas SET status = ?, atualizada_em = datetime('now') WHERE id = ?").run(
      status,
      entrega.id
    );
    db.prepare('INSERT INTO eventos_entrega (entrega_id, status, observacao) VALUES (?, ?, ?)').run(
      entrega.id,
      status,
      observacao ?? null
    );
    const atualizada = db.prepare(`${SQL_ENTREGA_COMPLETA} WHERE e.id = ?`).get(entrega.id);
    res.json(atualizada);
  });

  return router;
}

/** Consulta pública de rastreamento pelo código da entrega. */
export function rotaRastreio(db: DatabaseSync): Router {
  const router = Router();
  router.get('/:codigo', (req, res) => {
    const entrega = db
      .prepare('SELECT id, codigo, origem, destino, status, criada_em, atualizada_em FROM entregas WHERE codigo = ?')
      .get(req.params.codigo) as Entrega | undefined;
    if (!entrega) return res.status(404).json({ erro: 'Código de rastreio não encontrado' });
    const eventos = db
      .prepare('SELECT status, observacao, registrado_em FROM eventos_entrega WHERE entrega_id = ? ORDER BY id')
      .all(entrega.id);
    const { id, ...publica } = entrega;
    res.json({ ...publica, eventos });
  });
  return router;
}

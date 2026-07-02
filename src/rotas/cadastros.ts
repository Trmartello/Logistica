import { Router } from 'express';
import type { DatabaseSync } from 'node:sqlite';

interface ConfigCadastro {
  tabela: string;
  campos: string[];
  obrigatorios: string[];
}

/**
 * CRUD genérico para os cadastros simples (clientes, motoristas, veículos).
 */
export function rotasCadastro(db: DatabaseSync, config: ConfigCadastro): Router {
  const { tabela, campos, obrigatorios } = config;
  const router = Router();

  router.get('/', (_req, res) => {
    const linhas = db.prepare(`SELECT * FROM ${tabela} ORDER BY id`).all();
    res.json(linhas);
  });

  router.get('/:id', (req, res) => {
    const linha = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
    if (!linha) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.json(linha);
  });

  router.post('/', (req, res) => {
    const corpo = req.body ?? {};
    const faltando = obrigatorios.filter((c) => corpo[c] == null || corpo[c] === '');
    if (faltando.length > 0) {
      return res.status(400).json({ erro: `Campos obrigatórios: ${faltando.join(', ')}` });
    }
    const presentes = campos.filter((c) => corpo[c] !== undefined);
    const placeholders = presentes.map(() => '?').join(', ');
    const valores = presentes.map((c) => corpo[c]);
    const resultado = db
      .prepare(`INSERT INTO ${tabela} (${presentes.join(', ')}) VALUES (${placeholders})`)
      .run(...valores);
    const criado = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(resultado.lastInsertRowid as number);
    res.status(201).json(criado);
  });

  router.put('/:id', (req, res) => {
    const corpo = req.body ?? {};
    const presentes = campos.filter((c) => corpo[c] !== undefined);
    if (presentes.length === 0) {
      return res.status(400).json({ erro: 'Nenhum campo para atualizar' });
    }
    const sets = presentes.map((c) => `${c} = ?`).join(', ');
    const valores = presentes.map((c) => corpo[c]);
    const resultado = db
      .prepare(`UPDATE ${tabela} SET ${sets} WHERE id = ?`)
      .run(...valores, req.params.id as string);
    if (resultado.changes === 0) return res.status(404).json({ erro: 'Registro não encontrado' });
    const atualizado = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(req.params.id);
    res.json(atualizado);
  });

  router.delete('/:id', (req, res) => {
    const resultado = db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(req.params.id as string);
    if (resultado.changes === 0) return res.status(404).json({ erro: 'Registro não encontrado' });
    res.status(204).end();
  });

  return router;
}

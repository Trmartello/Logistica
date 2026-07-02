import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { rotasCadastro } from './rotas/cadastros.js';
import { rotasEntregas, rotaRastreio } from './rotas/entregas.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db: DatabaseSync): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    '/api/clientes',
    rotasCadastro(db, {
      tabela: 'clientes',
      campos: ['nome', 'email', 'telefone', 'endereco'],
      obrigatorios: ['nome'],
    })
  );
  app.use(
    '/api/motoristas',
    rotasCadastro(db, {
      tabela: 'motoristas',
      campos: ['nome', 'cnh', 'telefone'],
      obrigatorios: ['nome', 'cnh'],
    })
  );
  app.use(
    '/api/veiculos',
    rotasCadastro(db, {
      tabela: 'veiculos',
      campos: ['placa', 'modelo', 'capacidade_kg'],
      obrigatorios: ['placa'],
    })
  );
  app.use('/api/entregas', rotasEntregas(db));
  app.use('/api/rastreio', rotaRastreio(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
  });

  app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code?.startsWith('ERR_SQLITE')) {
      return res.status(409).json({ erro: 'Violação de restrição do banco de dados', detalhe: err.message });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  });

  return app;
}

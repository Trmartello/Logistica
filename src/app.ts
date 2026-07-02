import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { rotasFretes, rotaNotas, rotaOpcoes, rotaResumo } from './rotas/fretes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(db: DatabaseSync): express.Express {
  const app = express();

  // Proteção por senha (para exposição na internet): defina SENHA_ACESSO.
  // Sem a variável (uso local/rede interna), o acesso permanece livre.
  const senha = process.env.SENHA_ACESSO;
  if (senha) {
    app.use((req, res, next) => {
      const [tipo, credenciais] = (req.headers.authorization ?? '').split(' ');
      if (tipo === 'Basic' && credenciais) {
        const decodificado = Buffer.from(credenciais, 'base64').toString();
        if (decodificado.slice(decodificado.indexOf(':') + 1) === senha) return next();
      }
      res.set('WWW-Authenticate', 'Basic realm="Controle de Fretes", charset="UTF-8"');
      res.status(401).send('Acesso restrito — informe a senha.');
    });
  }

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api/fretes', rotasFretes(db));
  app.use('/api/notas', rotaNotas(db));
  app.use('/api/opcoes', rotaOpcoes(db));
  app.use('/api/resumo', rotaResumo(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada' });
  });

  app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.code?.startsWith('ERR_SQLITE')) {
      return res
        .status(409)
        .json({ erro: 'Violação de restrição do banco de dados', detalhe: err.message });
    }
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  });

  return app;
}

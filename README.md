# Logística

Sistema de gestão de entregas: API REST + painel web para registrar entregas, acompanhar o ciclo de vida de cada envio e consultar rastreamento por código.

## Stack

- **Node.js 22+** com **TypeScript** (executado via `tsx`, sem etapa de build)
- **Express 5** para a API REST
- **SQLite** via módulo nativo `node:sqlite` (zero dependências de banco)
- Painel web em HTML/JS puro servido pela própria API

## Como rodar

```bash
npm install
npm run seed   # popula dados de exemplo (opcional)
npm run dev    # inicia em http://localhost:3000 com hot reload
```

O painel de entregas fica disponível em `http://localhost:3000`.

Variáveis de ambiente: `PORT` (padrão `3000`) e `DB_PATH` (padrão `logistica.db`).

## Testes e checagem de tipos

```bash
npm test        # suíte de testes de API (node:test)
npm run typecheck
```

## Domínio

Entidades principais:

- **Clientes** — quem solicita as entregas
- **Motoristas** e **Veículos** — recursos da operação
- **Entregas** — cada envio, com código de rastreio único (`LG-XXXXXXXX`)
- **Eventos de entrega** — histórico de cada mudança de status

Fluxo de status de uma entrega:

```
PENDENTE → COLETADA → EM_TRANSITO → ENTREGUE
     └──────────┴──────────┴→ CANCELADA
```

Transições fora desse fluxo são rejeitadas pela API com `422`.

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/POST | `/api/clientes` | Lista / cria clientes |
| GET/PUT/DELETE | `/api/clientes/:id` | Consulta / atualiza / remove cliente |
| GET/POST | `/api/motoristas` | Lista / cria motoristas (CNH única) |
| GET/PUT/DELETE | `/api/motoristas/:id` | Consulta / atualiza / remove motorista |
| GET/POST | `/api/veiculos` | Lista / cria veículos (placa única) |
| GET/PUT/DELETE | `/api/veiculos/:id` | Consulta / atualiza / remove veículo |
| GET | `/api/entregas?status=...` | Lista entregas, com filtro opcional por status |
| POST | `/api/entregas` | Cria entrega (`cliente_id`, `origem`, `destino` obrigatórios) |
| GET | `/api/entregas/:id` | Detalhes com histórico de eventos e próximos status |
| PATCH | `/api/entregas/:id/status` | Avança o status (`status`, `observacao` opcional) |
| GET | `/api/rastreio/:codigo` | Consulta pública de rastreamento pelo código |

## Estrutura do projeto

```
src/
  server.ts          # ponto de entrada
  app.ts             # montagem do Express e das rotas
  db.ts              # conexão SQLite + schema
  status.ts          # máquina de estados das entregas
  seed.ts            # dados de exemplo
  rotas/
    cadastros.ts     # CRUD genérico (clientes, motoristas, veículos)
    entregas.ts      # entregas, status e rastreio
public/
  index.html         # painel web
test/
  api.test.ts        # testes de integração da API
```

## Próximos passos possíveis

- Autenticação e perfis de usuário (operador, motorista, cliente)
- Cadastro pelo painel (hoje clientes/motoristas/veículos entram só pela API ou seed)
- Cálculo de frete e otimização de rotas
- Notificações de mudança de status (e-mail/WhatsApp)

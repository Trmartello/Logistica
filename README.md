# Logística — Controle de Fretes

Sistema para registrar fretes e consultar o valor do frete por nota fiscal. Cada frete pode ter **uma ou mais notas** — e o sistema calcula automaticamente o valor rateado por nota.

Substitui a planilha "BASE DADOS" (Motorista | Placa/CC | Data | Origem | Destino | Nota | Peso | Frete Valor | Frete Total), com a vantagem de que notas múltiplas viram registros separados em vez de texto na mesma célula.

## Stack

- **Node.js 22+** com **TypeScript** (executado via `tsx`, sem etapa de build)
- **Express 5** para a API REST
- **SQLite** via módulo nativo `node:sqlite` (zero dependências de banco)
- Tela em HTML/JS puro servida pela própria API

## Como rodar

```bash
npm install
npm run dev    # inicia em http://localhost:3000 com hot reload
```

A tela de cadastro e consulta fica em `http://localhost:3000`.

Variáveis de ambiente: `PORT` (padrão `3000`) e `DB_PATH` (padrão `logistica.db`).

## Importar a planilha existente

```bash
npm run importar -- caminho/para/planilha.xlsx
```

O importador lê a primeira aba, converte as datas do Excel e separa células com múltiplas notas (`183191 / 183192`) em registros individuais. Linhas sem dados essenciais são listadas como ignoradas.

## Regra de cálculo

- **Valor (R$/t)** é o preço por tonelada do trecho.
- **Frete total** é preenchido automaticamente como `34 t × valor` (capacidade do caminhão — regra usada em ~99% da planilha), mas o campo é editável para os casos cobrados por peso real.
- **Valor por nota** = frete total ÷ quantidade de notas do frete.

## Origem e destino (locais)

Os campos de origem e destino sugerem, nesta ordem:

1. **Filiais** — 109 registros no formato `2 - LINDOIA DO SUL` (extraídos da coluna `FlagFilial` do QVD de filiais);
2. **Municípios do Brasil** — 5.571 registros no formato `CONCÓRDIA - SC` (base oficial do IBGE);
3. Valores livres já usados em fretes anteriores.

Assim o frete pode ser identificado pela filial ou pelo município, na origem e/ou no destino. Os locais são semeados automaticamente no banco na primeira execução (tabela `locais`) e não precisam de atualização; digitar um valor fora da lista continua permitido.

## Fretes sem valor (pendentes)

O frete pode ser salvo **sem o valor** — ele fica marcado como pendente (flag `SEM VALOR`). O botão **"⚠ Sem valor lançado"** filtra só os pendentes e mostra a contagem, e o botão **"Lançar valor"** do frete abre o formulário direto no campo de valor. Na API: `GET /api/fretes?pendentes=1`.

## Testes e checagem de tipos

```bash
npm test        # suíte de testes de API (node:test)
npm run typecheck
```

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/fretes?nota=&mes=YYYY-MM&motorista=&pendentes=1` | Lista fretes com notas e valor por nota, com filtros opcionais |
| POST | `/api/fretes` | Cadastra frete (`motorista`, `data`, `origem`, `destino` obrigatórios; `valor_ton` opcional — sem ele o frete fica pendente; `notas` é uma lista) |
| GET | `/api/fretes/:id` | Detalhes de um frete |
| PUT | `/api/fretes/:id` | Atualiza o frete e substitui suas notas |
| DELETE | `/api/fretes/:id` | Remove o frete e suas notas |
| GET | `/api/notas/:numero` | Consulta o(s) frete(s) de uma nota, com valor rateado |
| GET | `/api/opcoes` | Motoristas, placas e cidades já cadastrados (autocompletar) |

## Estrutura do projeto

```
src/
  server.ts          # ponto de entrada
  app.ts             # montagem do Express e das rotas
  db.ts              # conexão SQLite + schema (fretes, notas)
  importar.ts        # importador da planilha .xlsx
  rotas/
    fretes.ts        # CRUD de fretes, consulta por nota, opções
public/
  index.html         # tela de cadastro e consulta
test/
  api.test.ts        # testes de integração da API
```

## Próximos passos possíveis

- Exportar para Excel/CSV (relatório mensal por motorista)
- Autenticação de usuários
- Relatórios: total por motorista, por rota, por mês
- Anexar comprovantes (CT-e/canhoto) ao frete

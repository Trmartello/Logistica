import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { createDb } from '../src/db.js';

let servidor: Server;
let base: string;

async function api(caminho: string, opcoes?: RequestInit) {
  const resp = await fetch(`${base}${caminho}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  const corpo = resp.status === 204 ? null : ((await resp.json()) as any);
  return { status: resp.status, corpo };
}

before(async () => {
  const db = createDb(':memory:');
  const app = createApp(db);
  await new Promise<void>((resolver) => {
    servidor = app.listen(0, () => resolver());
  });
  const endereco = servidor.address();
  if (typeof endereco === 'string' || endereco === null) throw new Error('Endereço inesperado');
  base = `http://127.0.0.1:${endereco.port}`;
});

after(() => {
  servidor.close();
});

describe('cadastros', () => {
  it('cria e lista clientes', async () => {
    const criado = await api('/api/clientes', {
      method: 'POST',
      body: JSON.stringify({ nome: 'Cliente Teste', email: 'teste@ex.com' }),
    });
    assert.equal(criado.status, 201);
    assert.equal(criado.corpo.nome, 'Cliente Teste');

    const lista = await api('/api/clientes');
    assert.equal(lista.status, 200);
    assert.equal(lista.corpo.length, 1);
  });

  it('rejeita cadastro sem campos obrigatórios', async () => {
    const resp = await api('/api/motoristas', {
      method: 'POST',
      body: JSON.stringify({ nome: 'Sem CNH' }),
    });
    assert.equal(resp.status, 400);
    assert.match(resp.corpo.erro, /cnh/);
  });

  it('rejeita placa duplicada', async () => {
    const dados = { placa: 'AAA1B11', modelo: 'Caminhão' };
    const primeiro = await api('/api/veiculos', { method: 'POST', body: JSON.stringify(dados) });
    assert.equal(primeiro.status, 201);
    const duplicado = await api('/api/veiculos', { method: 'POST', body: JSON.stringify(dados) });
    assert.equal(duplicado.status, 409);
  });
});

describe('entregas', () => {
  let entregaId: number;
  let codigo: string;

  it('cria entrega com status PENDENTE e código de rastreio', async () => {
    const resp = await api('/api/entregas', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: 1, origem: 'São Paulo/SP', destino: 'Rio de Janeiro/RJ', peso_kg: 10 }),
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.corpo.status, 'PENDENTE');
    assert.match(resp.corpo.codigo, /^LG-[0-9A-F]{8}$/);
    entregaId = resp.corpo.id;
    codigo = resp.corpo.codigo;
  });

  it('rejeita entrega para cliente inexistente', async () => {
    const resp = await api('/api/entregas', {
      method: 'POST',
      body: JSON.stringify({ cliente_id: 999, origem: 'A', destino: 'B' }),
    });
    assert.equal(resp.status, 400);
  });

  it('avança o status seguindo o fluxo permitido', async () => {
    const resp = await api(`/api/entregas/${entregaId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'COLETADA', observacao: 'Coletada no depósito' }),
    });
    assert.equal(resp.status, 200);
    assert.equal(resp.corpo.status, 'COLETADA');
  });

  it('rejeita transição de status inválida', async () => {
    const resp = await api(`/api/entregas/${entregaId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ENTREGUE' }),
    });
    assert.equal(resp.status, 422);
    assert.deepEqual(resp.corpo.proximos_status, ['EM_TRANSITO', 'CANCELADA']);
  });

  it('retorna detalhes com histórico de eventos', async () => {
    const resp = await api(`/api/entregas/${entregaId}`);
    assert.equal(resp.status, 200);
    assert.equal(resp.corpo.eventos.length, 2);
    assert.equal(resp.corpo.eventos[1].observacao, 'Coletada no depósito');
  });

  it('permite rastreio público pelo código', async () => {
    const resp = await api(`/api/rastreio/${codigo}`);
    assert.equal(resp.status, 200);
    assert.equal(resp.corpo.codigo, codigo);
    assert.equal(resp.corpo.eventos.length, 2);
    assert.equal(resp.corpo.id, undefined);
  });

  it('retorna 404 para código de rastreio desconhecido', async () => {
    const resp = await api('/api/rastreio/LG-NAOEXISTE');
    assert.equal(resp.status, 404);
  });

  it('filtra entregas por status', async () => {
    const resp = await api('/api/entregas?status=COLETADA');
    assert.equal(resp.status, 200);
    assert.equal(resp.corpo.length, 1);

    const invalido = await api('/api/entregas?status=QUALQUER');
    assert.equal(invalido.status, 400);
  });
});

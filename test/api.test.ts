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

describe('fretes', () => {
  let freteId: number;

  it('cadastra frete com múltiplas notas e calcula o total padrão (34 t × valor)', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Edipo',
        placa_cc: 'RXX8D50 CC7202',
        data: '2026-01-29',
        origem: 'Concórdia',
        destino: 'Campo Alegre',
        peso_ton: 33.63,
        valor_ton: 115,
        notas: ['183191', '183192'],
      }),
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.corpo.frete_total, 115 * 34);
    assert.deepEqual(resp.corpo.notas, ['183191', '183192']);
    assert.equal(resp.corpo.valor_por_nota, (115 * 34) / 2);
    freteId = resp.corpo.id;
  });

  it('aceita frete_total informado manualmente (cobrança por peso real)', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Maycon',
        data: '2025-11-04',
        origem: 'Joaçaba',
        destino: 'Concórdia',
        peso_ton: 33.94,
        valor_ton: 45,
        frete_total: 1527.3,
        notas: ['402017'],
      }),
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.corpo.frete_total, 1527.3);
  });

  it('aceita frete sem nota', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Darlan',
        data: '2026-02-10',
        origem: 'Capinzal',
        destino: 'Joaçaba',
        valor_ton: 43,
      }),
    });
    assert.equal(resp.status, 201);
    assert.deepEqual(resp.corpo.notas, []);
    assert.equal(resp.corpo.valor_por_nota, null);
  });

  it('rejeita frete sem campos obrigatórios', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'Fulano' }),
    });
    assert.equal(resp.status, 400);
    assert.match(resp.corpo.erro, /obrigatórios/);
  });

  it('rejeita data e valor inválidos', async () => {
    const dataRuim = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'F', data: '29/01/2026', origem: 'A', destino: 'B', valor_ton: 10 }),
    });
    assert.equal(dataRuim.status, 400);
    const valorRuim = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'F', data: '2026-01-29', origem: 'A', destino: 'B', valor_ton: -5 }),
    });
    assert.equal(valorRuim.status, 400);
  });

  it('atualiza frete substituindo as notas', async () => {
    const resp = await api(`/api/fretes/${freteId}`, {
      method: 'PUT',
      body: JSON.stringify({
        motorista: 'Edipo',
        placa_cc: 'RXX8D50 CC7202',
        data: '2026-01-29',
        origem: 'Concórdia',
        destino: 'Campo Alegre',
        peso_ton: 33.63,
        valor_ton: 115,
        frete_total: 3910,
        notas: ['183191', '183192', '183193'],
      }),
    });
    assert.equal(resp.status, 200);
    assert.deepEqual(resp.corpo.notas, ['183191', '183192', '183193']);
    assert.equal(resp.corpo.valor_por_nota, Number((3910 / 3).toFixed(2)));
  });

  it('filtra por nota, mês e motorista', async () => {
    const porNota = await api('/api/fretes?nota=183192');
    assert.equal(porNota.corpo.length, 1);
    assert.equal(porNota.corpo[0].id, freteId);

    const porMes = await api('/api/fretes?mes=2025-11');
    assert.equal(porMes.corpo.length, 1);
    assert.equal(porMes.corpo[0].motorista, 'Maycon');

    const porMotorista = await api('/api/fretes?motorista=Darlan');
    assert.equal(porMotorista.corpo.length, 1);

    const mesInvalido = await api('/api/fretes?mes=novembro');
    assert.equal(mesInvalido.status, 400);
  });

  it('exclui frete junto com as notas', async () => {
    const criado = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Temp', data: '2026-03-01', origem: 'A', destino: 'B', valor_ton: 50, notas: ['999999'],
      }),
    });
    const removido = await api(`/api/fretes/${criado.corpo.id}`, { method: 'DELETE' });
    assert.equal(removido.status, 204);
    const busca = await api('/api/notas/999999');
    assert.equal(busca.status, 404);
  });
});

describe('consulta por nota', () => {
  it('retorna o frete e o valor rateado da nota', async () => {
    const resp = await api('/api/notas/183191');
    assert.equal(resp.status, 200);
    assert.equal(resp.corpo.length, 1);
    assert.equal(resp.corpo[0].motorista, 'Edipo');
    assert.equal(resp.corpo[0].total_notas, 3);
    assert.equal(resp.corpo[0].valor_por_nota, Number((3910 / 3).toFixed(2)));
  });

  it('retorna 404 para nota desconhecida', async () => {
    const resp = await api('/api/notas/000000');
    assert.equal(resp.status, 404);
  });
});

describe('opções de autocompletar', () => {
  it('lista motoristas, placas e cidades distintos', async () => {
    const resp = await api('/api/opcoes');
    assert.equal(resp.status, 200);
    assert.ok(resp.corpo.motoristas.includes('Edipo'));
    assert.ok(resp.corpo.motoristas.includes('Maycon'));
    assert.ok(resp.corpo.placas.includes('RXX8D50 CC7202'));
    assert.ok(resp.corpo.cidades.includes('Concórdia'));
    assert.ok(resp.corpo.cidades.includes('Campo Alegre'));
  });
});

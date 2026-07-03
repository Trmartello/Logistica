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

  it('cadastra frete com múltiplas notas e calcula o valor (R$/t) = total ÷ peso', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Edipo',
        placa_cc: 'RXX8D50 CC7202',
        data: '2026-01-29',
        origem: 'Concórdia',
        destino: 'Campo Alegre',
        peso_ton: 33.63,
        frete_total: 3910,
        notas: ['183191', '183192'],
      }),
    });
    assert.equal(resp.status, 201);
    assert.equal(resp.corpo.frete_total, 3910);
    assert.equal(resp.corpo.valor_ton, Number((3910 / 33.63).toFixed(2)));
    assert.deepEqual(resp.corpo.notas, ['183191', '183192']);
    assert.equal(resp.corpo.valor_por_nota, 3910 / 2);
    assert.ok(typeof resp.corpo.criado_em === 'string' && resp.corpo.criado_em.length > 0);
    freteId = resp.corpo.id;
  });

  it('mantém o valor_ton informado explicitamente (não recalcula)', async () => {
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
    assert.equal(resp.corpo.valor_ton, 45);
  });

  it('aceita frete sem nota', async () => {
    const resp = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Darlan',
        data: '2026-02-10',
        origem: 'Capinzal',
        destino: 'Joaçaba',
        frete_total: 1462,
      }),
    });
    assert.equal(resp.status, 201);
    assert.deepEqual(resp.corpo.notas, []);
    assert.equal(resp.corpo.valor_por_nota, null);
    // sem peso não há como derivar o R$/t
    assert.equal(resp.corpo.valor_ton, null);
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

  it('aceita frete sem valor (pendente de lançamento) e permite lançar depois', async () => {
    const criado = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Olmir',
        data: '2026-03-05',
        origem: 'Chapecó',
        destino: 'Joaçaba',
        peso_ton: 34.06,
        notas: ['174487'],
      }),
    });
    assert.equal(criado.status, 201);
    assert.equal(criado.corpo.valor_ton, null);
    assert.equal(criado.corpo.frete_total, null);
    assert.equal(criado.corpo.pendente_valor, true);
    assert.equal(criado.corpo.valor_por_nota, null);

    const pendentes = await api('/api/fretes?pendentes=1');
    assert.equal(pendentes.corpo.length, 1);
    assert.equal(pendentes.corpo[0].id, criado.corpo.id);

    const lancado = await api(`/api/fretes/${criado.corpo.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        motorista: 'Olmir',
        data: '2026-03-05',
        origem: 'Chapecó',
        destino: 'Joaçaba',
        peso_ton: 34.06,
        frete_total: 1938,
        notas: ['174487'],
      }),
    });
    assert.equal(lancado.corpo.pendente_valor, false);
    assert.equal(lancado.corpo.frete_total, 1938);
    assert.equal(lancado.corpo.valor_ton, Number((1938 / 34.06).toFixed(2)));

    const aposLancar = await api('/api/fretes?pendentes=1');
    assert.equal(aposLancar.corpo.length, 0);
  });

  it('conta os fretes pendentes em /api/opcoes', async () => {
    const antes = await api('/api/opcoes');
    const criado = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'Sergio', data: '2026-03-06', origem: 'A', destino: 'B' }),
    });
    const depois = await api('/api/opcoes');
    assert.equal(depois.corpo.fretes_pendentes, antes.corpo.fretes_pendentes + 1);
    await api(`/api/fretes/${criado.corpo.id}`, { method: 'DELETE' });
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

describe('busca global e resumo', () => {
  it('busca por motorista, cidade, placa ou nota num único parâmetro', async () => {
    const porMotorista = await api('/api/fretes?busca=Maycon');
    assert.ok(porMotorista.corpo.length >= 1);
    assert.ok(porMotorista.corpo.every((f: any) => f.motorista === 'Maycon'));

    const porNota = await api('/api/fretes?busca=402017');
    assert.equal(porNota.corpo.length, 1);

    const porCidade = await api('/api/fretes?busca=Joaçaba');
    assert.ok(porCidade.corpo.length >= 1);

    const nada = await api('/api/fretes?busca=inexistente-xyz');
    assert.equal(nada.corpo.length, 0);
  });

  it('busca ignora acentos e caixa', async () => {
    const semAcento = await api('/api/fretes?busca=joacaba');
    assert.ok(semAcento.corpo.length >= 1);
    assert.ok(semAcento.corpo.some((f: any) => f.origem === 'Joaçaba' || f.destino === 'Joaçaba'));

    const comAcentoOutraCaixa = await api('/api/fretes?busca=CONCÓRDIA');
    const semAcentoMinusculo = await api('/api/fretes?busca=concordia');
    assert.equal(comAcentoOutraCaixa.corpo.length, semAcentoMinusculo.corpo.length);
    assert.ok(semAcentoMinusculo.corpo.length >= 1);
  });

  it('conta fretes com data fora do padrão em /api/opcoes', async () => {
    const antes = await api('/api/opcoes');
    const futuro = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'Datas', data: '2031-12-29', origem: 'A', destino: 'B', frete_total: 100 }),
    });
    const antigo = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({ motorista: 'Datas', data: '2006-01-12', origem: 'A', destino: 'B', frete_total: 100 }),
    });
    const depois = await api('/api/opcoes');
    assert.equal(depois.corpo.datas_suspeitas, antes.corpo.datas_suspeitas + 2);
    await api(`/api/fretes/${futuro.corpo.id}`, { method: 'DELETE' });
    await api(`/api/fretes/${antigo.corpo.id}`, { method: 'DELETE' });
  });

  it('retorna os KPIs do painel', async () => {
    const resp = await api('/api/resumo');
    assert.equal(resp.status, 200);
    assert.ok(typeof resp.corpo.mes_atual.fretes === 'number');
    assert.ok(typeof resp.corpo.mes_atual.faturamento === 'number');
    assert.ok(typeof resp.corpo.mes_anterior.fretes === 'number');
    assert.ok(typeof resp.corpo.pendentes === 'number');
    assert.ok(typeof resp.corpo.registrados_hoje === 'number');
    // todos os fretes de teste foram criados agora
    assert.ok(resp.corpo.registrados_hoje >= 1);
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

describe('proteção por senha (SENHA_ACESSO)', () => {
  it('exige senha quando a variável está definida e libera com a senha correta', async () => {
    process.env.SENHA_ACESSO = 'teste123';
    const appProtegido = createApp(createDb(':memory:'));
    delete process.env.SENHA_ACESSO;
    const servidorProtegido = await new Promise<Server>((resolver) => {
      const s = appProtegido.listen(0, () => resolver(s));
    });
    const endereco = servidorProtegido.address();
    if (typeof endereco === 'string' || endereco === null) throw new Error('Endereço inesperado');
    const baseProtegida = `http://127.0.0.1:${endereco.port}`;

    const semSenha = await fetch(`${baseProtegida}/api/fretes`);
    assert.equal(semSenha.status, 401);
    assert.match(semSenha.headers.get('www-authenticate') ?? '', /Basic/);

    const senhaErrada = await fetch(`${baseProtegida}/api/fretes`, {
      headers: { Authorization: `Basic ${Buffer.from('usuario:errada').toString('base64')}` },
    });
    assert.equal(senhaErrada.status, 401);

    const senhaCerta = await fetch(`${baseProtegida}/api/fretes`, {
      headers: { Authorization: `Basic ${Buffer.from('usuario:teste123').toString('base64')}` },
    });
    assert.equal(senhaCerta.status, 200);

    servidorProtegido.close();
  });

  it('mantém acesso livre quando a variável não está definida', async () => {
    const resp = await api('/api/fretes');
    assert.equal(resp.status, 200);
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

  it('inclui filiais primeiro e municípios-UF do IBGE em seguida nas cidades', async () => {
    const resp = await api('/api/opcoes');
    const { cidades } = resp.corpo;
    assert.ok(cidades.includes('1 - MATRIZ'));
    assert.ok(cidades.includes('2 - LINDOIA DO SUL'));
    assert.ok(cidades.includes('CONCÓRDIA - SC'));
    assert.ok(cidades.includes('SÃO PAULO - SP'));
    // lista completa do Brasil: 109 filiais + 5.571 municípios + valores livres
    assert.ok(cidades.length > 5600);
    // ordem: toda filial vem antes de qualquer município
    const ultimaFilial = Math.max(
      ...cidades.map((c: string, i: number) => (/^\d+ - /.test(c) ? i : -1))
    );
    const primeiroMunicipio = cidades.indexOf('ABADIA DE GOIÁS - GO');
    assert.ok(ultimaFilial < primeiroMunicipio);
    // valores livres digitados nos fretes continuam disponíveis, ao final
    assert.ok(cidades.indexOf('Concórdia') > primeiroMunicipio);
  });

  it('guarda origem/destino personalizados no banco ao salvar o frete', async () => {
    const criado = await api('/api/fretes', {
      method: 'POST',
      body: JSON.stringify({
        motorista: 'Juliano',
        data: '2026-03-10',
        origem: 'FAZENDA SANTA LUZIA',
        destino: 'CONCÓRDIA - SC',
        valor_ton: 80,
      }),
    });
    assert.equal(criado.status, 201);

    const opcoes = await api('/api/opcoes');
    const { cidades } = opcoes.corpo;
    assert.ok(cidades.includes('FAZENDA SANTA LUZIA'));
    // personalizado fica depois dos municípios e não duplica local existente
    assert.ok(cidades.indexOf('FAZENDA SANTA LUZIA') > cidades.indexOf('ZORTÉA - SC'));
    assert.equal(cidades.filter((c: string) => c === 'CONCÓRDIA - SC').length, 1);
  });
});

// Executa por último: a opção "substituir tudo" apaga os fretes das suítes anteriores.
describe('importação de planilha', () => {
  it('importa .xlsx, separa múltiplas notas e permite substituir tudo', async () => {
    const { default: XLSX } = await import('xlsx');
    const aba = XLSX.utils.aoa_to_sheet([
      ['Motorista', 'PLACA / CC', 'DATA ', 'MÊS', 'ORIGEM', 'DESTINO', 'NOTA', 'PESO ', 'FRETE VALOR ', 'FRETE PESO NF', 'FRETE TOTAL'],
      ['Importado A', 'AAA0X00 CC 1', 45965, 'NOVEMBRO', 'JOAÇABA', 'CONCÓRDIA', '900001 / 900002', 33.94, 45, 1527.3, 1530],
      ['Importado B', 'BBB0X00 CC 2', 45966, 'NOVEMBRO', 'SEARA', 'MAFRA', 900003, 20, 80, 1600, 1600],
      ['Importado C', null, 'texto-invalido', 'NOVEMBRO', 'ITA', 'PALMAS', 900004, 10, 50, 500, 500],
    ]);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, aba, 'BASE DADOS');
    const conteudo = XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const resp = await fetch(`${base}/api/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(conteudo),
    });
    const corpo = (await resp.json()) as any;
    assert.equal(resp.status, 200);
    assert.equal(corpo.importados, 2);
    assert.equal(corpo.ignorados, 1);

    const multiNota = await api('/api/notas/900001');
    assert.equal(multiNota.corpo[0].total_notas, 2);
    assert.equal(multiNota.corpo[0].motorista, 'Importado A');

    // origem/destino da planilha viram locais personalizados
    const opcoes = await api('/api/opcoes');
    assert.ok(opcoes.corpo.cidades.includes('JOAÇABA'));

    // substituir tudo: só os 2 fretes da planilha permanecem
    const respLimpar = await fetch(`${base}/api/importar?limpar=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(conteudo),
    });
    assert.equal(respLimpar.status, 200);
    const fretes = await api('/api/fretes');
    assert.equal(fretes.corpo.length, 2);
  });

  it('rejeita conteúdo que não é planilha', async () => {
    const resp = await fetch(`${base}/api/importar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(Buffer.from('isto não é um xlsx')),
    });
    assert.equal(resp.status, 400);
  });
});

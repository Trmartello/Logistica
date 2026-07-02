import { createDb } from './db.js';

const db = createDb();

const temDados = db.prepare('SELECT COUNT(*) AS total FROM clientes').get() as { total: number };
if (temDados.total > 0) {
  console.log('Banco já possui dados — seed ignorado.');
  process.exit(0);
}

const insereCliente = db.prepare(
  'INSERT INTO clientes (nome, email, telefone, endereco) VALUES (?, ?, ?, ?)'
);
insereCliente.run('Comercial Andrade Ltda', 'contato@andrade.com.br', '(11) 3333-1000', 'Av. Paulista, 1500 - São Paulo/SP');
insereCliente.run('Distribuidora Horizonte', 'vendas@horizonte.com.br', '(31) 3222-2000', 'Rua da Bahia, 800 - Belo Horizonte/MG');
insereCliente.run('Mercado Bom Preço', 'compras@bompreco.com.br', '(41) 3111-3000', 'Rua XV de Novembro, 300 - Curitiba/PR');

const insereMotorista = db.prepare('INSERT INTO motoristas (nome, cnh, telefone) VALUES (?, ?, ?)');
insereMotorista.run('Carlos Pereira', '12345678900', '(11) 98888-0001');
insereMotorista.run('Ana Souza', '98765432100', '(11) 98888-0002');

const insereVeiculo = db.prepare('INSERT INTO veiculos (placa, modelo, capacidade_kg) VALUES (?, ?, ?)');
insereVeiculo.run('ABC1D23', 'Mercedes-Benz Accelo 815', 3500);
insereVeiculo.run('XYZ9K87', 'Fiat Fiorino', 650);

const insereEntrega = db.prepare(
  `INSERT INTO entregas (codigo, cliente_id, motorista_id, veiculo_id, origem, destino, peso_kg, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insereEvento = db.prepare(
  'INSERT INTO eventos_entrega (entrega_id, status, observacao) VALUES (?, ?, ?)'
);

const e1 = insereEntrega.run('LG-SEED0001', 1, 1, 1, 'São Paulo/SP', 'Campinas/SP', 1200, 'EM_TRANSITO');
insereEvento.run(e1.lastInsertRowid as number, 'PENDENTE', 'Entrega registrada');
insereEvento.run(e1.lastInsertRowid as number, 'COLETADA', 'Carga coletada no depósito');
insereEvento.run(e1.lastInsertRowid as number, 'EM_TRANSITO', 'Saiu para entrega');

const e2 = insereEntrega.run('LG-SEED0002', 2, 2, 2, 'Belo Horizonte/MG', 'Contagem/MG', 400, 'PENDENTE');
insereEvento.run(e2.lastInsertRowid as number, 'PENDENTE', 'Entrega registrada');

const e3 = insereEntrega.run('LG-SEED0003', 3, 1, 1, 'Curitiba/PR', 'Joinville/SC', 2100, 'ENTREGUE');
insereEvento.run(e3.lastInsertRowid as number, 'PENDENTE', 'Entrega registrada');
insereEvento.run(e3.lastInsertRowid as number, 'COLETADA', null);
insereEvento.run(e3.lastInsertRowid as number, 'EM_TRANSITO', null);
insereEvento.run(e3.lastInsertRowid as number, 'ENTREGUE', 'Recebido por João, portaria');

console.log('Seed concluído: 3 clientes, 2 motoristas, 2 veículos e 3 entregas de exemplo.');

export const STATUS_ENTREGA = [
  'PENDENTE',
  'COLETADA',
  'EM_TRANSITO',
  'ENTREGUE',
  'CANCELADA',
] as const;

export type StatusEntrega = (typeof STATUS_ENTREGA)[number];

const TRANSICOES: Record<StatusEntrega, StatusEntrega[]> = {
  PENDENTE: ['COLETADA', 'CANCELADA'],
  COLETADA: ['EM_TRANSITO', 'CANCELADA'],
  EM_TRANSITO: ['ENTREGUE', 'CANCELADA'],
  ENTREGUE: [],
  CANCELADA: [],
};

export function ehStatusValido(valor: string): valor is StatusEntrega {
  return (STATUS_ENTREGA as readonly string[]).includes(valor);
}

export function podeTransicionar(de: StatusEntrega, para: StatusEntrega): boolean {
  return TRANSICOES[de].includes(para);
}

export function proximosStatus(de: StatusEntrega): StatusEntrega[] {
  return TRANSICOES[de];
}

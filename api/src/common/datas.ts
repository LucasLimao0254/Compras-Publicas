// Datas "de calendário" (vigência, assinatura) chegam como 'AAAA-MM-DD' e são
// gravadas como meia-noite UTC. Comparar esse instante com `new Date()` fazia o
// contrato vencer às 21h do dia ANTERIOR ao último dia de vigência (horário de
// Brasília), e formatar no fuso local mostrava a data um dia antes. A regra é:
// data de calendário é sempre lida/comparada em UTC (é só um dia, não um
// instante), e "hoje" é o dia corrente no fuso do órgão.

const FUSO_NEGOCIO = process.env.TZ_NEGOCIO || 'America/Sao_Paulo';

// 'AAAA-MM-DD' de uma data de calendário gravada como meia-noite UTC.
export function diaDaData(data: Date | string): string {
  return new Date(data).toISOString().slice(0, 10);
}

// 'AAAA-MM-DD' de hoje no fuso do órgão.
export function hoje(): string {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Vencido só depois do último dia de vigência — o próprio dia final ainda vale.
export function vencida(vigenciaFinal: Date | string): boolean {
  return hoje() > diaDaData(vigenciaFinal);
}

// dd/mm/aaaa de uma data de calendário (sem deslocar pelo fuso).
export function formatarDiaBR(data: Date | string | null | undefined): string {
  if (!data) return '';
  const [a, m, d] = diaDaData(data).split('-');
  return `${d}/${m}/${a}`;
}

// dd/mm/aaaa de um instante (criado em, enviado em), no fuso do órgão.
export function formatarInstanteBR(data: Date | string | null | undefined): string {
  if (!data) return '';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: FUSO_NEGOCIO });
}

// Período de vigência coerente: início não pode ser depois do fim.
export function periodoValido(inicio: Date | string, fim: Date | string): boolean {
  return diaDaData(inicio) <= diaDaData(fim);
}

// Faixa de prazo de um contrato — a mesma classificação nos números da Visão
// geral e nos filtros da lista de contratos (que a Visão geral abre já
// filtrada). VENCENDO_30 é um contrato vigente que vence nos próximos 30 dias.
export type FaixaPrazo = 'ARQUIVADO' | 'VENCIDO' | 'VENCENDO_30' | 'VIGENTE';
export function faixaPrazo(situacao: string, vigenciaFinal: Date | string, hojeDia = hoje()): FaixaPrazo {
  if (situacao === 'ARQUIVADO') return 'ARQUIVADO';
  const vf = diaDaData(vigenciaFinal);
  if (vf < hojeDia) return 'VENCIDO';
  const limite = new Date(`${hojeDia}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + 30);
  return vf <= diaDaData(limite) ? 'VENCENDO_30' : 'VIGENTE';
}

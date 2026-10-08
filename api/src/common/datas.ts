// Vigências e datas de assinatura são datas puras (sem hora): chegam como
// 'AAAA-MM-DD' e são gravadas como meia-noite UTC. Comparar esse instante com
// "agora" fazia um contrato contar como vencido já às 21h da véspera do último
// dia (meia-noite UTC = 21h em Brasília). A comparação certa é entre DIAS do
// calendário, no fuso em que o órgão opera.
const FUSO_PADRAO = process.env.FUSO_HORARIO || 'America/Sao_Paulo';

// 'AAAA-MM-DD' do dia de hoje no fuso do órgão.
export function hojeIso(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_PADRAO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

// 'AAAA-MM-DD' de uma data pura gravada como meia-noite UTC.
export function diaIso(data: Date | string): string {
  return new Date(data).toISOString().slice(0, 10);
}

// Vencido só a partir do dia SEGUINTE ao último dia de vigência.
export function vigenciaEncerrada(vigenciaFinal: Date | string, agora: Date = new Date()): boolean {
  return diaIso(vigenciaFinal) < hojeIso(agora);
}

// Dias de calendário de hoje até a data (0 = vence hoje, negativo = já venceu).
export function diasAte(data: Date | string, agora: Date = new Date()): number {
  return Math.round((Date.parse(diaIso(data)) - Date.parse(hojeIso(agora))) / 86_400_000);
}

// dd/mm/aaaa de uma data pura — sempre em UTC, senão o servidor em horário de
// Brasília imprime o dia anterior.
export function formatarDataPura(data: Date | string | null | undefined): string {
  return data ? new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
}

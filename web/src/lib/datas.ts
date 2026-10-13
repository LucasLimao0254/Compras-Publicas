// Datas de calendário (vigência, assinatura) são gravadas como meia-noite UTC.
// Formatar no fuso do navegador (Brasília, UTC-3) mostrava o dia anterior —
// 31/12 aparecia como 30/12. Mesma regra do backend (api/src/common/datas.ts).
// Instantes (criado em, enviado em) continuam no fuso local.
export function formatarDia(data: string | Date | null | undefined): string {
  if (!data) return '';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

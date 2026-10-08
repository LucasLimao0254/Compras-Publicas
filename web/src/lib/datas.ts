// Vigências e datas de assinatura são datas puras: a API as devolve como
// meia-noite UTC ("2026-10-07T00:00:00.000Z"). Formatar no fuso do navegador
// mostrava o dia anterior no Brasil (21h do dia 6) — data pura é sempre
// formatada em UTC. Instantes de verdade (criadoEm, enviadoEm, createdAt)
// continuam usando toLocaleDateString/toLocaleString normalmente.
export function fmtDataPura(valor: string | Date | null | undefined): string {
  return valor ? new Date(valor).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '';
}

// 'AAAA-MM-DD' de hoje no fuso do navegador — para comparar com datas puras.
export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Vencido só a partir do dia seguinte ao último dia de vigência.
export function vigenciaEncerrada(vigenciaFinal: string | Date): boolean {
  return new Date(vigenciaFinal).toISOString().slice(0, 10) < hojeIso();
}

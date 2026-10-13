// Rótulo de uma dotação orçamentária nos seletores (contrato e ordem).
export function rotuloDotacao(d: { gestaoUnidade: string; fonteRecursos: string; programaTrabalho: string; elementoDespesa?: string | null }) {
  return [d.gestaoUnidade, d.fonteRecursos, d.programaTrabalho, d.elementoDespesa].filter(Boolean).join('.');
}

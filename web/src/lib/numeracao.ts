// Numeração de atas (ARP) e contratos: texto livre no formato "NNN/AAAA",
// às vezes com prefixo ("ARP 001/2026"). Dois números são o mesmo quando
// têm o mesmo número e ano — "12/2026", "012/2026" e "ARP 012/2026" não podem
// coexistir. Sem esse padrão, compara o texto normalizado. Cópia em
// api/src/common/numeracao.ts (o backend recusa do mesmo jeito).
const PADRAO = /(\d+)\s*\/\s*(\d{2,4})\s*$/;

export function chaveNumero(texto: string): string {
  const t = texto.trim().replace(/\s+/g, ' ').toUpperCase();
  const m = PADRAO.exec(t);
  return m ? `${Number(m[1])}/${m[2]}` : t;
}

// O maior da sequência (ano, depois número); sem nenhum no padrão, o último da lista.
export function ultimoNumero(numeros: string[]): string | null {
  let melhor: { texto: string; ano: number; n: number } | null = null;
  for (const texto of numeros) {
    const m = PADRAO.exec(texto.trim());
    if (!m) continue;
    const ano = Number(m[2]), n = Number(m[1]);
    if (!melhor || ano > melhor.ano || (ano === melhor.ano && n > melhor.n)) melhor = { texto: texto.trim(), ano, n };
  }
  return melhor?.texto ?? numeros[numeros.length - 1] ?? null;
}

export function numeroJaUsado(existentes: { id: string; numero: string }[], numero: string, excetoId?: string): string | null {
  const chave = chaveNumero(numero);
  return existentes.find((e) => e.id !== excetoId && chaveNumero(e.numero) === chave)?.numero ?? null;
}

// Dinheiro é sempre tratado com duas casas decimais, em centavos inteiros.
// Somar reais em float acumula resíduo (0,1 + 0,2 = 0,30000000000000004) e
// misturar 4 casas (valor unitário) com 2 casas (preço total da ordem) deixava
// "saldos" de frações de centavo que nunca zeravam. Toda conta de dinheiro
// passa a ser: arredonda cada parcela para centavos, soma inteiros, converte
// de volta para reais só na borda (resposta da API ou coluna numeric(…, 2)).

// Arredonda para centavos (meio para cima). O toPrecision(15) descarta o ruído
// de float antes de arredondar: 1,005 × 100 = 100,49999999999999 em float, que
// sem isso arredondaria para 100 em vez de 101.
export function centavos(valor: number | string | null | undefined): number {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Number((n * 100).toPrecision(15)));
}

// Valor total de uma linha (quantidade × valor unitário), já em centavos.
export function centavosDoTotal(quantidade: number | string, valorUnitario: number | string): number {
  return centavos(Number(quantidade) * Number(valorUnitario));
}

export function reais(valorEmCentavos: number): number {
  return valorEmCentavos / 100;
}

// Formato para gravar em coluna numeric(…, 2).
export function decimal2(valorEmCentavos: number): string {
  return (valorEmCentavos / 100).toFixed(2);
}

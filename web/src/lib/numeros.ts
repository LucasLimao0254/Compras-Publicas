// Números nas tabelas de itens. Valor unitário sem "R$" (a coluna já diz o
// que é, e o símbolo quebrava a linha em duas); quantidade lida como número —
// o numeric(14,3) do Postgres chega como texto "200.000", que no padrão
// brasileiro parece duzentos mil.
export function formatarValor(v: number | string): string {
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatarQuantidade(q: number | string): string {
  return Number(q).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

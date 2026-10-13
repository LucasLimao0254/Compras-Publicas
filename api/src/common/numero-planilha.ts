// Número lido de uma célula de planilha (SheetJS com `raw: true`).
//
// Célula numérica do Excel chega como `number` e é usada direto — antes, com
// `raw: false`, o SheetJS devolvia o texto FORMATADO no padrão americano
// ("8,495.91" para uma célula com formato "#,##0.00"), e o parser, vendo a
// vírgula, tratava como padrão brasileiro: 8.495,91 virava 8,49591. Erro
// silencioso de 1000x no preço/quantidade importados.
//
// Célula de texto (digitada como texto ou exportada assim, ex.: "R$ 8.495,91")
// decide o separador decimal pelo que aparece por último: "1.234,56" (BR) e
// "1,234.56" (US) dão 1234.56. Só vírgula ("9,5") é decimal BR; só ponto
// ("10.5") é decimal comum.
export function paraNumeroPlanilha(valor: unknown): number | null {
  if (valor == null) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

  let texto = String(valor).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!texto || texto === '-') return null;

  const ultimaVirgula = texto.lastIndexOf(',');
  const ultimoPonto = texto.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (ultimaVirgula !== -1) {
    texto = texto.replace(/,/g, '');
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

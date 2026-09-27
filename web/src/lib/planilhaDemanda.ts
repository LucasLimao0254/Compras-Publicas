import * as XLSX from 'xlsx';

// Planilha enxuta de demanda: primeira linha é cabeçalho (ignorada), colunas
// A e B são "Número do item" e "Quantidade" — referencia item já cadastrado,
// nunca cadastra item novo. Mesma regra de número do backend
// (api/src/common/numero-planilha.ts), replicada aqui porque roda no
// navegador: célula numérica é lida crua (raw: true) — com raw: false o
// SheetJS devolvia "1,234.5" (formato americano) e a vírgula fazia o texto ser
// lido como padrão BR (1,2345). Em texto, o separador decimal é o que aparece
// por último ("1.234,56" e "1,234.56" dão 1234.56).
function paraNumeroPlanilha(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (!texto || texto === '-') return null;
  const ultimaVirgula = texto.lastIndexOf(',');
  const ultimoPonto = texto.lastIndexOf('.');
  if (ultimaVirgula > ultimoPonto) texto = texto.replace(/\./g, '').replace(',', '.');
  else if (ultimaVirgula !== -1) texto = texto.replace(/,/g, '');
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

export async function lerPlanilhaDemanda(file: File): Promise<{ numero: number; quantidade: number }[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  if (!planilha) throw new Error('Planilha vazia ou ilegível');
  const linhas: unknown[][] = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: true, defval: '' });

  const entradas: { numero: number; quantidade: number }[] = [];
  for (const linha of linhas.slice(1)) {
    const numero = paraNumeroPlanilha(linha[0]);
    const quantidade = paraNumeroPlanilha(linha[1]);
    if (numero == null || quantidade == null || quantidade <= 0) continue;
    entradas.push({ numero: Math.trunc(numero), quantidade });
  }
  if (!entradas.length) throw new Error('Nenhuma linha válida encontrada — confira as colunas "Número do item" e "Quantidade"');
  return entradas;
}

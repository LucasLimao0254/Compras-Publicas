import * as XLSX from 'xlsx';

// Planilha enxuta de demanda: primeira linha é cabeçalho (ignorada), colunas
// A e B são "Número do item" e "Quantidade" — referencia item já cadastrado,
// nunca cadastra item novo. Formato de número aceita tanto "1234" quanto
// "1.234,56" (padrão BR) — mesma lógica de conversão usada no backend em
// ExtracaoHomologacaoService.paraNumeroBR, replicada aqui em JS puro porque
// roda no navegador.
// Só stripa ponto de milhar quando há vírgula decimal no texto: sem essa
// checagem, uma célula numérica comum do Excel ("10.5", sem formatação BR)
// tinha o ponto removido e virava 105 — erro silencioso de 10x a 1000x.
function paraNumeroBR(valor: unknown): number | null {
  if (valor == null || valor === '') return null;
  if (typeof valor === 'number') return valor;
  const texto = String(valor).trim().replace(/^R\$\s*/i, '');
  if (!texto || texto === '-') return null;
  const n = texto.includes(',') ? Number(texto.replace(/\./g, '').replace(',', '.')) : Number(texto);
  return Number.isFinite(n) ? n : null;
}

export async function lerPlanilhaDemanda(file: File): Promise<{ numero: number; quantidade: number }[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const planilha = workbook.Sheets[workbook.SheetNames[0]];
  if (!planilha) throw new Error('Planilha vazia ou ilegível');
  const linhas: unknown[][] = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: false, defval: '' });

  const entradas: { numero: number; quantidade: number }[] = [];
  for (const linha of linhas.slice(1)) {
    const numero = paraNumeroBR(linha[0]);
    const quantidade = paraNumeroBR(linha[1]);
    if (numero == null || quantidade == null || quantidade <= 0) continue;
    entradas.push({ numero: Math.trunc(numero), quantidade });
  }
  if (!entradas.length) throw new Error('Nenhuma linha válida encontrada — confira as colunas "Número do item" e "Quantidade"');
  return entradas;
}

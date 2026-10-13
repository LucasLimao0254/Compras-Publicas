import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { paraNumeroPlanilha } from '../common/numero-planilha';

const itemExtraidoSchema = z.object({
  numeroItem: z.union([z.number(), z.string()]).nullish(),
  descricao: z.string(),
  unidade: z.string().nullish(),
  quantidade: z.number().nullish(),
  valorUnitario: z.number().nullish(),
});

const fornecedorExtraidoSchema = z.object({
  nome: z.string(),
  cnpj: z.string().nullish(),
  itens: z.array(itemExtraidoSchema),
});

const extracaoSchema = z.object({
  fornecedores: z.array(fornecedorExtraidoSchema),
});

export type ExtracaoHomologacao = z.infer<typeof extracaoSchema>;

// Formato de "termo_homologacao_export_processos" (export do sistema de
// pregão): dentro da mesma planilha, cada fornecedor vencedor começa com uma
// linha só na coluna A no formato "Fornecedor: NOME- CNPJ", seguida de uma
// linha de cabeçalho de colunas, seguida das linhas de item daquele
// fornecedor — até a próxima linha "Fornecedor:" ou o fim da planilha. Ver
// briefing_upload_homologacao.md (decisão de trocar PDF+IA por planilha
// determinística, após a extração de texto de PDF se mostrar não-confiável
// para o layout tabular real desse sistema — colunas saíam fora de ordem).
const REGEX_FORNECEDOR = /^Fornecedor\s*:\s*(.+?)\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\s*$/i;

function paraTexto(valor: unknown): string {
  return valor == null ? '' : String(valor).trim();
}

@Injectable()
export class ExtracaoHomologacaoService {
  // Síncrono e determinístico — sem chamada externa, sem custo por
  // documento. Ainda assim passa pelo schema zod antes de devolver: mesmo
  // uma planilha estruturada pode vir de um upload errado (aba vazia, outro
  // relatório) e é melhor falhar cedo com mensagem clara do que gravar lixo.
  async extrair(buffer: Buffer): Promise<ExtracaoHomologacao> {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      throw new Error('Não foi possível ler o arquivo como planilha (.xlsx) — confira se o arquivo não está corrompido');
    }

    const nomeAba = workbook.SheetNames[0];
    if (!nomeAba) throw new Error('A planilha não tem nenhuma aba');
    const planilha = workbook.Sheets[nomeAba];
    // raw: true — célula numérica chega como number (ver common/numero-planilha.ts).
    const linhas: unknown[][] = XLSX.utils.sheet_to_json(planilha, { header: 1, raw: true, defval: '' });

    const fornecedores: { nome: string; cnpj: string | null; itens: { numeroItem: string | null; descricao: string; unidade: string | null; quantidade: number | null; valorUnitario: number | null }[] }[] = [];
    let atual: (typeof fornecedores)[number] | null = null;

    for (const linha of linhas) {
      const primeiraCelula = paraTexto(linha[0]);
      const matchFornecedor = primeiraCelula.match(REGEX_FORNECEDOR);
      if (matchFornecedor) {
        atual = { nome: matchFornecedor[1].trim(), cnpj: matchFornecedor[2], itens: [] };
        fornecedores.push(atual);
        continue;
      }

      // Linha de cabeçalho de colunas (repete a cada bloco de fornecedor) — pula.
      if (primeiraCelula.toUpperCase() === 'ITEM') continue;

      if (!atual) continue; // nada antes do primeiro "Fornecedor:" encontrado
      const descricao = paraTexto(linha[3]);
      if (!descricao) continue; // linha em branco entre blocos

      atual.itens.push({
        numeroItem: paraTexto(linha[0]) || null,
        descricao,
        unidade: paraTexto(linha[2]) || null,
        quantidade: paraNumeroPlanilha(linha[1]),
        valorUnitario: paraNumeroPlanilha(linha[6]), // coluna "UNITÁRIO ADJUDICADO" — o preço realmente homologado, não o orçado
      });
    }

    if (!fornecedores.length) {
      throw new Error(
        'Nenhum fornecedor encontrado na planilha — a primeira coluna de cada bloco precisa estar no formato "Fornecedor: NOME- CNPJ"',
      );
    }

    const parsed = extracaoSchema.safeParse({ fornecedores });
    if (!parsed.success) throw new Error(`Planilha em formato inesperado: ${parsed.error.message}`);
    return parsed.data;
  }
}

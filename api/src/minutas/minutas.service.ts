import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import * as JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { formatarDataPura } from '../common/datas';
import {
  aditivos,
  atas,
  contratoApostilamentos,
  contratos,
  itensContrato,
  minutaModelos,
} from '../db/schema';

export type TipoMinuta = 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO';
export const TIPOS_MINUTA: TipoMinuta[] = ['ARP', 'CONTRATO', 'ADITIVO', 'APOSTILAMENTO'];

type ArquivoRecebido = { originalname: string; buffer: Buffer };

// Marcadores disponíveis por tipo — a tela de upload em Configurações lista
// isto para quem está preparando o .docx do modelo (MODELO.md, seção 8).
// `descricao` é só para exibição; a chave usada no substring `{{chave}}` é
// `marcador`. Mantidos em ordem alfabética dentro de cada tipo.
const MARCADORES_POR_TIPO: Record<TipoMinuta, { marcador: string; descricao: string }[]> = {
  ARP: [
    { marcador: 'fornecedor_cnpj', descricao: 'CNPJ do detentor principal da ata' },
    { marcador: 'fornecedor_razao_social', descricao: 'Razão social do detentor principal da ata' },
    { marcador: 'licitacao_numero', descricao: 'Número da licitação de origem' },
    { marcador: 'numero_arp', descricao: 'Número da ata de registro de preços' },
    { marcador: 'vigencia_final', descricao: 'Data final de vigência da ata' },
    { marcador: 'vigencia_inicial', descricao: 'Data inicial de vigência da ata' },
  ],
  CONTRATO: [
    { marcador: 'data_assinatura', descricao: 'Data de assinatura do contrato' },
    { marcador: 'fornecedor_cnpj', descricao: 'CNPJ do fornecedor contratado' },
    { marcador: 'fornecedor_razao_social', descricao: 'Razão social do fornecedor contratado' },
    { marcador: 'licitacao_numero', descricao: 'Número da licitação de origem' },
    { marcador: 'numero_contrato', descricao: 'Número do contrato' },
    { marcador: 'numero_processo', descricao: 'Número do processo administrativo' },
    { marcador: 'objeto_contrato', descricao: 'Objeto do contrato' },
    { marcador: 'orgao_gerenciador', descricao: 'Órgão gerenciador do contrato' },
    { marcador: 'valor_original', descricao: 'Valor original do contrato, na assinatura (antes de qualquer aditivo)' },
    { marcador: 'valor_total', descricao: 'Valor total atual do contrato (itens + aditivos de valor)' },
    { marcador: 'vigencia_final', descricao: 'Data final de vigência do contrato' },
    { marcador: 'vigencia_inicial', descricao: 'Data inicial de vigência do contrato' },
  ],
  ADITIVO: [
    { marcador: 'data_assinatura', descricao: 'Data de assinatura do aditivo' },
    { marcador: 'dias_prorrogacao', descricao: 'Dias de prorrogação (só no tipo Prazo)' },
    { marcador: 'fundamento_legal', descricao: 'Fundamento legal citado no aditivo' },
    { marcador: 'justificativa', descricao: 'Justificativa do aditivo' },
    { marcador: 'numero_aditivo', descricao: 'Número do termo aditivo' },
    { marcador: 'numero_contrato', descricao: 'Número do contrato aditado' },
    { marcador: 'percentual', descricao: 'Percentual do aditivo (tipos Valor/Supressão/Acréscimo especial)' },
    { marcador: 'tipo_aditivo', descricao: 'Tipo do aditivo (Valor, Prazo, Quantidade, Supressão, Acréscimo especial)' },
    { marcador: 'valor_acrescimo', descricao: 'Valor do acréscimo ou decréscimo' },
  ],
  APOSTILAMENTO: [
    { marcador: 'data', descricao: 'Data do registro do apostilamento' },
    { marcador: 'descricao', descricao: 'Descrição do que está sendo registrado' },
    { marcador: 'numero_contrato', descricao: 'Número do contrato apostilado' },
    { marcador: 'tipo_apostilamento', descricao: 'Tipo do apostilamento' },
    { marcador: 'valor_anterior', descricao: 'Valor anterior (quando informado)' },
    { marcador: 'valor_novo', descricao: 'Valor novo (quando informado)' },
  ],
};

const TIPO_ADITIVO_LABEL: Record<string, string> = {
  VALOR: 'Acréscimo de valor', PRAZO: 'Prorrogação de prazo', QUANTIDADE: 'Acréscimo de quantidade',
  SUPRESSAO: 'Supressão', ACRESCIMO_ESPECIAL: 'Acréscimo especial',
};
const TIPO_APOSTILAMENTO_LABEL: Record<string, string> = {
  REAJUSTE_REPACTUACAO: 'Reajuste/repactuação', ATUALIZACAO_FINANCEIRA: 'Atualização financeira',
  ALTERACAO_RAZAO_SOCIAL: 'Alteração de razão social', EMPENHO_DOTACAO: 'Empenho de dotação',
};

// Vigências e datas de assinatura são datas puras (meia-noite UTC) — formatar
// no fuso do servidor imprimia o dia anterior. Já a data de registro de um
// apostilamento é um instante real, mostrado no fuso do órgão.
const fmtData = (d: unknown) => formatarDataPura(d as Date | string | null);
const fmtInstante = (d: unknown) => (d ? new Date(d as string).toLocaleDateString('pt-BR', { timeZone: process.env.FUSO_HORARIO || 'America/Sao_Paulo' }) : '');
const fmtMoeda = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));

// Escapa os 5 caracteres especiais de XML — necessário porque o valor
// substituído (razão social, objeto etc.) é texto livre digitado por quem
// cadastrou o registro, e pode conter '&', '<' etc., que quebrariam o XML
// do .docx se colados sem escapar.
function escapeXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

const REGEX_MARCADOR = /\{\{(\w+)\}\}/g;

// Substitui {{marcador}} num XML do Word. O Word costuma partir o texto de um
// parágrafo em vários trechos (<w:t>) — por revisão ortográfica, mudança de
// formatação no meio, histórico de edição —, e um marcador digitado de uma
// vez pode acabar como "{{numero_" + "contrato}}" em trechos vizinhos. Uma
// troca direta sobre o XML não enxerga esse marcador e o documento sai com o
// texto "{{...}}" cru. Aqui cada parágrafo é tratado pelo seu texto
// concatenado: o valor entra no trecho onde o marcador começa e o restante do
// marcador é removido dos trechos seguintes — a formatação dos trechos fica
// intacta.
export function preencherMarcadores(xml: string, dados: Record<string, string>): string {
  return xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragrafo) => {
    const trechos: { inicio: number; fim: number; texto: string }[] = [];
    const reTexto = /(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g;
    let m: RegExpExecArray | null;
    while ((m = reTexto.exec(paragrafo))) {
      const inicio = m.index + m[1].length;
      trechos.push({ inicio, fim: inicio + m[2].length, texto: m[2] });
    }
    if (!trechos.length) return paragrafo;

    const completo = trechos.map((t) => t.texto).join('');
    if (!completo.includes('{{')) return paragrafo;

    // posição de cada trecho dentro do texto concatenado
    const limites: number[] = [];
    let acumulado = 0;
    for (const t of trechos) { limites.push(acumulado); acumulado += t.texto.length; }
    const novos = trechos.map((t) => t.texto.split(''));

    for (const achado of completo.matchAll(REGEX_MARCADOR)) {
      const valor = dados[achado[1]];
      if (valor === undefined) continue; // marcador desconhecido fica como está
      const de = achado.index!;
      const ate = de + achado[0].length;
      let escrito = false;
      trechos.forEach((t, i) => {
        const ini = limites[i];
        for (let pos = Math.max(de, ini); pos < Math.min(ate, ini + t.texto.length); pos++) {
          novos[i][pos - ini] = escrito ? '' : escapeXml(valor);
          escrito = true;
        }
      });
    }

    let saida = '';
    let cursor = 0;
    trechos.forEach((t, i) => {
      saida += paragrafo.slice(cursor, t.inicio) + novos[i].join('');
      cursor = t.fim;
    });
    return saida + paragrafo.slice(cursor);
  });
}

@Injectable()
export class MinutasService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  private uploadsDir(): string {
    const dir = process.env.MINUTAS_UPLOADS_DIR || join(process.cwd(), 'uploads', 'minutas');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  marcadoresPorTipo(): Record<TipoMinuta, { marcador: string; descricao: string }[]> {
    return MARCADORES_POR_TIPO;
  }

  async listarModelos(tenantId: string) {
    const rows = await this.db.select().from(minutaModelos).where(eq(minutaModelos.tenantId, tenantId));
    const porTipo = new Map(rows.map((r) => [r.tipo, r]));
    const modelos = TIPOS_MINUTA.map((tipo) => {
      const row = porTipo.get(tipo);
      return { tipo, carregado: !!row, arquivoNome: row?.arquivoNome ?? null, enviadoEm: row?.enviadoEm ?? null };
    });
    return { modelos, prontos: modelos.filter((m) => m.carregado).length, total: TIPOS_MINUTA.length };
  }

  // Upload restrito ao Administrador do tenant (MODELO.md, seção 8) —
  // checado aqui, não só no controller, porque o teste de invariante chama
  // este método direto. Reenviar o mesmo tipo substitui o modelo anterior
  // (UPSERT por tenantId+tipo) — nunca acumula versões antigas no disco nem
  // na tabela.
  async enviarModelo(tenantId: string, usuarioId: string, tipoUsuario: 'ADMIN' | 'PADRAO', tipo: string, arquivo: ArquivoRecebido) {
    if (tipoUsuario !== 'ADMIN') {
      throw new ForbiddenException('Somente o Administrador do tenant cadastra modelos de minuta');
    }
    if (!TIPOS_MINUTA.includes(tipo as TipoMinuta)) {
      throw new BadRequestException(`Tipo de minuta inválido: ${tipo}`);
    }
    if (!arquivo.originalname.toLowerCase().endsWith('.docx')) {
      throw new BadRequestException('Envie um arquivo .docx');
    }
    try {
      await JSZip.loadAsync(arquivo.buffer);
    } catch {
      throw new BadRequestException('Arquivo .docx inválido ou corrompido');
    }

    const nomeGerado = `${randomUUID()}.docx`;
    const caminho = join(this.uploadsDir(), nomeGerado);
    await writeFile(caminho, arquivo.buffer);

    const [existente] = await this.db.select({ id: minutaModelos.id, arquivoPath: minutaModelos.arquivoPath }).from(minutaModelos).where(and(eq(minutaModelos.tenantId, tenantId), eq(minutaModelos.tipo, tipo as TipoMinuta)));
    const valores = { arquivoNome: arquivo.originalname, arquivoPath: caminho, tamanhoBytes: arquivo.buffer.length, enviadoPor: usuarioId, enviadoEm: new Date() };
    if (existente) {
      await this.db.update(minutaModelos).set(valores).where(eq(minutaModelos.id, existente.id));
      // O modelo anterior não é mais referenciado por ninguém — sai do disco
      // (falha ao apagar não invalida o envio do novo).
      await unlink(existente.arquivoPath).catch(() => undefined);
    } else {
      await this.db.insert(minutaModelos).values({ tenantId, tipo: tipo as TipoMinuta, ...valores });
    }
  }

  // Gera o .docx substituindo {{marcador}} pelos dados de `entidadeId` (o id
  // do contrato/ata/aditivo/apostilamento, conforme `tipo`). Sem modelo
  // cadastrado para o tipo, rejeita — sem fallback, sem modelo de sistema
  // (MODELO.md, seção 8 / invariante 10).
  async gerar(tenantId: string, tipo: string, entidadeId: string): Promise<Buffer> {
    if (!TIPOS_MINUTA.includes(tipo as TipoMinuta)) {
      throw new BadRequestException(`Tipo de minuta inválido: ${tipo}`);
    }
    const [modelo] = await this.db.select().from(minutaModelos).where(and(eq(minutaModelos.tenantId, tenantId), eq(minutaModelos.tipo, tipo as TipoMinuta)));
    if (!modelo) {
      throw new BadRequestException(`Nenhum modelo de minuta cadastrado para o tipo ${tipo} — cadastre em Configurações antes de gerar este documento`);
    }

    const dados = await this.resolverDados(tenantId, tipo as TipoMinuta, entidadeId);

    const bufferModelo = await readFile(modelo.arquivoPath);
    const zip = await JSZip.loadAsync(bufferModelo);
    if (!zip.file('word/document.xml')) throw new BadRequestException('Modelo de minuta corrompido — reenvie o arquivo em Configurações');
    // Corpo, cabeçalhos e rodapés — o número do contrato no cabeçalho é tão
    // comum num modelo quanto no corpo.
    const partes = Object.keys(zip.files).filter((nome) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(nome));
    for (const nome of partes) {
      const xml = await zip.file(nome)!.async('string');
      zip.file(nome, preencherMarcadores(xml, dados));
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  private async resolverDados(tenantId: string, tipo: TipoMinuta, entidadeId: string): Promise<Record<string, string>> {
    switch (tipo) {
      case 'CONTRATO': return this.dadosContrato(tenantId, entidadeId);
      case 'ARP': return this.dadosAta(tenantId, entidadeId);
      case 'ADITIVO': return this.dadosAditivo(tenantId, entidadeId);
      case 'APOSTILAMENTO': return this.dadosApostilamento(tenantId, entidadeId);
    }
  }

  private async dadosContrato(tenantId: string, contratoId: string): Promise<Record<string, string>> {
    const row = await this.db.query.contratos.findFirst({
      where: and(eq(contratos.id, contratoId), eq(contratos.tenantId, tenantId)),
      with: { fornecedor: true, orgaoGerenciador: true, licitacao: true },
    });
    if (!row) throw new NotFoundException('Contrato não encontrado para este tenant');
    // Valor total ATUAL (itens + aditivos de valor − supressões), o mesmo que
    // a tela do contrato mostra — o valor original fica em {{valor_original}}.
    const [itens] = await this.db
      .select({ total: sql<string>`coalesce(sum(${itensContrato.quantidade} * ${itensContrato.valorUnitario}), 0)` })
      .from(itensContrato)
      .where(eq(itensContrato.contratoId, contratoId));
    const [adit] = await this.db
      .select({ total: sql<string>`coalesce(sum(case when ${aditivos.tipo} = 'SUPRESSAO' then -${aditivos.valorAcrescimo} else ${aditivos.valorAcrescimo} end), 0)` })
      .from(aditivos)
      .where(and(eq(aditivos.contratoId, contratoId), sql`${aditivos.tipo} in ('VALOR', 'SUPRESSAO')`));
    const valorAtual = Number(itens?.total ?? 0) + Number(adit?.total ?? 0);
    return {
      numero_contrato: row.numero,
      numero_processo: row.numeroProcesso,
      objeto_contrato: row.objeto,
      fornecedor_razao_social: row.fornecedor.razaoSocial,
      fornecedor_cnpj: row.fornecedor.cnpjCpf,
      orgao_gerenciador: row.orgaoGerenciador.titulo,
      licitacao_numero: row.licitacao.numero,
      vigencia_inicial: fmtData(row.vigenciaInicial),
      vigencia_final: fmtData(row.vigenciaFinal),
      data_assinatura: fmtData(row.dataAssinatura),
      valor_original: fmtMoeda(row.valorOriginal),
      valor_total: fmtMoeda(valorAtual),
    };
  }

  private async dadosAta(tenantId: string, ataId: string): Promise<Record<string, string>> {
    const row = await this.db.query.atas.findFirst({
      where: and(eq(atas.id, ataId), eq(atas.tenantId, tenantId)),
      with: { detentorPrincipal: true, licitacao: true },
    });
    if (!row) throw new NotFoundException('Ata não encontrada para este tenant');
    return {
      numero_arp: row.numeroArp,
      fornecedor_razao_social: row.detentorPrincipal.razaoSocial,
      fornecedor_cnpj: row.detentorPrincipal.cnpjCpf,
      licitacao_numero: row.licitacao.numero,
      vigencia_inicial: fmtData(row.vigenciaInicial),
      vigencia_final: fmtData(row.vigenciaFinal),
    };
  }

  private async dadosAditivo(tenantId: string, aditivoId: string): Promise<Record<string, string>> {
    const row = await this.db.query.aditivos.findFirst({
      where: and(eq(aditivos.id, aditivoId), eq(aditivos.tenantId, tenantId)),
      with: { contrato: true },
    });
    if (!row) throw new NotFoundException('Aditivo não encontrado para este tenant');
    return {
      numero_aditivo: row.numero,
      numero_contrato: row.contrato.numero,
      tipo_aditivo: TIPO_ADITIVO_LABEL[row.tipo] ?? row.tipo,
      percentual: row.percentual ?? '',
      valor_acrescimo: fmtMoeda(row.valorAcrescimo),
      dias_prorrogacao: row.diasProrrogacao != null ? String(row.diasProrrogacao) : '',
      fundamento_legal: row.fundamentoLegal,
      justificativa: row.justificativa,
      data_assinatura: fmtData(row.dataAssinatura),
    };
  }

  private async dadosApostilamento(tenantId: string, apostilamentoId: string): Promise<Record<string, string>> {
    const row = await this.db.query.contratoApostilamentos.findFirst({
      where: and(eq(contratoApostilamentos.id, apostilamentoId), eq(contratoApostilamentos.tenantId, tenantId)),
      with: { contrato: true },
    });
    if (!row) throw new NotFoundException('Apostilamento não encontrado para este tenant');
    return {
      numero_contrato: row.contrato.numero,
      tipo_apostilamento: TIPO_APOSTILAMENTO_LABEL[row.tipo] ?? row.tipo,
      descricao: row.descricao,
      valor_anterior: row.valorAnterior != null ? fmtMoeda(row.valorAnterior) : '',
      valor_novo: row.valorNovo != null ? fmtMoeda(row.valorNovo) : '',
      data: fmtInstante(row.criadoEm),
    };
  }
}

import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { formatarDiaBR, formatarInstanteBR } from '../common/datas';
import { calcularSaldoContrato } from '../contratos/contratos.service';
import {
  aditivos,
  atas,
  contratoApostilamentos,
  contratos,
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

const fmtMoeda = (v: unknown) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

// Escapa os 5 caracteres especiais de XML — necessário porque o valor
// substituído (razão social, objeto etc.) é texto livre digitado por quem
// cadastrou o registro, e pode conter '&', '<' etc., que quebrariam o XML
// do .docx se colados sem escapar.
function escapeXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// O Word costuma quebrar um marcador em vários trechos de texto (<w:t>) —
// basta o corretor ortográfico, uma mudança de formatação no meio ou o
// histórico de edição: "{{numero_" num <w:t> e "contrato}}" no seguinte. Uma
// regex sobre o XML bruto não enxergava esses marcadores, que saíam no
// documento sem substituição e sem erro. Aqui o texto de cada parágrafo é
// remontado, os marcadores são achados no texto contínuo e o valor vai para o
// primeiro trecho onde o marcador começa; o resto do marcador é removido dos
// trechos seguintes (a formatação do primeiro trecho é a que vale).
const REGEX_PARAGRAFO = /<w:p[ >][\s\S]*?<\/w:p>/g;
const REGEX_TEXTO = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;

export function substituirMarcadores(xml: string, dados: Record<string, string>): string {
  return xml.replace(REGEX_PARAGRAFO, (paragrafo) => {
    const trechos: { inicio: number; fim: number; texto: string }[] = [];
    let m: RegExpExecArray | null;
    REGEX_TEXTO.lastIndex = 0;
    while ((m = REGEX_TEXTO.exec(paragrafo))) trechos.push({ inicio: m.index, fim: m.index + m[0].length, texto: m[1] });
    if (!trechos.length) return paragrafo;

    const textos = trechos.map((t) => t.texto);
    const completo = textos.join('');
    if (!completo.includes('{{')) return paragrafo;

    const offsets: number[] = [];
    textos.reduce((acc, t, i) => { offsets[i] = acc; return acc + t.length; }, 0);
    const trechoDe = (pos: number) => { let i = 0; while (i + 1 < offsets.length && offsets[i + 1] <= pos) i++; return i; };

    const achados = [...completo.matchAll(/\{\{(\w+)\}\}/g)].filter((a) => dados[a[1]] !== undefined);
    if (!achados.length) return paragrafo;
    const alterados = new Set<number>();
    // de trás para frente: editar um marcador não desloca os anteriores
    for (const achado of achados.reverse()) {
      const ini = achado.index!;
      const fim = ini + achado[0].length;
      const a = trechoDe(ini);
      const b = trechoDe(fim - 1);
      const valor = escapeXml(dados[achado[1]]);
      if (a === b) {
        textos[a] = textos[a].slice(0, ini - offsets[a]) + valor + textos[a].slice(fim - offsets[a]);
      } else {
        textos[a] = textos[a].slice(0, ini - offsets[a]) + valor;
        for (let i = a + 1; i < b; i++) textos[i] = '';
        textos[b] = textos[b].slice(fim - offsets[b]);
        for (let i = a + 1; i <= b; i++) alterados.add(i);
      }
      alterados.add(a);
    }

    let resultado = '';
    let cursor = 0;
    trechos.forEach((t, i) => {
      resultado += paragrafo.slice(cursor, t.inicio);
      // xml:space="preserve": sem isso o Word descarta espaços nas pontas do valor
      resultado += alterados.has(i) ? `<w:t xml:space="preserve">${textos[i]}</w:t>` : paragrafo.slice(t.inicio, t.fim);
      cursor = t.fim;
    });
    return resultado + paragrafo.slice(cursor);
  });
}

// Corpo, cabeçalhos e rodapés — marcador no cabeçalho (ex.: número do
// contrato) também precisa ser preenchido.
const PARTES_COM_TEXTO = /^word\/(document|header\d*|footer\d*)\.xml$/;

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
      // Substitui, não acumula: o arquivo anterior sai do disco. Falha ao
      // apagar (arquivo já removido à mão) não deve derrubar o upload.
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
    for (const nome of Object.keys(zip.files).filter((n) => PARTES_COM_TEXTO.test(n))) {
      const xml = await zip.file(nome)!.async('string');
      zip.file(nome, substituirMarcadores(xml, dados));
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
    return {
      numero_contrato: row.numero,
      numero_processo: row.numeroProcesso,
      objeto_contrato: row.objeto,
      fornecedor_razao_social: row.fornecedor.razaoSocial,
      fornecedor_cnpj: row.fornecedor.cnpjCpf,
      orgao_gerenciador: row.orgaoGerenciador.titulo,
      licitacao_numero: row.licitacao.numero,
      vigencia_inicial: formatarDiaBR(row.vigenciaInicial),
      vigencia_final: formatarDiaBR(row.vigenciaFinal),
      data_assinatura: formatarDiaBR(row.dataAssinatura),
      // Valor ATUAL (itens + aditivos de valor), como o marcador promete —
      // não o valorOriginal, que é só a base do limite legal dos aditivos.
      valor_total: fmtMoeda((await calcularSaldoContrato(this.db, row.id)).valorTotal),
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
      vigencia_inicial: formatarDiaBR(row.vigenciaInicial),
      vigencia_final: formatarDiaBR(row.vigenciaFinal),
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
      data_assinatura: formatarDiaBR(row.dataAssinatura),
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
      data: formatarInstanteBR(row.criadoEm),
    };
  }
}

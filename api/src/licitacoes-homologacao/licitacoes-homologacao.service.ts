import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import {
  atas,
  contratos,
  fornecedores,
  homologacaoFornecedores,
  homologacaoItens,
  licitacaoHomologacoes,
  licitacoes,
} from '../db/schema';
import { ExtracaoHomologacao, ExtracaoHomologacaoService } from './extracao-homologacao.service';
import { PatchFornecedorDto, PatchItemDto } from './dto/homologacao.dto';

type MulterFile = { path: string; originalname: string; size: number };

@Injectable()
export class LicitacoesHomologacaoService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private extracao: ExtracaoHomologacaoService,
  ) {}

  private async validarLicitacao(tenantId: string, licitacaoId: string) {
    const [row] = await this.db.select({ id: licitacoes.id }).from(licitacoes).where(and(eq(licitacoes.id, licitacaoId), eq(licitacoes.tenantId, tenantId)));
    if (!row) throw new NotFoundException('Licitação não encontrada para este tenant');
  }

  private async getHomologacao(tenantId: string, homologacaoId: string) {
    const [row] = await this.db.select().from(licitacaoHomologacoes).where(and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.id, homologacaoId)));
    if (!row) throw new NotFoundException('Homologação não encontrada');
    return row;
  }

  // A partir de 'revisado', os itens viram o teto fixo que Ata/Contrato
  // passam a tratar como imutável (SaldoCeilingService) — editar depois
  // quebraria a premissa de que o teto nunca muda por baixo de quem já o usou.
  private exigirNaoRevisado(homologacao: { status: string }) {
    if (homologacao.status === 'revisado') {
      throw new BadRequestException('Esta homologação já foi revisada — edição bloqueada');
    }
    if (homologacao.status === 'substituido') {
      throw new BadRequestException('Esta homologação foi substituída por um reenvio — edição bloqueada');
    }
  }

  async listar(tenantId: string, licitacaoId: string) {
    await this.validarLicitacao(tenantId, licitacaoId);
    return this.db
      .select()
      .from(licitacaoHomologacoes)
      .where(and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.licitacaoId, licitacaoId)))
      .orderBy(desc(licitacaoHomologacoes.enviadoEm));
  }

  async detalhe(tenantId: string, homologacaoId: string) {
    // orderBy explícito por id — sem isso, o Postgres pode retornar os
    // fornecedores/itens em ordem diferente depois de um UPDATE (a linha
    // editada pode mudar de posição física), e a tela de revisão "pulava" de
    // lugar a cada campo salvo. A ordem em si é arbitrária, só precisa ser
    // estável entre uma chamada e a próxima.
    const row = await this.db.query.licitacaoHomologacoes.findFirst({
      where: and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.id, homologacaoId)),
      with: {
        fornecedores: {
          orderBy: (f, { asc }) => [asc(f.id)],
          with: { itens: { orderBy: (it, { asc }) => [asc(it.id)] }, fornecedor: true },
        },
      },
    });
    if (!row) throw new NotFoundException('Homologação não encontrada');
    return row;
  }

  // Síncrono (volume baixo, e agora determinístico — sem chamada externa):
  // a extração roda dentro da mesma requisição de upload. Qualquer falha
  // (planilha em formato inesperado, sem nenhum "Fornecedor:") vira status
  // 'erro' com detalhe — nunca grava fornecedor/item de homologação a partir
  // de uma extração que não pôde ser validada.
  async upload(tenantId: string, licitacaoId: string, usuarioId: string, file: MulterFile) {
    await this.validarLicitacao(tenantId, licitacaoId);

    const [homologacao] = await this.db
      .insert(licitacaoHomologacoes)
      .values({
        tenantId,
        licitacaoId,
        arquivoNome: file.originalname,
        arquivoPath: file.path,
        tamanhoBytes: file.size,
        enviadoPor: usuarioId,
        status: 'processando',
      })
      .returning();

    try {
      const buffer = await readFile(file.path);
      const extraido = await this.extracao.extrair(buffer);
      // Numa transação só: se qualquer insert falhar no meio (ex.: valor fora
      // da precisão da coluna), nenhum fornecedor/item fica gravado pela
      // metade numa homologação marcada como 'erro'.
      await this.db.transaction(async (tx) => {
        await this.gravarExtracao(tx as unknown as DrizzleDB, tenantId, homologacao.id, extraido);
        await tx.update(licitacaoHomologacoes).set({ status: 'pronto_para_revisao' }).where(and(eq(licitacaoHomologacoes.id, homologacao.id), eq(licitacaoHomologacoes.tenantId, tenantId)));
      });
    } catch (err) {
      const detalhe = err instanceof Error ? err.message : 'Erro desconhecido na extração';
      await this.db.update(licitacaoHomologacoes).set({ status: 'erro', erroDetalhe: detalhe }).where(and(eq(licitacaoHomologacoes.id, homologacao.id), eq(licitacaoHomologacoes.tenantId, tenantId)));
    }

    return this.detalhe(tenantId, homologacao.id);
  }

  private async gravarExtracao(tx: DrizzleDB, tenantId: string, homologacaoId: string, extraido: ExtracaoHomologacao) {
    for (const forn of extraido.fornecedores) {
      const [fRow] = await tx
        .insert(homologacaoFornecedores)
        .values({
          tenantId,
          homologacaoId,
          nomeExtraido: forn.nome?.trim() || '(não identificado)',
          cnpjExtraido: forn.cnpj ?? null,
        })
        .returning();

      if (!forn.itens.length) continue;
      await tx.insert(homologacaoItens).values(
        forn.itens.map((it) => {
          const unidade = it.unidade ?? null;
          const quantidade = it.quantidade ?? null;
          const valorUnitario = it.valorUnitario ?? null;
          return {
            tenantId,
            homologacaoFornecedorId: fRow.id,
            numeroItem: it.numeroItem != null && Number.isFinite(Number(it.numeroItem)) ? Number(it.numeroItem) : null,
            descricao: it.descricao?.trim() || '(descrição não extraída)',
            unidade,
            quantidade: quantidade != null ? String(quantidade) : null,
            valorUnitario: valorUnitario != null ? String(valorUnitario) : null,
            valorTotal: quantidade != null && valorUnitario != null ? String(quantidade * valorUnitario) : null,
            confiancaExtracao: this.confiancaDoItem({ descricao: it.descricao, unidade, quantidade, valorUnitario }),
          };
        }),
      );
    }
  }

  // Heurística simples de completude — não é um score de confiança do
  // modelo, é "quantos campos obrigatórios para o import ainda faltam":
  // guia a tela de revisão (borda amarela) sobre o que merece mais atenção.
  private confiancaDoItem(it: { descricao?: string | null; unidade?: string | null; quantidade?: number | null; valorUnitario?: number | null }): 'alta' | 'media' | 'baixa' {
    const faltantes = [!it.descricao, !it.unidade, it.quantidade == null, it.valorUnitario == null].filter(Boolean).length;
    if (faltantes === 0) return 'alta';
    if (faltantes >= 2) return 'baixa';
    return 'media';
  }

  async patchFornecedor(tenantId: string, homologacaoId: string, fornecedorHomologadoId: string, dto: PatchFornecedorDto) {
    const homologacao = await this.getHomologacao(tenantId, homologacaoId);
    this.exigirNaoRevisado(homologacao);
    const [existente] = await this.db
      .select()
      .from(homologacaoFornecedores)
      .where(and(eq(homologacaoFornecedores.id, fornecedorHomologadoId), eq(homologacaoFornecedores.homologacaoId, homologacaoId), eq(homologacaoFornecedores.tenantId, tenantId)));
    if (!existente) throw new NotFoundException('Fornecedor homologado não encontrado nesta homologação');

    let fornecedorId = dto.fornecedorId;
    if (dto.novoFornecedor) {
      const dup = await this.db.select().from(fornecedores).where(and(eq(fornecedores.tenantId, tenantId), eq(fornecedores.cnpjCpf, dto.novoFornecedor.cnpjCpf)));
      if (dup.length) {
        fornecedorId = dup[0].id;
      } else {
        const [novo] = await this.db
          .insert(fornecedores)
          .values({ tenantId, cnpjCpf: dto.novoFornecedor.cnpjCpf, razaoSocial: dto.novoFornecedor.razaoSocial })
          .returning();
        fornecedorId = novo.id;
      }
    } else if (fornecedorId) {
      const [f] = await this.db.select({ id: fornecedores.id }).from(fornecedores).where(and(eq(fornecedores.id, fornecedorId), eq(fornecedores.tenantId, tenantId)));
      if (!f) throw new BadRequestException('Fornecedor não encontrado para este tenant');
    }

    const patch: Record<string, unknown> = {};
    if (dto.nomeExtraido !== undefined) patch.nomeExtraido = dto.nomeExtraido;
    if (dto.cnpjExtraido !== undefined) patch.cnpjExtraido = dto.cnpjExtraido;
    if (fornecedorId !== undefined) patch.fornecedorId = fornecedorId;
    if (Object.keys(patch).length) {
      await this.db.update(homologacaoFornecedores).set(patch).where(and(eq(homologacaoFornecedores.id, fornecedorHomologadoId), eq(homologacaoFornecedores.tenantId, tenantId)));
    }
    return this.detalhe(tenantId, homologacaoId);
  }

  async patchItem(tenantId: string, homologacaoId: string, itemId: string, dto: PatchItemDto) {
    const homologacao = await this.getHomologacao(tenantId, homologacaoId);
    this.exigirNaoRevisado(homologacao);
    const [existente] = await this.db
      .select({ item: homologacaoItens })
      .from(homologacaoItens)
      .innerJoin(homologacaoFornecedores, eq(homologacaoItens.homologacaoFornecedorId, homologacaoFornecedores.id))
      .where(and(eq(homologacaoItens.id, itemId), eq(homologacaoFornecedores.homologacaoId, homologacaoId), eq(homologacaoItens.tenantId, tenantId)));
    if (!existente) throw new NotFoundException('Item não encontrado nesta homologação');
    const atual = existente.item;

    const novaDescricao = dto.descricao !== undefined ? dto.descricao : atual.descricao;
    const novaUnidade = dto.unidade !== undefined ? dto.unidade : atual.unidade;
    const novaQuantidade = dto.quantidade !== undefined ? dto.quantidade : atual.quantidade !== null ? Number(atual.quantidade) : null;
    const novoValorUnitario = dto.valorUnitario !== undefined ? dto.valorUnitario : atual.valorUnitario !== null ? Number(atual.valorUnitario) : null;

    const patch: Record<string, unknown> = {};
    if (dto.numeroItem !== undefined) patch.numeroItem = dto.numeroItem;
    if (dto.descricao !== undefined) patch.descricao = dto.descricao;
    if (dto.unidade !== undefined) patch.unidade = dto.unidade;
    // dto.quantidade/valorUnitario podem ser `null` (usuário limpou o campo)
    // — nesse caso grava null de verdade na coluna, nunca a string "null"
    // que String(null) produziria.
    if (dto.quantidade !== undefined) patch.quantidade = dto.quantidade == null ? null : String(dto.quantidade);
    if (dto.valorUnitario !== undefined) patch.valorUnitario = dto.valorUnitario == null ? null : String(dto.valorUnitario);
    patch.valorTotal = novaQuantidade != null && novoValorUnitario != null ? String(novaQuantidade * novoValorUnitario) : null;
    patch.confiancaExtracao = this.confiancaDoItem({ descricao: novaDescricao, unidade: novaUnidade, quantidade: novaQuantidade, valorUnitario: novoValorUnitario });

    await this.db.update(homologacaoItens).set(patch).where(and(eq(homologacaoItens.id, itemId), eq(homologacaoItens.tenantId, tenantId)));
    return this.detalhe(tenantId, homologacaoId);
  }

  async concluirRevisao(tenantId: string, homologacaoId: string) {
    const homologacao = await this.getHomologacao(tenantId, homologacaoId);
    if (homologacao.status !== 'pronto_para_revisao') {
      throw new BadRequestException('Só é possível concluir a revisão de uma homologação pronta para revisão');
    }
    const detalhe = await this.detalhe(tenantId, homologacaoId);

    if (!detalhe.fornecedores.length) {
      throw new BadRequestException('Esta homologação não tem nenhum fornecedor extraído');
    }
    for (const f of detalhe.fornecedores) {
      if (!f.fornecedorId) {
        throw new BadRequestException(`Vincule um fornecedor cadastrado para "${f.nomeExtraido}" antes de concluir a revisão`);
      }
      if (!f.itens.length) {
        throw new BadRequestException(`O fornecedor "${f.nomeExtraido}" não tem nenhum item`);
      }
      for (const it of f.itens) {
        if (!it.descricao || !it.unidade || it.quantidade == null || it.valorUnitario == null) {
          throw new BadRequestException(`Preencha descrição, unidade, quantidade e valor unitário de todos os itens de "${f.nomeExtraido}" antes de concluir a revisão`);
        }
        if (Number(it.quantidade) <= 0 || Number(it.valorUnitario) <= 0) {
          throw new BadRequestException(`O item "${it.descricao}" de "${f.nomeExtraido}" precisa ter quantidade e valor unitário maiores que zero`);
        }
      }
    }

    // Só uma homologação revisada vale por licitação (MODELO.md, invariante 3:
    // teto fixo). Antes, concluir um reenvio deixava as duas valendo e o teto
    // de cada fornecedor+item ficava duplicado. O reenvio substitui a
    // anterior só enquanto ela não foi usada por nenhuma ata/contrato; depois
    // disso o teto já está em uso e não pode ser trocado por baixo.
    await this.db.transaction(async (tx) => {
      const anteriores = await tx
        .select({ id: licitacaoHomologacoes.id })
        .from(licitacaoHomologacoes)
        .where(and(
          eq(licitacaoHomologacoes.tenantId, tenantId),
          eq(licitacaoHomologacoes.licitacaoId, homologacao.licitacaoId),
          eq(licitacaoHomologacoes.status, 'revisado'),
          ne(licitacaoHomologacoes.id, homologacaoId),
        ))
        .for('update');

      if (anteriores.length) {
        const fornecedoresAnteriores = await tx
          .select({ id: homologacaoFornecedores.id })
          .from(homologacaoFornecedores)
          .where(inArray(homologacaoFornecedores.homologacaoId, anteriores.map((h) => h.id)));
        const ids = fornecedoresAnteriores.map((f) => f.id);
        if (ids.length) {
          const [ataEmUso] = await tx.select({ id: atas.id }).from(atas).where(and(eq(atas.tenantId, tenantId), inArray(atas.homologacaoFornecedorId, ids)));
          const [contratoEmUso] = await tx.select({ id: contratos.id }).from(contratos).where(and(eq(contratos.tenantId, tenantId), inArray(contratos.homologacaoFornecedorId, ids)));
          if (ataEmUso || contratoEmUso) {
            throw new BadRequestException('Esta licitação já tem uma homologação revisada em uso por ata ou contrato — o teto homologado é fixo e não pode ser substituído por um reenvio');
          }
        }
        await tx.update(licitacaoHomologacoes).set({ status: 'substituido' }).where(inArray(licitacaoHomologacoes.id, anteriores.map((h) => h.id)));
      }

      await tx.update(licitacaoHomologacoes).set({ status: 'revisado' }).where(and(eq(licitacaoHomologacoes.id, homologacaoId), eq(licitacaoHomologacoes.tenantId, tenantId)));
    });
    return this.detalhe(tenantId, homologacaoId);
  }

  // Consumido pelo wizard de Ata/Contrato: devolve os itens já revisados de
  // um fornecedor para aquela licitação, prontos para popular a grade de
  // itens. Procura entre as homologações 'revisado' mais recentes primeiro
  // (reenvio corrigido substitui efetivamente a versão anterior para import).
  async itensParaImportar(tenantId: string, licitacaoId: string, fornecedorId: string) {
    await this.validarLicitacao(tenantId, licitacaoId);
    if (!fornecedorId) throw new BadRequestException('Informe o fornecedor');

    const homologacoesRevisadas = await this.db.query.licitacaoHomologacoes.findMany({
      where: and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.licitacaoId, licitacaoId), eq(licitacaoHomologacoes.status, 'revisado')),
      with: { fornecedores: { with: { itens: { orderBy: (it, { asc }) => [asc(it.id)] } } } },
      orderBy: (h, { desc: descOrder }) => [descOrder(h.enviadoEm)],
    });

    for (const hom of homologacoesRevisadas) {
      const fornecedorHomologado = hom.fornecedores.find((f) => f.fornecedorId === fornecedorId);
      if (fornecedorHomologado) {
        return fornecedorHomologado.itens.map((it) => ({
          homologacaoItemId: it.id,
          descricao: it.descricao,
          unidade: it.unidade ?? '',
          quantidade: Number(it.quantidade),
          valorUnitario: Number(it.valorUnitario),
        }));
      }
    }
    return [];
  }

  // Fornecedores homologados (com status 'revisado') para uma licitação —
  // alimenta o seletor "qual fornecedor" no wizard quando há mais de um.
  async fornecedoresHomologados(tenantId: string, licitacaoId: string) {
    await this.validarLicitacao(tenantId, licitacaoId);
    const homologacoesRevisadas = await this.db.query.licitacaoHomologacoes.findMany({
      where: and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.licitacaoId, licitacaoId), eq(licitacaoHomologacoes.status, 'revisado')),
      with: { fornecedores: { with: { fornecedor: true } } },
      orderBy: (h, { desc: descOrder }) => [descOrder(h.enviadoEm)],
    });
    // Mais recente primeiro e o primeiro visto vence — mesma escolha de
    // itensParaImportar. Sem ordem definida, o homologacaoFornecedorId podia
    // vir de uma homologação e os itens de outra, e o contrato era recusado
    // com "Item não pertence ao fornecedor deste contrato".
    const porId = new Map<string, { id: string; razaoSocial: string; cnpjCpf: string; homologacaoFornecedorId: string }>();
    for (const hom of homologacoesRevisadas) {
      for (const f of hom.fornecedores) {
        if (f.fornecedor && !porId.has(f.fornecedor.id)) porId.set(f.fornecedor.id, { ...f.fornecedor, homologacaoFornecedorId: f.id });
      }
    }
    return [...porId.values()];
  }
}

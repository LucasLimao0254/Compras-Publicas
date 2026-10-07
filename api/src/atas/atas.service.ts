import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import {
  ataItens,
  ataLotes,
  ataOrgaos,
  ataProrrogacoes,
  ataRemanejamentos,
  atas,
  contratos,
  fornecedores,
  homologacaoFornecedores,
  homologacaoItens,
  itensContrato,
  licitacaoHomologacoes,
  licitacoes,
  secretarias,
} from '../db/schema';
import { paraNumeroPlanilha } from '../common/numero-planilha';
import { periodoValido } from '../common/datas';
import { numeroJaUsado } from '../common/numeracao';
import { quantidadeConsumidaDoTeto, SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { ContratosService } from '../contratos/contratos.service';
import { CreateAtaDto, ItemAtaInput, LoteAtaInput, OrgaoAtaInput, ProrrogarAtaDto, RemanejarSaldoDto, UpdateAtaDto } from './dto/ata.dto';

@Injectable()
export class AtasService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private saldoCeiling: SaldoCeilingService,
    private contratosService: ContratosService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.db.query.atas.findMany({
      where: eq(atas.tenantId, tenantId),
      with: { licitacao: true, detentorPrincipal: true, orgaos: { with: { itens: true } } },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
    // Uma consulta de consumo para todas as atas (antes, uma por ata).
    const contratadas = await this.quantidadeContratadaPorItens(this.db, rows.flatMap((r) => r.orgaos.flatMap((o) => o.itens.map((i) => i.id))));
    return rows.map((r) => this.comSaldoResumo(r, contratadas));
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.query.atas.findFirst({
      where: and(eq(atas.tenantId, tenantId), eq(atas.id, id)),
      with: { licitacao: true, detentorPrincipal: true, orgaos: { with: { secretaria: true, itens: true } } },
    });
    if (!row) throw new NotFoundException('Ata não encontrada');

    const contratadas = await this.quantidadeContratadaPorItens(this.db, row.orgaos.flatMap((o) => o.itens.map((i) => i.id)));
    const orgaosComSaldo = await Promise.all(
      row.orgaos.map(async (o) => {
        const utilizado = this.valorContratado(o.itens, contratadas);
        const valorTotal = o.itens.reduce((acc, it) => acc + Number(it.quantidadeContratada) * Number(it.valorUnitario), 0);
        return {
          id: o.id,
          secretaria: o.secretaria,
          perfil: o.perfil,
          quantidadeItens: o.itens.length,
          valorTotal,
          valorUtilizado: utilizado,
          saldoDisponivel: valorTotal - utilizado,
        };
      }),
    );

    const valorTotal = orgaosComSaldo.reduce((acc, o) => acc + o.valorTotal, 0);
    const valorUtilizado = orgaosComSaldo.reduce((acc, o) => acc + o.valorUtilizado, 0);
    const { orgaos, ...rest } = row;
    return { ...rest, orgaos: orgaosComSaldo, valorTotal, valorUtilizado, saldoDisponivel: valorTotal - valorUtilizado };
  }

  // Resumo usado na listagem: mesmo cálculo de saldo, sem detalhar por órgão.
  private comSaldoResumo<T extends { orgaos: { itens: { quantidadeContratada: string; valorUnitario: string; id: string }[] }[] }>(ata: T, contratadas: Map<string, number>) {
    const valorTotal = ata.orgaos.reduce(
      (acc, o) => acc + o.itens.reduce((a2, it) => a2 + Number(it.quantidadeContratada) * Number(it.valorUnitario), 0),
      0,
    );
    const utilizado = this.valorContratado(ata.orgaos.flatMap((o) => o.itens), contratadas);
    const { orgaos, ...rest } = ata;
    return {
      ...rest,
      quantidadeOrgaos: orgaos.length,
      valorTotal,
      valorUtilizado: utilizado,
      saldoDisponivel: valorTotal - utilizado,
    };
  }

  // Quantidade de cada item de ata já abatida por contratos do mesmo órgão —
  // mesma regra de SaldoCeilingService.ataItemSaldoDisponivel (contrato do
  // ataOrgaoId cujo item aponta pro mesmo item homologado), só que em lote.
  // Contrato nunca é gravado como "consumo" na ata: é sempre somado na leitura.
  private async quantidadeContratadaPorItens(dbOrTx: DrizzleDB, ataItemIds: string[]) {
    if (!ataItemIds.length) return new Map<string, number>();
    const rows = await dbOrTx
      .select({ ataItemId: ataItens.id, total: sql<string>`coalesce(sum(${quantidadeConsumidaDoTeto}), 0)` })
      .from(ataItens)
      .innerJoin(itensContrato, eq(itensContrato.homologacaoItemId, ataItens.homologacaoItemId))
      .innerJoin(contratos, and(eq(itensContrato.contratoId, contratos.id), eq(contratos.ataOrgaoId, ataItens.ataOrgaoId)))
      .where(inArray(ataItens.id, ataItemIds))
      .groupBy(ataItens.id);
    return new Map(rows.map((r) => [r.ataItemId, Number(r.total)]));
  }

  // Valor (quantidade contratada × preço do item na ata) — o mesmo preço usado
  // para o valor reservado, para o saldo da ata nunca ficar negativo só porque
  // o preço digitado no contrato difere.
  private valorContratado(itens: { id: string; valorUnitario: string }[], contratadas: Map<string, number>) {
    return itens.reduce((acc, it) => acc + (contratadas.get(it.id) ?? 0) * Number(it.valorUnitario), 0);
  }

  // Quantidade (não valor monetário) já consumida de um único item da ata:
  // pelos contratos que abatem dele — ordem nunca abate direto de uma ata
  // (ver MODELO.md, seção 2), então este é o único consumo possível.
  private async quantidadeUsadaPorItem(dbOrTx: DrizzleDB, ataItemId: string) {
    return (await this.quantidadeContratadaPorItens(dbOrTx, [ataItemId])).get(ataItemId) ?? 0;
  }

  private async validarOrgao(tenantId: string, ataId: string, ataOrgaoId: string) {
    const [orgao] = await this.db
      .select()
      .from(ataOrgaos)
      .where(and(eq(ataOrgaos.id, ataOrgaoId), eq(ataOrgaos.ataId, ataId), eq(ataOrgaos.tenantId, tenantId)));
    if (!orgao) throw new NotFoundException('Órgão não encontrado para esta ata');
    return orgao;
  }

  async create(tenantId: string, dto: CreateAtaDto) {
    await this.recusarNumeroUsado(tenantId, dto.numeroArp);

    const [licitacao] = await this.db.select({ id: licitacoes.id }).from(licitacoes).where(and(eq(licitacoes.id, dto.licitacaoId), eq(licitacoes.tenantId, tenantId)));
    if (!licitacao) throw new BadRequestException('Licitação não encontrada para este tenant');
    if (!periodoValido(dto.vigenciaInicial, dto.vigenciaFinal)) {
      throw new BadRequestException('A vigência inicial não pode ser posterior à vigência final');
    }

    const [detentor] = await this.db.select({ id: fornecedores.id }).from(fornecedores).where(and(eq(fornecedores.id, dto.detentorPrincipalId), eq(fornecedores.tenantId, tenantId)));
    if (!detentor) throw new BadRequestException('Detentor principal não encontrado para este tenant');

    // Licitação com homologação revisada: o detentor precisa ser um dos
    // vencedores homologados, e a ata nasce vinculada a ele (MODELO.md,
    // invariantes 2 e 4) — antes dava para escolher qualquer fornecedor.
    if (!dto.homologacaoFornecedorId) {
      const [revisada] = await this.db.select({ id: licitacaoHomologacoes.id }).from(licitacaoHomologacoes)
        .where(and(eq(licitacaoHomologacoes.tenantId, tenantId), eq(licitacaoHomologacoes.licitacaoId, dto.licitacaoId), eq(licitacaoHomologacoes.status, 'revisado')));
      if (revisada) throw new BadRequestException('Esta licitação tem homologação — o detentor principal precisa ser um dos fornecedores homologados');
    }

    if (dto.homologacaoFornecedorId) {
      await this.validarHomologacaoFornecedor(tenantId, dto.homologacaoFornecedorId, dto.licitacaoId, dto.detentorPrincipalId);
      const [ataExistente] = await this.db.select({ id: atas.id }).from(atas).where(eq(atas.homologacaoFornecedorId, dto.homologacaoFornecedorId));
      if (ataExistente) throw new ConflictException('Este fornecedor homologado já tem uma ata — só é permitida uma por fornecedor');
    }

    if (dto.orgaos?.length) {
      await this.validarSecretarias(tenantId, dto.orgaos);
    }

    const [created] = await this.db
      .insert(atas)
      .values({
        tenantId,
        tipo: (dto.tipo as any) ?? 'ATAS',
        numeroArp: dto.numeroArp,
        licitacaoId: dto.licitacaoId,
        detentorPrincipalId: dto.detentorPrincipalId,
        homologacaoFornecedorId: dto.homologacaoFornecedorId,
        vigenciaInicial: new Date(dto.vigenciaInicial),
        vigenciaFinal: new Date(dto.vigenciaFinal),
        atasComLotes: dto.atasComLotes ?? false,
        formaControleSaldo: (dto.formaControleSaldo as any) ?? 'NORMAL',
        casasDecimaisValor: dto.casasDecimaisValor ?? 2,
        casasDecimaisQuantidade: dto.casasDecimaisQuantidade ?? 3,
        situacao: (dto.situacao as any) ?? 'VIGENTE',
      })
      .returning();

    if (dto.orgaos?.length) {
      await this.db.insert(ataOrgaos).values(dto.orgaos.map((o) => ({ tenantId, ataId: created.id, secretariaId: o.secretariaId, perfil: o.perfil as any })));
    }

    return this.get(tenantId, created.id);
  }

  // Confirma que o fornecedor homologado pertence ao tenant, à mesma
  // licitação da ata e ao mesmo fornecedor real informado, e que a
  // homologação já está travada ('revisado') — sem isso o teto que a ata vai
  // referenciar ainda poderia mudar.
  private async validarHomologacaoFornecedor(tenantId: string, homologacaoFornecedorId: string, licitacaoId: string, detentorPrincipalId: string) {
    const [row] = await this.db
      .select({ fornecedorId: homologacaoFornecedores.fornecedorId, status: licitacaoHomologacoes.status, licitacaoId: licitacaoHomologacoes.licitacaoId })
      .from(homologacaoFornecedores)
      .innerJoin(licitacaoHomologacoes, eq(homologacaoFornecedores.homologacaoId, licitacaoHomologacoes.id))
      .where(and(eq(homologacaoFornecedores.id, homologacaoFornecedorId), eq(homologacaoFornecedores.tenantId, tenantId)));
    if (!row) throw new BadRequestException('Fornecedor homologado não encontrado para este tenant');
    if (row.licitacaoId !== licitacaoId) throw new BadRequestException('Fornecedor homologado não pertence a esta licitação');
    if (row.status !== 'revisado') throw new BadRequestException('A homologação deste fornecedor ainda não foi revisada');
    if (row.fornecedorId !== detentorPrincipalId) throw new BadRequestException('O detentor principal da ata precisa ser o fornecedor vinculado na homologação');
  }

  private async validarSecretarias(tenantId: string, orgaos: OrgaoAtaInput[]) {
    for (const o of orgaos) {
      const [secretaria] = await this.db.select({ id: secretarias.id }).from(secretarias).where(and(eq(secretarias.id, o.secretariaId), eq(secretarias.tenantId, tenantId)));
      if (!secretaria) throw new BadRequestException('Secretaria não encontrada para este tenant');
    }
  }

  // Número já usado por outra ata do tenant — inclusive escrito de outro jeito
  // ("12/2026" × "ARP 012/2026"), ver common/numeracao.ts.
  private async recusarNumeroUsado(tenantId: string, numeroArp: string, excetoId?: string) {
    const existentes = await this.db.select({ id: atas.id, numero: atas.numeroArp }).from(atas).where(eq(atas.tenantId, tenantId));
    const usado = numeroJaUsado(existentes, numeroArp, excetoId);
    if (usado) throw new ConflictException(`O número ${usado} já foi usado por outra ata — escolha um número que ainda não existe`);
  }

  async update(tenantId: string, id: string, dto: UpdateAtaDto) {
    const ata = await this.get(tenantId, id);
    if (dto.vigenciaInicial !== undefined && !periodoValido(dto.vigenciaInicial, ata.vigenciaFinal)) {
      throw new BadRequestException('A vigência inicial não pode ser posterior à vigência final');
    }
    if (dto.numeroArp !== undefined && dto.numeroArp !== ata.numeroArp) {
      await this.recusarNumeroUsado(tenantId, dto.numeroArp, id);
    }
    const patch: Record<string, unknown> = {};
    if (dto.numeroArp !== undefined) patch.numeroArp = dto.numeroArp.trim();
    if (dto.vigenciaInicial !== undefined) patch.vigenciaInicial = new Date(dto.vigenciaInicial);
    if (dto.situacao !== undefined) patch.situacao = dto.situacao as any;
    if (Object.keys(patch).length) {
      await this.db.update(atas).set(patch).where(and(eq(atas.id, id), eq(atas.tenantId, tenantId)));
    }
    return this.get(tenantId, id);
  }

  // Exclusão só pelo Administrador e só de ata da qual nenhum contrato abate.
  // Órgãos, itens, lotes, prorrogações e remanejamentos vão junto (ON DELETE
  // CASCADE); o teto da homologação volta a ficar livre para uma nova ata.
  async remover(tenantId: string, tipoUsuario: string, id: string) {
    if (tipoUsuario !== 'ADMIN') throw new ForbiddenException('Somente o Administrador do tenant exclui atas');
    await this.get(tenantId, id);
    const vinculados = await this.db.select({ numero: contratos.numero }).from(contratos)
      .innerJoin(ataOrgaos, eq(contratos.ataOrgaoId, ataOrgaos.id))
      .where(and(eq(contratos.tenantId, tenantId), eq(ataOrgaos.ataId, id)));
    if (vinculados.length) {
      throw new BadRequestException(`Esta ata tem contrato vinculado (${vinculados.map((c) => c.numero).join(', ')}) — não pode ser excluída. Para tirá-la de uso, mude a situação para Arquivada`);
    }
    await this.db.delete(atas).where(and(eq(atas.id, id), eq(atas.tenantId, tenantId)));
    return { ok: true };
  }

  async addOrgao(tenantId: string, ataId: string, dto: OrgaoAtaInput) {
    await this.get(tenantId, ataId);
    await this.validarSecretarias(tenantId, [dto]);
    const [row] = await this.db.insert(ataOrgaos).values({ tenantId, ataId, secretariaId: dto.secretariaId, perfil: dto.perfil as any }).returning();
    return row;
  }

  // Itens de um órgão com a quantidade já usada (pelos contratos que abatem
  // dele — ordem nunca abate direto de uma ata) e o saldo restante — mesmo
  // papel de ContratosService.itensComSaldo para o wizard.
  async itensDoOrgao(tenantId: string, ataId: string, ataOrgaoId: string) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    const itens = await this.db.select().from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));
    const contratadas = await this.quantidadeContratadaPorItens(this.db, itens.map((it) => it.id));

    return itens.map((it) => {
      const usado = contratadas.get(it.id) ?? 0;
      return { ...it, quantidadeUtilizada: usado, quantidadeDisponivel: Number(it.quantidadeContratada) - usado };
    });
  }

  // Ata vinculada a uma homologação só aceita itens que referenciam um item
  // homologado do próprio fornecedor, com descrição/unidade/valor unitário
  // tirados da homologação (MODELO.md, invariante 2) — nunca do que o
  // cliente digitou. Ata comum (sem homologação) segue aceitando item livre.
  private async itemHomologadoDaAta(tx: DrizzleDB, tenantId: string, ataHomologacaoFornecedorId: string | null, homologacaoItemId: string) {
    const [item] = await tx
      .select()
      .from(homologacaoItens)
      .where(and(eq(homologacaoItens.id, homologacaoItemId), eq(homologacaoItens.tenantId, tenantId)));
    if (!item) throw new BadRequestException('Item homologado não encontrado');
    if (!ataHomologacaoFornecedorId || item.homologacaoFornecedorId !== ataHomologacaoFornecedorId) {
      throw new BadRequestException('Este item homologado não pertence ao fornecedor desta ata');
    }
    return item;
  }

  // O lote informado precisa ser desta mesma ata — sem isso um item podia
  // apontar para o lote de outra ata (ou de outro tenant).
  private async validarLote(dbOrTx: DrizzleDB, tenantId: string, ataId: string, loteId: string | undefined) {
    if (!loteId) return;
    const [lote] = await dbOrTx.select({ id: ataLotes.id }).from(ataLotes).where(and(eq(ataLotes.id, loteId), eq(ataLotes.ataId, ataId), eq(ataLotes.tenantId, tenantId)));
    if (!lote) throw new BadRequestException('Lote não encontrado nesta ata');
  }

  private async homologacaoFornecedorDaAta(dbOrTx: DrizzleDB, tenantId: string, ataId: string) {
    const [ata] = await dbOrTx.select({ homologacaoFornecedorId: atas.homologacaoFornecedorId }).from(atas).where(and(eq(atas.id, ataId), eq(atas.tenantId, tenantId)));
    return ata?.homologacaoFornecedorId ?? null;
  }

  async addItem(tenantId: string, ataId: string, ataOrgaoId: string, dto: ItemAtaInput) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    await this.validarLote(this.db, tenantId, ataId, dto.loteId);

    if (!dto.homologacaoItemId) {
      if (await this.homologacaoFornecedorDaAta(this.db, tenantId, ataId)) {
        throw new BadRequestException('Esta ata está vinculada a uma homologação — selecione um item homologado em vez de digitar o item');
      }
      const existentes = await this.db.select().from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));
      const numeroItem = existentes.length + 1;
      const [row] = await this.db
        .insert(ataItens)
        .values({
          tenantId,
          ataOrgaoId,
          numeroItem,
          descricao: dto.descricao,
          unidade: dto.unidade,
          loteId: dto.loteId,
          quantidadeContratada: String(dto.quantidade),
          valorUnitario: String(dto.valorUnitario),
        })
        .returning();
      return row;
    }

    return this.db.transaction(async (tx) => {
      const ataHomologacaoFornecedorId = await this.homologacaoFornecedorDaAta(tx, tenantId, ataId);
      const item = await this.itemHomologadoDaAta(tx, tenantId, ataHomologacaoFornecedorId, dto.homologacaoItemId!);

      // Um item homologado aparece uma única vez por órgão —
      // SaldoCeilingService.ataItemSaldoDisponivel exige exatamente 1 linha
      // por (ataOrgaoId, homologacaoItemId), e não existe endpoint para apagar
      // item: a duplicata travaria todo contrato contra esse item.
      const [duplicado] = await tx
        .select({ id: ataItens.id })
        .from(ataItens)
        .where(and(eq(ataItens.ataOrgaoId, ataOrgaoId), eq(ataItens.homologacaoItemId, item.id)));
      if (duplicado) {
        throw new BadRequestException('Este item homologado já está neste órgão — edite a quantidade do item existente');
      }

      const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, item.id);
      if (dto.quantidade > disponivel) {
        throw new BadRequestException(`Quantidade (${dto.quantidade}) excede o saldo homologado restante para este item (${disponivel})`);
      }

      const existentes = await tx.select().from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));
      const numeroItem = existentes.length + 1;
      const [row] = await tx
        .insert(ataItens)
        .values({
          tenantId,
          ataOrgaoId,
          numeroItem,
          descricao: item.descricao,
          unidade: item.unidade ?? dto.unidade,
          loteId: dto.loteId,
          quantidadeContratada: String(dto.quantidade),
          valorUnitario: String(item.valorUnitario),
          homologacaoItemId: item.id,
        })
        .returning();
      return row;
    });
  }

  // Reabre o mesmo formulário de "adicionar item", agora fazendo UPDATE —
  // numeroItem nunca muda (mantém a referência estável pra ordens/remanejamentos
  // já existentes). Quando o item é rastreado por homologação, revalida o
  // teto excluindo a própria quantidade atual do item — senão o teto
  // compararia contra si mesmo e nunca deixaria editar pra cima.
  async editarItem(tenantId: string, ataId: string, ataOrgaoId: string, itemId: string, dto: ItemAtaInput) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    await this.validarLote(this.db, tenantId, ataId, dto.loteId);

    return this.db.transaction(async (tx) => {
      const [existente] = await tx
        .select()
        .from(ataItens)
        .where(and(eq(ataItens.id, itemId), eq(ataItens.ataOrgaoId, ataOrgaoId), eq(ataItens.tenantId, tenantId)))
        .for('update');
      if (!existente) throw new NotFoundException('Item não encontrado nesta ata');

      // Nunca deixar a quantidade cair abaixo do que ordens emitidas já
      // consumiram deste item — sem essa checagem, quantidadeDisponivel vira
      // negativo e corrompe todo cálculo de saldo derivado a partir daqui.
      const usado = await this.quantidadeUsadaPorItem(tx, existente.id);
      if (dto.quantidade < usado) {
        throw new BadRequestException(`Quantidade (${dto.quantidade}) não pode ser menor que o total já utilizado em ordens emitidas para este item (${usado})`);
      }

      const homologacaoItemId = dto.homologacaoItemId ?? existente.homologacaoItemId ?? undefined;
      const ataHomologacaoFornecedorId = await this.homologacaoFornecedorDaAta(tx, tenantId, ataId);

      if (!homologacaoItemId) {
        if (ataHomologacaoFornecedorId) {
          throw new BadRequestException('Esta ata está vinculada a uma homologação — o item precisa referenciar um item homologado');
        }
        const [row] = await tx
          .update(ataItens)
          .set({ descricao: dto.descricao, unidade: dto.unidade, loteId: dto.loteId, quantidadeContratada: String(dto.quantidade), valorUnitario: String(dto.valorUnitario), homologacaoItemId: null })
          .where(and(eq(ataItens.id, itemId), eq(ataItens.tenantId, tenantId)))
          .returning();
        return row;
      }

      // Nunca permitir que dois itens do mesmo órgão apontem pro mesmo item
      // homologado — SaldoCeilingService.ataItemSaldoDisponivel exige
      // exatamente 1 linha por (ataOrgaoId, homologacaoItemId) e não existe
      // endpoint pra apagar um item, então essa duplicidade travaria a ata
      // permanentemente (todo POST /contratos contra esse item passaria a
      // 400 "Inconsistência").
      const [duplicado] = await tx
        .select({ id: ataItens.id })
        .from(ataItens)
        .where(and(eq(ataItens.ataOrgaoId, ataOrgaoId), eq(ataItens.homologacaoItemId, homologacaoItemId), ne(ataItens.id, itemId)));
      if (duplicado) {
        throw new BadRequestException('Já existe outro item deste órgão vinculado ao mesmo item homologado');
      }

      const item = await this.itemHomologadoDaAta(tx, tenantId, ataHomologacaoFornecedorId, homologacaoItemId);

      const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, homologacaoItemId);
      const quantidadeAntigaMesmoItem = existente.homologacaoItemId === homologacaoItemId ? Number(existente.quantidadeContratada) : 0;
      const disponivelExcluindoEsteItem = disponivel + quantidadeAntigaMesmoItem;
      if (dto.quantidade > disponivelExcluindoEsteItem) {
        throw new BadRequestException(`Quantidade (${dto.quantidade}) excede o saldo homologado restante para este item (${disponivelExcluindoEsteItem})`);
      }

      const [row] = await tx
        .update(ataItens)
        .set({ descricao: item.descricao, unidade: item.unidade ?? dto.unidade, loteId: dto.loteId, quantidadeContratada: String(dto.quantidade), valorUnitario: String(item.valorUnitario), homologacaoItemId })
        .where(and(eq(ataItens.id, itemId), eq(ataItens.tenantId, tenantId)))
        .returning();
      return row;
    });
  }

  // Histórico de remanejamentos que envolveram este item específico, como
  // origem ou destino — reaproveita ataRemanejamentos, sem tabela nova.
  async historicoItem(tenantId: string, ataId: string, ataOrgaoId: string, itemId: string) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    const [item] = await this.db.select({ id: ataItens.id }).from(ataItens).where(and(eq(ataItens.id, itemId), eq(ataItens.ataOrgaoId, ataOrgaoId), eq(ataItens.tenantId, tenantId)));
    if (!item) throw new NotFoundException('Item não encontrado nesta ata');

    const rows = await this.db.query.ataRemanejamentos.findMany({
      where: and(eq(ataRemanejamentos.tenantId, tenantId), or(eq(ataRemanejamentos.ataItemOrigemId, itemId), eq(ataRemanejamentos.ataItemDestinoId, itemId))),
      with: {
        itemOrigem: { with: { ataOrgao: { with: { secretaria: true } } } },
        itemDestino: { with: { ataOrgao: { with: { secretaria: true } } } },
        usuario: true,
      },
      orderBy: (r, { desc }) => [desc(r.criadoEm)],
    });
    return rows.map(({ usuario: { senhaHash, ...usuario }, ...rest }) => ({ ...rest, usuario }));
  }

  async criarLote(tenantId: string, ataId: string, dto: LoteAtaInput) {
    await this.get(tenantId, ataId);
    const [row] = await this.db.insert(ataLotes).values({ tenantId, ataId, numero: dto.numero, nome: dto.nome }).returning();
    return row;
  }

  async listarLotes(tenantId: string, ataId: string) {
    await this.get(tenantId, ataId);
    const lotes = await this.db.select().from(ataLotes).where(and(eq(ataLotes.ataId, ataId), eq(ataLotes.tenantId, tenantId)));
    if (!lotes.length) return [];

    const contagens = await this.db
      .select({ loteId: ataItens.loteId, total: sql<string>`count(*)` })
      .from(ataItens)
      .innerJoin(ataOrgaos, eq(ataItens.ataOrgaoId, ataOrgaos.id))
      .where(eq(ataOrgaos.ataId, ataId))
      .groupBy(ataItens.loteId);
    const contagemPorLote = new Map(contagens.map((c) => [c.loteId, Number(c.total)]));

    return lotes.map((l) => ({ ...l, quantidadeItens: contagemPorLote.get(l.id) ?? 0 }));
  }

  async removerLote(tenantId: string, ataId: string, loteId: string) {
    await this.get(tenantId, ataId);
    const [lote] = await this.db.select({ id: ataLotes.id }).from(ataLotes).where(and(eq(ataLotes.id, loteId), eq(ataLotes.ataId, ataId), eq(ataLotes.tenantId, tenantId)));
    if (!lote) throw new NotFoundException('Lote não encontrado');
    // Sem onDelete cascade em ataItens.loteId de propósito — apagar um lote
    // com itens ainda vinculados deve estourar erro de FK, não desvincular
    // silenciosamente.
    await this.db.delete(ataLotes).where(eq(ataLotes.id, loteId));
    return { ok: true };
  }

  // Layout fixo (sem mapeamento de colunas na UI): Item, Descrição, Unidade,
  // Quantidade, Preço Unitário, nessa ordem — primeira linha é cabeçalho e é
  // ignorada. Cada linha é validada e inserida independentemente: um erro
  // numa linha não aborta as demais (mesmo princípio da extração de
  // homologação, ver ExtracaoHomologacaoService).
  async importarItens(tenantId: string, ataId: string, ataOrgaoId: string, buffer: Buffer) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    // Esta planilha cadastra itens livres (descrição/preço digitados) — numa
    // ata vinculada a homologação o item só pode vir da homologação.
    if (await this.homologacaoFornecedorDaAta(this.db, tenantId, ataId)) {
      throw new BadRequestException('Esta ata está vinculada a uma homologação — os itens vêm da homologação, não de planilha');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      throw new BadRequestException('Não foi possível ler o arquivo como planilha — confira se não está corrompido');
    }
    const nomeAba = workbook.SheetNames[0];
    if (!nomeAba) throw new BadRequestException('A planilha não tem nenhuma aba');
    // raw: true — célula numérica chega como number (ver common/numero-planilha.ts).
    const linhas: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, raw: true, defval: '' });

    const existentes = await this.db.select({ numeroItem: ataItens.numeroItem }).from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));
    let proximoNumero = existentes.length + 1;

    const erros: { linha: number; motivo: string }[] = [];
    let inseridos = 0;

    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i];
      const [, descricao, unidade, quantidadeStr, precoStr] = linha;
      const descricaoTexto = String(descricao ?? '').trim();
      const unidadeTexto = String(unidade ?? '').trim();
      if (!descricaoTexto && !unidadeTexto && quantidadeStr === '' && precoStr === '') continue; // linha em branco

      const quantidade = paraNumeroPlanilha(quantidadeStr);
      const precoUnitario = paraNumeroPlanilha(precoStr);

      if (!descricaoTexto) { erros.push({ linha: i + 1, motivo: 'Descrição vazia' }); continue; }
      if (!unidadeTexto) { erros.push({ linha: i + 1, motivo: 'Unidade vazia' }); continue; }
      if (quantidade == null || quantidade <= 0) { erros.push({ linha: i + 1, motivo: 'Quantidade inválida' }); continue; }
      if (precoUnitario == null || precoUnitario <= 0) { erros.push({ linha: i + 1, motivo: 'Preço unitário inválido' }); continue; }

      await this.db.insert(ataItens).values({
        tenantId,
        ataOrgaoId,
        numeroItem: proximoNumero++,
        descricao: descricaoTexto,
        unidade: unidadeTexto,
        quantidadeContratada: String(quantidade),
        valorUnitario: String(precoUnitario),
      });
      inseridos++;
    }

    return { inseridos, erros };
  }

  // Renovar uma ata é só estender a própria vigenciaFinal (MODELO.md, seção
  // 4) — mesma ata, mesmo teto, saldo restante preservado. Não cria ata
  // nova, não copia itens, não gera ciclo. A nova data precisa ser
  // estritamente posterior à atual (senão não é uma prorrogação); o evento
  // fica registrado em ataProrrogacoes, mesmo padrão de log imutável já
  // usado em ataRemanejamentos.
  async prorrogar(tenantId: string, ataId: string, usuarioId: string, dto: ProrrogarAtaDto) {
    // this.get() lê pela conexão comum (this.db), fora da transação — chamar
    // isso ainda dentro do callback leria pela conexão errada e não veria o
    // UPDATE feito por `tx`, ainda não commitado (mesma armadilha documentada
    // em OrdensService.findDetalhada/CLAUDE.md). Por isso o retorno só
    // acontece depois que a transação já foi confirmada.
    await this.db.transaction(async (tx) => {
      const [ata] = await tx.select().from(atas).where(and(eq(atas.id, ataId), eq(atas.tenantId, tenantId))).for('update');
      if (!ata) throw new NotFoundException('Ata não encontrada');

      const vigenciaFinalNova = new Date(dto.vigenciaFinal);
      if (vigenciaFinalNova <= new Date(ata.vigenciaFinal)) {
        throw new BadRequestException(`A nova vigência final (${dto.vigenciaFinal}) precisa ser posterior à atual (${new Date(ata.vigenciaFinal).toISOString().slice(0, 10)})`);
      }

      await tx.update(atas).set({ vigenciaFinal: vigenciaFinalNova }).where(and(eq(atas.id, ataId), eq(atas.tenantId, tenantId)));
      await tx.insert(ataProrrogacoes).values({
        tenantId,
        ataId,
        vigenciaFinalAnterior: ata.vigenciaFinal,
        vigenciaFinalNova,
        usuarioId,
      });
    });

    return this.get(tenantId, ataId);
  }

  async prorrogacoes(tenantId: string, ataId: string) {
    await this.get(tenantId, ataId); // valida que a ata pertence ao tenant
    const rows = await this.db.query.ataProrrogacoes.findMany({
      where: and(eq(ataProrrogacoes.tenantId, tenantId), eq(ataProrrogacoes.ataId, ataId)),
      with: { usuario: true },
      orderBy: (p, { desc }) => [desc(p.criadoEm)],
    });
    // Nunca expor o hash de senha do usuário autor da prorrogação na resposta.
    return rows.map(({ usuario: { senhaHash, ...usuario }, ...rest }) => ({ ...rest, usuario }));
  }

  // Contratos que abatem de algum órgão desta ata — reusa
  // ContratosService.list (mesmo cálculo de saldo das telas de contrato),
  // não duplica a lógica.
  async contratosDaAta(tenantId: string, ataId: string) {
    await this.get(tenantId, ataId);
    const orgaos = await this.db.select({ id: ataOrgaos.id }).from(ataOrgaos).where(eq(ataOrgaos.ataId, ataId));
    const orgaoIds = new Set(orgaos.map((o) => o.id));
    if (!orgaoIds.size) return [];
    const todosContratos = await this.contratosService.list(tenantId);
    return todosContratos.filter((c: any) => c.ataOrgaoId && orgaoIds.has(c.ataOrgaoId));
  }

  // Transfere quantidade contratada de um item para outro (mesmo número,
  // preço e unidade, em órgãos diferentes da mesma ata) — ver seção 1 do
  // briefing de Atas. Tudo em uma transação: nunca existe um estado
  // intermediário onde só um dos dois itens foi ajustado.
  async remanejarSaldo(tenantId: string, ataId: string, usuarioId: string, dto: RemanejarSaldoDto) {
    if (dto.ataItemOrigemId === dto.ataItemDestinoId) {
      throw new BadRequestException('Item de origem e destino devem ser diferentes');
    }

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ item: ataItens, ataOrgaoId: ataItens.ataOrgaoId })
        .from(ataItens)
        .innerJoin(ataOrgaos, eq(ataItens.ataOrgaoId, ataOrgaos.id))
        .where(and(inArray(ataItens.id, [dto.ataItemOrigemId, dto.ataItemDestinoId]), eq(ataOrgaos.ataId, ataId), eq(ataOrgaos.tenantId, tenantId)))
        .for('update');

      const origem = rows.find((r) => r.item.id === dto.ataItemOrigemId)?.item;
      const destino = rows.find((r) => r.item.id === dto.ataItemDestinoId)?.item;
      if (!origem || !destino) {
        throw new NotFoundException('Item de origem ou destino não encontrado nesta ata');
      }
      if (origem.ataOrgaoId === destino.ataOrgaoId) {
        throw new BadRequestException('Origem e destino devem ser de órgãos diferentes');
      }
      // Quando qualquer um dos dois lados é rastreado por homologação, os
      // dois PRECISAM apontar pro mesmo item homologado — remanejar entre
      // itens homologados diferentes (mesmo que numeroItem/unidade/preço
      // batam por coincidência) transferiria quantidade de um teto pro
      // outro sem nunca revalidar o teto do destino. Sem homologação dos
      // dois lados, numeroItem continua sendo o sinal de "é o mesmo item".
      if (origem.homologacaoItemId || destino.homologacaoItemId) {
        if (origem.homologacaoItemId !== destino.homologacaoItemId) {
          throw new BadRequestException('Só é possível remanejar entre itens vinculados ao mesmo item homologado');
        }
      } else if (origem.numeroItem !== destino.numeroItem) {
        throw new BadRequestException('Os itens de origem e destino precisam ter o mesmo número');
      }
      // Unidade e valor unitário sempre precisam bater, nos dois caminhos —
      // remanejamento é transferência de quantidade, nunca de valor; sem
      // essa checagem incondicional, dois itens do mesmo item homologado mas
      // com valorUnitario diferente (editado depois via editarItem) podiam
      // inflar o valorTotal derivado da ata só transferindo quantidade.
      if (origem.unidade !== destino.unidade || Number(origem.valorUnitario) !== Number(destino.valorUnitario)) {
        throw new BadRequestException('Os itens de origem e destino precisam ter a mesma unidade e valor unitário');
      }

      const usadoOrigem = await this.quantidadeUsadaPorItem(tx, origem.id);
      const disponivelOrigem = Number(origem.quantidadeContratada) - usadoOrigem;
      if (dto.quantidade > disponivelOrigem) {
        throw new BadRequestException(`Quantidade a remanejar (${dto.quantidade}) excede o saldo disponível no órgão de origem (${disponivelOrigem})`);
      }

      await tx.update(ataItens).set({ quantidadeContratada: String(Number(origem.quantidadeContratada) - dto.quantidade) }).where(and(eq(ataItens.id, origem.id), eq(ataItens.tenantId, tenantId)));
      await tx.update(ataItens).set({ quantidadeContratada: String(Number(destino.quantidadeContratada) + dto.quantidade) }).where(and(eq(ataItens.id, destino.id), eq(ataItens.tenantId, tenantId)));

      await tx.insert(ataRemanejamentos).values({
        tenantId,
        ataItemOrigemId: origem.id,
        ataItemDestinoId: destino.id,
        quantidade: String(dto.quantidade),
        usuarioId,
      });

      return { ok: true };
    });
  }

  async remanejamentos(tenantId: string, ataId: string) {
    await this.get(tenantId, ataId); // valida que a ata pertence ao tenant

    // ataRemanejamentos não guarda ataId diretamente — filtra pelos itens
    // que pertencem a órgãos desta ata.
    const itens = await this.db
      .select({ id: ataItens.id })
      .from(ataItens)
      .innerJoin(ataOrgaos, eq(ataItens.ataOrgaoId, ataOrgaos.id))
      .where(eq(ataOrgaos.ataId, ataId));
    const itemIds = itens.map((i) => i.id);
    if (!itemIds.length) return [];

    const rows = await this.db.query.ataRemanejamentos.findMany({
      where: or(inArray(ataRemanejamentos.ataItemOrigemId, itemIds), inArray(ataRemanejamentos.ataItemDestinoId, itemIds)),
      with: {
        itemOrigem: { with: { ataOrgao: { with: { secretaria: true } } } },
        itemDestino: { with: { ataOrgao: { with: { secretaria: true } } } },
        usuario: true,
      },
      orderBy: (r, { desc }) => [desc(r.criadoEm)],
    });
    // Nunca expor o hash de senha do usuário autor do remanejamento na resposta.
    return rows.map(({ usuario: { senhaHash, ...usuario }, ...rest }) => ({ ...rest, usuario }));
  }
}

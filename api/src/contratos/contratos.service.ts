import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import {
  aditivos,
  ataOrgaos,
  atas,
  contratoDotacoes,
  contratos,
  dotacoes,
  fornecedores,
  homologacaoFornecedores,
  homologacaoItens,
  itensContrato,
  itensOrdem,
  licitacaoHomologacoes,
  licitacoes,
  ordens,
  secretarias,
  usuarios,
} from '../db/schema';
import { SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { CreateContratoDto, ItemContratoInput, UpdateContratoDto } from './dto/contrato.dto';

@Injectable()
export class ContratosService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private saldoCeiling: SaldoCeilingService,
  ) {}

  async list(tenantId: string) {
    const rows = await this.db.query.contratos.findMany({
      where: eq(contratos.tenantId, tenantId),
      with: { licitacao: true, orgaoGerenciador: true, fornecedor: true },
    });
    return Promise.all(rows.map((r) => this.comSaldo(r)));
  }

  async get(tenantId: string, id: string) {
    const row = await this.db.query.contratos.findFirst({
      where: and(eq(contratos.tenantId, tenantId), eq(contratos.id, id)),
      with: {
        licitacao: true,
        orgaoGerenciador: true,
        fornecedor: true,
        itens: true,
        dotacoes: { with: { dotacao: true } },
      },
    });
    if (!row) throw new NotFoundException('Contrato não encontrado');
    return this.comSaldo(row);
  }

  // Calcula o saldo do contrato: valor total dos itens (contratado), ajustado
  // pelos aditivos de valor/supressão, menos o total já usado em ordens
  // emitidas. Nunca é uma coluna armazenada — ver seção 6.1 e 9.2 do
  // documento de análise sobre por que isso é derivado. (Aditivos de PRAZO e
  // QUANTIDADE não entram aqui — eles já atualizaram vigenciaFinal e
  // itensContrato.quantidade diretamente no momento do registro; ver
  // AditivosService.)
  // Núcleo do cálculo, parametrizado por `tx` para poder rodar tanto fora de
  // transação (leituras normais, via this.db) quanto dentro de uma (o
  // pré-check de 3 níveis de AditivosService, que precisa ver o mesmo lock
  // que o resto daquela transação já tomou).
  private async calcularSaldo(tx: DrizzleDB, contratoId: string) {
    const itens = await tx.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));
    const valorItens = itens.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.valorUnitario), 0);

    const [aditivosRow] = await tx
      .select({ total: sql<string>`coalesce(sum(case when ${aditivos.tipo} = 'SUPRESSAO' then -${aditivos.valorAcrescimo} else ${aditivos.valorAcrescimo} end), 0)` })
      .from(aditivos)
      .where(and(eq(aditivos.contratoId, contratoId), sql`${aditivos.tipo} in ('VALOR', 'SUPRESSAO')`));
    const valorAditivos = Number(aditivosRow?.total ?? 0);
    const valorTotal = valorItens + valorAditivos;

    const [utilizadoRow] = await tx
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.contratoId, contratoId), eq(ordens.status, 'EMITIDA')));

    const utilizado = Number(utilizadoRow?.total ?? 0);
    return { valorTotal, saldoDisponivel: valorTotal - utilizado, valorUtilizado: utilizado };
  }

  private async comSaldo<T extends { id: string }>(row: T) {
    const saldo = await this.calcularSaldo(this.db, row.id);
    return { ...row, ...saldo };
  }

  // Usado pelo pré-check de 3 níveis de AditivosService — sempre dentro da
  // transação de quem chama, nunca via this.db.
  async saldoDisponivel(tx: DrizzleDB, contratoId: string): Promise<number> {
    const { saldoDisponivel } = await this.calcularSaldo(tx, contratoId);
    return saldoDisponivel;
  }

  // Garante que cada FK do contrato pertence ao mesmo tenant de quem está
  // criando — sem isso, um ID de outro município poderia ser gravado aqui
  // (bug de frontend ou chamada direta à API), vazando dados entre tenants.
  private async validarFksDoTenant(tenantId: string, dto: CreateContratoDto) {
    const [licitacao] = await this.db.select({ id: licitacoes.id }).from(licitacoes).where(and(eq(licitacoes.id, dto.licitacaoId), eq(licitacoes.tenantId, tenantId)));
    if (!licitacao) throw new BadRequestException('Licitação não encontrada para este tenant');

    const [orgao] = await this.db.select({ id: secretarias.id }).from(secretarias).where(and(eq(secretarias.id, dto.orgaoGerenciadorId), eq(secretarias.tenantId, tenantId)));
    if (!orgao) throw new BadRequestException('Órgão gerenciador não encontrado para este tenant');

    const [fornecedor] = await this.db.select({ id: fornecedores.id }).from(fornecedores).where(and(eq(fornecedores.id, dto.fornecedorId), eq(fornecedores.tenantId, tenantId)));
    if (!fornecedor) throw new BadRequestException('Fornecedor não encontrado para este tenant');

    if (dto.fiscalId) {
      const [fiscal] = await this.db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.id, dto.fiscalId), eq(usuarios.tenantId, tenantId)));
      if (!fiscal) throw new BadRequestException('Fiscal não encontrado para este tenant');
    }

    if (dto.dotacaoIds?.length) {
      const ids = [...new Set(dto.dotacaoIds)];
      const encontradas = await this.db.select({ id: dotacoes.id }).from(dotacoes).where(and(inArray(dotacoes.id, ids), eq(dotacoes.tenantId, tenantId)));
      if (encontradas.length !== ids.length) throw new BadRequestException('Dotação orçamentária não encontrada para este tenant');
    }
  }

  // Mesma regra do DTO (quantidade e valor unitário positivos e finitos),
  // repetida aqui porque o service também é chamado sem passar pelo
  // ValidationPipe (testes, outros services) — uma quantidade negativa com
  // homologacaoItemId reduziria o consumo do teto da ata/homologação.
  private validarItensEntrada(itens: ItemContratoInput[]) {
    for (const it of itens) {
      if (!Number.isFinite(it.quantidade) || it.quantidade <= 0) {
        throw new BadRequestException(`Item "${it.descricao}": quantidade precisa ser maior que zero`);
      }
      if (!Number.isFinite(it.valorUnitario) || it.valorUnitario <= 0) {
        throw new BadRequestException(`Item "${it.descricao}": valor unitário precisa ser maior que zero`);
      }
    }
  }

  // Confirma que o órgão de ata pertence ao tenant, à mesma licitação do
  // contrato e que o fornecedor do contrato é o detentor principal da ata.
  // Devolve o homologacaoFornecedorId da ata (pode ser null — ata comum, sem
  // vínculo de homologação, itens dela não podem ter homologacaoItemId).
  private async validarAtaOrgao(tx: DrizzleDB, tenantId: string, ataOrgaoId: string, licitacaoId: string, fornecedorId: string) {
    const [row] = await tx
      .select({ licitacaoId: atas.licitacaoId, detentorPrincipalId: atas.detentorPrincipalId, homologacaoFornecedorId: atas.homologacaoFornecedorId })
      .from(ataOrgaos)
      .innerJoin(atas, eq(ataOrgaos.ataId, atas.id))
      .where(and(eq(ataOrgaos.id, ataOrgaoId), eq(ataOrgaos.tenantId, tenantId)));
    if (!row) throw new BadRequestException('Órgão de ata não encontrado para este tenant');
    if (row.licitacaoId !== licitacaoId) throw new BadRequestException('O órgão de ata informado não pertence à licitação deste contrato');
    if (row.detentorPrincipalId !== fornecedorId) throw new BadRequestException('O fornecedor do contrato precisa ser o detentor principal desta ata');
    return { homologacaoFornecedorId: row.homologacaoFornecedorId };
  }

  // Confirma que o fornecedor homologado pertence ao tenant, à mesma
  // licitação, está com a homologação travada ('revisado'), é o mesmo
  // fornecedor do contrato, e que ainda não existe ata para ele (senão a via
  // correta é ataOrgaoId, não este caminho direto).
  private async validarHomologacaoFornecedorDireto(tx: DrizzleDB, tenantId: string, homologacaoFornecedorId: string, licitacaoId: string, fornecedorId: string) {
    const [row] = await tx
      .select({ fornecedorId: homologacaoFornecedores.fornecedorId, status: licitacaoHomologacoes.status, licitacaoId: licitacaoHomologacoes.licitacaoId })
      .from(homologacaoFornecedores)
      .innerJoin(licitacaoHomologacoes, eq(homologacaoFornecedores.homologacaoId, licitacaoHomologacoes.id))
      .where(and(eq(homologacaoFornecedores.id, homologacaoFornecedorId), eq(homologacaoFornecedores.tenantId, tenantId)));
    if (!row) throw new BadRequestException('Fornecedor homologado não encontrado para este tenant');
    if (row.licitacaoId !== licitacaoId) throw new BadRequestException('Fornecedor homologado não pertence a esta licitação');
    if (row.status !== 'revisado') throw new BadRequestException('A homologação deste fornecedor ainda não foi revisada');
    if (row.fornecedorId !== fornecedorId) throw new BadRequestException('O fornecedor do contrato precisa ser o mesmo vinculado na homologação');

    const [ataExistente] = await tx.select({ id: atas.id }).from(atas).where(eq(atas.homologacaoFornecedorId, homologacaoFornecedorId));
    if (ataExistente) throw new BadRequestException('Este fornecedor já tem uma ata para esta homologação — use ataOrgaoId em vez de homologacaoFornecedorId');
  }

  private async validarItemPertenceAoFornecedor(tx: DrizzleDB, tenantId: string, homologacaoItemId: string, homologacaoFornecedorEsperado: string, descricao: string) {
    const [row] = await tx.select({ homologacaoFornecedorId: homologacaoItens.homologacaoFornecedorId }).from(homologacaoItens).where(and(eq(homologacaoItens.id, homologacaoItemId), eq(homologacaoItens.tenantId, tenantId)));
    if (!row) throw new BadRequestException(`Item homologado referenciado por "${descricao}" não encontrado`);
    if (row.homologacaoFornecedorId !== homologacaoFornecedorEsperado) throw new BadRequestException(`Item "${descricao}" não pertence ao fornecedor deste contrato`);
  }

  // Contrato derivado de homologação ou de ata controla saldo por item —
  // o modo "Valor global" (APENAS_VALOR_TOTAL) fica indisponível nesses
  // casos (MODELO.md, invariante 8). Os outros dois modos alternativos
  // (`formaControleSaldoEnum`) não têm nenhuma lógica implementada — não há
  // nada a fazer além de impedir 'APENAS_VALOR_TOTAL' com origem.
  private validarFormaControleSaldo(formaControleSaldo: string | undefined, ataOrgaoId: string | null | undefined, homologacaoFornecedorId: string | null | undefined) {
    if (formaControleSaldo === 'APENAS_VALOR_TOTAL' && (ataOrgaoId || homologacaoFornecedorId)) {
      throw new BadRequestException('Contratos derivados de homologação controlam saldo por item');
    }
  }

  // Valida e, se ok, retorna nada — lança BadRequestException citando o item
  // e o saldo restante quando a quantidade pedida excede o disponível.
  private async validarTetoItens(
    tx: DrizzleDB,
    tenantId: string,
    itens: ItemContratoInput[],
    origem: { ataOrgaoId?: string; homologacaoFornecedorId?: string; ataHomologacaoFornecedorId?: string | null },
  ) {
    for (const item of itens) {
      if (!item.homologacaoItemId) continue;
      if (!origem.ataOrgaoId && !origem.homologacaoFornecedorId) {
        throw new BadRequestException(`Item "${item.descricao}" referencia homologação, mas o contrato não indica de onde puxa saldo (ataOrgaoId/homologacaoFornecedorId)`);
      }
      if (origem.ataOrgaoId) {
        if (!origem.ataHomologacaoFornecedorId) {
          throw new BadRequestException(`Item "${item.descricao}" referencia homologação, mas a ata deste contrato não está vinculada a uma homologação`);
        }
        await this.validarItemPertenceAoFornecedor(tx, tenantId, item.homologacaoItemId, origem.ataHomologacaoFornecedorId, item.descricao);
        const { disponivel } = await this.saldoCeiling.ataItemSaldoDisponivel(tx, tenantId, origem.ataOrgaoId, item.homologacaoItemId);
        if (item.quantidade > disponivel) {
          throw new BadRequestException(`Item "${item.descricao}": quantidade (${item.quantidade}) excede o saldo disponível na ata (${disponivel})`);
        }
      } else if (origem.homologacaoFornecedorId) {
        await this.validarItemPertenceAoFornecedor(tx, tenantId, item.homologacaoItemId, origem.homologacaoFornecedorId, item.descricao);
        const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, item.homologacaoItemId);
        if (item.quantidade > disponivel) {
          throw new BadRequestException(`Item "${item.descricao}": quantidade (${item.quantidade}) excede o saldo homologado restante (${disponivel})`);
        }
      }
    }
  }

  async create(tenantId: string, dto: CreateContratoDto) {
    const dup = await this.db.select().from(contratos).where(and(eq(contratos.tenantId, tenantId), eq(contratos.numero, dto.numero)));
    if (dup.length) throw new ConflictException('Já existe um contrato com este número');

    await this.validarFksDoTenant(tenantId, dto);
    this.validarItensEntrada(dto.itens ?? []);

    if (dto.ataOrgaoId && dto.homologacaoFornecedorId) {
      throw new BadRequestException('Informe no máximo uma origem de saldo: ataOrgaoId ou homologacaoFornecedorId, não os dois');
    }
    this.validarFormaControleSaldo(dto.formaControleSaldo, dto.ataOrgaoId, dto.homologacaoFornecedorId);

    // Snapshot do valor original — base para o limite de 25%/50% do art. 125
    // da Lei 14.133/2021 nos aditivos de valor (AditivosService), que nunca
    // muda mesmo depois de aditivos aumentarem o valor corrente do contrato.
    const valorOriginal = (dto.itens ?? []).reduce((acc, it) => acc + it.quantidade * it.valorUnitario, 0);

    const contratoId = await this.db.transaction(async (tx) => {
      let ataHomologacaoFornecedorId: string | null = null;
      if (dto.ataOrgaoId) {
        const ata = await this.validarAtaOrgao(tx, tenantId, dto.ataOrgaoId, dto.licitacaoId, dto.fornecedorId);
        ataHomologacaoFornecedorId = ata.homologacaoFornecedorId;
      }
      if (dto.homologacaoFornecedorId) {
        await this.validarHomologacaoFornecedorDireto(tx, tenantId, dto.homologacaoFornecedorId, dto.licitacaoId, dto.fornecedorId);
      }

      await this.validarTetoItens(tx, tenantId, dto.itens ?? [], {
        ataOrgaoId: dto.ataOrgaoId,
        homologacaoFornecedorId: dto.homologacaoFornecedorId,
        ataHomologacaoFornecedorId,
      });

      const [created] = await tx
        .insert(contratos)
        .values({
          tenantId,
          numero: dto.numero,
          numeroProcesso: dto.numeroProcesso,
          objeto: dto.objeto,
          licitacaoId: dto.licitacaoId,
          orgaoGerenciadorId: dto.orgaoGerenciadorId,
          fornecedorId: dto.fornecedorId,
          fiscalId: dto.fiscalId,
          ataOrgaoId: dto.ataOrgaoId,
          homologacaoFornecedorId: dto.homologacaoFornecedorId,
          vigenciaInicial: new Date(dto.vigenciaInicial),
          vigenciaFinal: new Date(dto.vigenciaFinal),
          dataAssinatura: dto.dataAssinatura ? new Date(dto.dataAssinatura) : undefined,
          formaFaturamento: dto.formaFaturamento as any,
          formaControleSaldo: (dto.formaControleSaldo as any) ?? 'NORMAL',
          situacao: (dto.situacao as any) ?? 'MINUTA',
          valorOriginal: valorOriginal.toFixed(2),
        })
        .returning();

      if (dto.itens?.length) {
        await tx.insert(itensContrato).values(
          dto.itens.map((it, idx) => ({
            contratoId: created.id,
            numero: idx + 1,
            descricao: it.descricao,
            unidade: it.unidade,
            quantidade: String(it.quantidade),
            valorUnitario: String(it.valorUnitario),
            homologacaoItemId: it.homologacaoItemId,
          })),
        );
      }

      if (dto.dotacaoIds?.length) {
        await tx.insert(contratoDotacoes).values(
          [...new Set(dto.dotacaoIds)].map((dotacaoId) => ({ contratoId: created.id, dotacaoId })),
        );
      }

      return created.id;
    });

    return this.get(tenantId, contratoId);
  }

  async update(tenantId: string, id: string, dto: UpdateContratoDto) {
    const contrato = await this.get(tenantId, id);
    this.validarFormaControleSaldo(dto.formaControleSaldo, contrato.ataOrgaoId, contrato.homologacaoFornecedorId);

    const patch: Record<string, unknown> = {};
    if (dto.objeto !== undefined) patch.objeto = dto.objeto;
    if (dto.vigenciaInicial !== undefined) patch.vigenciaInicial = new Date(dto.vigenciaInicial);
    if (dto.vigenciaFinal !== undefined) patch.vigenciaFinal = new Date(dto.vigenciaFinal);
    if (dto.situacao !== undefined) patch.situacao = dto.situacao as any;
    if (dto.formaControleSaldo !== undefined) patch.formaControleSaldo = dto.formaControleSaldo as any;
    if (Object.keys(patch).length) {
      await this.db.update(contratos).set(patch).where(and(eq(contratos.id, id), eq(contratos.tenantId, tenantId)));
    }
    return this.get(tenantId, id);
  }

  async addItem(tenantId: string, contratoId: string, item: ItemContratoInput) {
    const contrato = await this.get(tenantId, contratoId);
    this.validarItensEntrada([item]);

    return this.db.transaction(async (tx) => {
      let ataHomologacaoFornecedorId: string | null = null;
      if (contrato.ataOrgaoId) {
        const [ata] = await tx.select({ homologacaoFornecedorId: atas.homologacaoFornecedorId }).from(ataOrgaos).innerJoin(atas, eq(ataOrgaos.ataId, atas.id)).where(eq(ataOrgaos.id, contrato.ataOrgaoId));
        ataHomologacaoFornecedorId = ata?.homologacaoFornecedorId ?? null;
      }
      await this.validarTetoItens(tx, tenantId, [item], {
        ataOrgaoId: contrato.ataOrgaoId ?? undefined,
        homologacaoFornecedorId: contrato.homologacaoFornecedorId ?? undefined,
        ataHomologacaoFornecedorId,
      });

      const existentes = await tx.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));
      const proximoNumero = existentes.length + 1;
      const [row] = await tx
        .insert(itensContrato)
        .values({
          contratoId,
          numero: proximoNumero,
          descricao: item.descricao,
          unidade: item.unidade,
          quantidade: String(item.quantidade),
          valorUnitario: String(item.valorUnitario),
          homologacaoItemId: item.homologacaoItemId,
        })
        .returning();
      return row;
    });
  }

  // Itens de um contrato com a quantidade já usada em ordens emitidas e o saldo restante.
  // É o que alimenta a grade de seleção de itens no wizard de emissão de ordem.
  async itensComSaldo(tenantId: string, contratoId: string) {
    await this.get(tenantId, contratoId);
    const itens = await this.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));

    const usados = await this.db
      .select({ itemContratoId: itensOrdem.itemContratoId, total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.contratoId, contratoId), eq(ordens.status, 'EMITIDA')))
      .groupBy(itensOrdem.itemContratoId);

    const usadoPorItem = new Map(usados.map((u) => [u.itemContratoId, Number(u.total)]));

    return itens.map((it) => {
      const usado = usadoPorItem.get(it.id) ?? 0;
      return { ...it, quantidadeUtilizada: usado, quantidadeDisponivel: Number(it.quantidade) - usado };
    });
  }
}

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
import { centavos, centavosDoTotal, decimal2, reais } from '../common/dinheiro';
import { periodoValido } from '../common/datas';
import { CreateContratoDto, ItemContratoInput, UpdateContratoDto } from './dto/contrato.dto';

// Valor total (itens + aditivos de valor), utilizado e saldo de um contrato.
// Exportado para quem precisa do mesmo número fora deste service (minuta).
// Dinheiro em centavos inteiros (duas casas, ver common/dinheiro.ts): cada
// item arredondado para centavos antes de somar, igual ao precoTotal
// gravado nas ordens — sem isso sobravam frações de centavo que nunca
// zeravam o saldo. Supressão com itens já reduziu a quantidade dos itens,
// então só a supressão antiga por percentual (sem itens) entra aqui.
export async function calcularSaldoContrato(tx: DrizzleDB, contratoId: string) {
  return (await calcularSaldosContratos(tx, [contratoId])).get(contratoId)!;
}

// Mesma conta para vários contratos de uma vez — três consultas no total, em
// vez de três por contrato (listagem e dashboard).
export async function calcularSaldosContratos(tx: DrizzleDB, contratoIds: string[]) {
  const resultado = new Map<string, { valorTotal: number; saldoDisponivel: number; valorUtilizado: number }>();
  if (!contratoIds.length) return resultado;

  const itens = await tx.select().from(itensContrato).where(inArray(itensContrato.contratoId, contratoIds));
  const valorItens = new Map<string, number>();
  for (const it of itens) valorItens.set(it.contratoId, (valorItens.get(it.contratoId) ?? 0) + centavosDoTotal(it.quantidade, it.valorUnitario));

  const aditivosRows = await tx
    .select({ contratoId: aditivos.contratoId, total: sql<string>`coalesce(sum(case when ${aditivos.tipo} = 'SUPRESSAO' then -${aditivos.valorAcrescimo} else ${aditivos.valorAcrescimo} end), 0)` })
    .from(aditivos)
    .where(and(
      inArray(aditivos.contratoId, contratoIds),
      sql`${aditivos.tipo} in ('VALOR', 'SUPRESSAO', 'ACRESCIMO_ESPECIAL')`,
      sql`not exists (select 1 from aditivo_itens ai where ai.aditivo_id = ${aditivos.id})`,
    ))
    .groupBy(aditivos.contratoId);
  const valorAditivos = new Map(aditivosRows.map((r) => [r.contratoId, centavos(r.total)]));

  const utilizadoRows = await tx
    .select({ contratoId: ordens.contratoId, total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
    .from(itensOrdem)
    .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
    .where(and(inArray(ordens.contratoId, contratoIds), eq(ordens.status, 'EMITIDA')))
    .groupBy(ordens.contratoId);
  const utilizadoPor = new Map(utilizadoRows.map((r) => [r.contratoId, centavos(r.total)]));

  for (const id of contratoIds) {
    const valorTotal = (valorItens.get(id) ?? 0) + (valorAditivos.get(id) ?? 0);
    const utilizado = utilizadoPor.get(id) ?? 0;
    resultado.set(id, { valorTotal: reais(valorTotal), saldoDisponivel: reais(valorTotal - utilizado), valorUtilizado: reais(utilizado) });
  }
  return resultado;
}

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
    const saldos = await calcularSaldosContratos(this.db, rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, ...saldos.get(r.id)! }));
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
  private calcularSaldo(tx: DrizzleDB, contratoId: string) {
    return calcularSaldoContrato(tx, contratoId);
  }

  private async comSaldo<T extends { id: string }>(row: T) {
    const saldo = await this.calcularSaldo(this.db, row.id);
    return { ...row, ...saldo };
  }

  // Usado pelo pré-check de 3 níveis de AditivosService — sempre dentro da
  // transação de quem chama, nunca via this.db. Quantidade (não dinheiro):
  // contrato com origem controla saldo por item (invariante 8), e o
  // arredondamento de cada ordem para centavos faz o saldo em R$ poder
  // sobrar ou faltar 1 centavo mesmo com todo item consumido.
  async saldoDisponivel(tx: DrizzleDB, contratoId: string): Promise<number> {
    const { saldoDisponivel } = await this.calcularSaldo(tx, contratoId);
    return saldoDisponivel;
  }

  async itensComSaldoRestante(tx: DrizzleDB, contratoId: string) {
    const itens = await tx.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));
    const usados = await tx
      .select({ itemContratoId: itensOrdem.itemContratoId, total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.contratoId, contratoId), eq(ordens.status, 'EMITIDA')))
      .groupBy(itensOrdem.itemContratoId);
    const usadoPorItem = new Map(usados.map((u) => [u.itemContratoId, Number(u.total)]));
    return itens
      .map((it) => ({ item: it, disponivel: Number(it.quantidade) - (usadoPorItem.get(it.id) ?? 0) }))
      .filter((r) => r.disponivel > 0);
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

  // Devolve o item homologado (já confirmado como do fornecedor esperado) —
  // é dele que saem descrição, unidade e valor unitário do item do contrato.
  private async itemHomologadoDoFornecedor(tx: DrizzleDB, tenantId: string, homologacaoItemId: string, homologacaoFornecedorEsperado: string, descricao: string) {
    const [row] = await tx.select().from(homologacaoItens).where(and(eq(homologacaoItens.id, homologacaoItemId), eq(homologacaoItens.tenantId, tenantId)));
    if (!row) throw new BadRequestException(`Item homologado referenciado por "${descricao}" não encontrado`);
    if (row.homologacaoFornecedorId !== homologacaoFornecedorEsperado) throw new BadRequestException(`Item "${descricao}" não pertence ao fornecedor deste contrato`);
    return row;
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

  // Normaliza e valida os itens de um contrato contra a origem de saldo:
  // - origem que resolve para uma homologação (homologacaoFornecedorId, ou
  //   ata vinculada a uma homologação): todo item PRECISA referenciar um
  //   item homologado, e descrição/unidade/valor unitário vêm dele, nunca do
  //   que o cliente digitou (MODELO.md, invariante 2). Sem isso, um item
  //   "digitado à mão" num contrato com origem escapava do teto por completo.
  // - o mesmo item homologado não pode aparecer duas vezes no contrato — duas
  //   linhas passavam na checagem de teto uma a uma e juntas a estouravam.
  // - quantidade pedida ≤ saldo da ata (órgão) ou da homologação.
  // Contrato sem origem (ou de ata comum, sem homologação) segue livre.
  private async normalizarItensDaOrigem(
    tx: DrizzleDB,
    tenantId: string,
    itens: ItemContratoInput[],
    origem: { ataOrgaoId?: string; homologacaoFornecedorId?: string; ataHomologacaoFornecedorId?: string | null },
    homologacaoItemIdsJaNoContrato: (string | null)[] = [],
  ): Promise<ItemContratoInput[]> {
    const homologacaoFornecedorDaOrigem = origem.ataOrgaoId ? origem.ataHomologacaoFornecedorId : origem.homologacaoFornecedorId;
    const vistos = new Set(homologacaoItemIdsJaNoContrato.filter((v): v is string => !!v));
    const normalizados: ItemContratoInput[] = [];

    for (const item of itens) {
      if (!item.homologacaoItemId) {
        if (homologacaoFornecedorDaOrigem) {
          throw new BadRequestException(`Item "${item.descricao}" precisa referenciar um item da homologação — contratos com origem em ata/homologação não aceitam itens digitados à mão`);
        }
        normalizados.push(item);
        continue;
      }
      if (!origem.ataOrgaoId && !origem.homologacaoFornecedorId) {
        throw new BadRequestException(`Item "${item.descricao}" referencia homologação, mas o contrato não indica de onde puxa saldo (ataOrgaoId/homologacaoFornecedorId)`);
      }
      if (!homologacaoFornecedorDaOrigem) {
        throw new BadRequestException(`Item "${item.descricao}" referencia homologação, mas a ata deste contrato não está vinculada a uma homologação`);
      }
      if (vistos.has(item.homologacaoItemId)) {
        throw new BadRequestException(`Item "${item.descricao}" aparece mais de uma vez neste contrato — informe a quantidade total numa única linha`);
      }
      vistos.add(item.homologacaoItemId);

      const homologado = await this.itemHomologadoDoFornecedor(tx, tenantId, item.homologacaoItemId, homologacaoFornecedorDaOrigem, item.descricao);
      const normalizado: ItemContratoInput = {
        descricao: homologado.descricao,
        unidade: homologado.unidade ?? item.unidade,
        quantidade: item.quantidade,
        valorUnitario: Number(homologado.valorUnitario),
        homologacaoItemId: homologado.id,
      };

      if (origem.ataOrgaoId) {
        const { disponivel } = await this.saldoCeiling.ataItemSaldoDisponivel(tx, tenantId, origem.ataOrgaoId, homologado.id);
        if (normalizado.quantidade > disponivel) {
          throw new BadRequestException(`Item "${normalizado.descricao}": quantidade (${normalizado.quantidade}) excede o saldo disponível na ata (${disponivel})`);
        }
      } else {
        const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, homologado.id);
        if (normalizado.quantidade > disponivel) {
          throw new BadRequestException(`Item "${normalizado.descricao}": quantidade (${normalizado.quantidade}) excede o saldo homologado restante (${disponivel})`);
        }
      }
      normalizados.push(normalizado);
    }
    return normalizados;
  }

  async create(tenantId: string, dto: CreateContratoDto) {
    const dup = await this.db.select().from(contratos).where(and(eq(contratos.tenantId, tenantId), eq(contratos.numero, dto.numero)));
    if (dup.length) throw new ConflictException('Já existe um contrato com este número');

    await this.validarFksDoTenant(tenantId, dto);
    this.validarItensEntrada(dto.itens ?? []);
    if (!periodoValido(dto.vigenciaInicial, dto.vigenciaFinal)) {
      throw new BadRequestException('A vigência inicial não pode ser posterior à vigência final');
    }

    if (dto.ataOrgaoId && dto.homologacaoFornecedorId) {
      throw new BadRequestException('Informe no máximo uma origem de saldo: ataOrgaoId ou homologacaoFornecedorId, não os dois');
    }
    this.validarFormaControleSaldo(dto.formaControleSaldo, dto.ataOrgaoId, dto.homologacaoFornecedorId);

    const contratoId = await this.db.transaction(async (tx) => {
      let ataHomologacaoFornecedorId: string | null = null;
      if (dto.ataOrgaoId) {
        const ata = await this.validarAtaOrgao(tx, tenantId, dto.ataOrgaoId, dto.licitacaoId, dto.fornecedorId);
        ataHomologacaoFornecedorId = ata.homologacaoFornecedorId;
      }
      if (dto.homologacaoFornecedorId) {
        await this.validarHomologacaoFornecedorDireto(tx, tenantId, dto.homologacaoFornecedorId, dto.licitacaoId, dto.fornecedorId);
      }

      const itens = await this.normalizarItensDaOrigem(tx, tenantId, dto.itens ?? [], {
        ataOrgaoId: dto.ataOrgaoId,
        homologacaoFornecedorId: dto.homologacaoFornecedorId,
        ataHomologacaoFornecedorId,
      });

      // Snapshot do valor original — base para o limite de 25%/50% do art. 125
      // da Lei 14.133/2021 nos aditivos de valor (AditivosService), que nunca
      // muda mesmo depois de aditivos aumentarem o valor corrente do contrato.
      const valorOriginal = itens.reduce((acc, it) => acc + centavosDoTotal(it.quantidade, it.valorUnitario), 0);

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
          valorOriginal: decimal2(valorOriginal),
        })
        .returning();

      if (itens.length) {
        await tx.insert(itensContrato).values(
          itens.map((it, idx) => ({
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
    if (!periodoValido(dto.vigenciaInicial ?? contrato.vigenciaInicial, dto.vigenciaFinal ?? contrato.vigenciaFinal)) {
      throw new BadRequestException('A vigência inicial não pode ser posterior à vigência final');
    }

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
      // valorOriginal é a base do limite de 25%/50% dos aditivos: um item
      // incluído antes do primeiro aditivo faz parte do valor original (antes
      // ficava de fora — contrato criado vazio e montado por addItem tinha
      // valorOriginal 0 e nenhum aditivo de valor passava). Depois de haver
      // aditivo, incluir item seria um acréscimo sem termo aditivo.
      const [travado] = await tx.select({ valorOriginal: contratos.valorOriginal }).from(contratos).where(eq(contratos.id, contratoId)).for('update');
      const [temAditivo] = await tx.select({ id: aditivos.id }).from(aditivos).where(eq(aditivos.contratoId, contratoId)).limit(1);
      if (temAditivo) {
        throw new BadRequestException('Este contrato já tem aditivos — acréscimos de itens ou quantidades precisam ser feitos por termo aditivo');
      }

      let ataHomologacaoFornecedorId: string | null = null;
      if (contrato.ataOrgaoId) {
        const [ata] = await tx.select({ homologacaoFornecedorId: atas.homologacaoFornecedorId }).from(ataOrgaos).innerJoin(atas, eq(ataOrgaos.ataId, atas.id)).where(eq(ataOrgaos.id, contrato.ataOrgaoId));
        ataHomologacaoFornecedorId = ata?.homologacaoFornecedorId ?? null;
      }
      const existentes = await tx.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));
      const [normalizado] = await this.normalizarItensDaOrigem(tx, tenantId, [item], {
        ataOrgaoId: contrato.ataOrgaoId ?? undefined,
        homologacaoFornecedorId: contrato.homologacaoFornecedorId ?? undefined,
        ataHomologacaoFornecedorId,
      }, existentes.map((e) => e.homologacaoItemId));

      const proximoNumero = existentes.length + 1;
      const [row] = await tx
        .insert(itensContrato)
        .values({
          contratoId,
          numero: proximoNumero,
          descricao: normalizado.descricao,
          unidade: normalizado.unidade,
          quantidade: String(normalizado.quantidade),
          valorUnitario: String(normalizado.valorUnitario),
          homologacaoItemId: normalizado.homologacaoItemId,
        })
        .returning();
      const novoValorOriginal = centavos(travado.valorOriginal) + centavosDoTotal(normalizado.quantidade, normalizado.valorUnitario);
      await tx.update(contratos).set({ valorOriginal: decimal2(novoValorOriginal) }).where(eq(contratos.id, contratoId));
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

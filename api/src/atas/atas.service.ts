import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, or, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import {
  ataItens,
  ataLotes,
  ataOrgaos,
  ataRemanejamentos,
  atas,
  contratos,
  fornecedores,
  homologacaoFornecedores,
  homologacaoItens,
  itensContrato,
  itensOrdem,
  licitacaoHomologacoes,
  licitacoes,
  ordens,
  secretarias,
} from '../db/schema';
import { SaldoCeilingService } from '../saldo-ceiling/saldo-ceiling.service';
import { ContratosService } from '../contratos/contratos.service';
import { CreateAtaDto, ItemAtaInput, LoteAtaInput, OrgaoAtaInput, RemanejarSaldoDto, UpdateAtaDto } from './dto/ata.dto';

// Números de planilha podem vir como texto formatado em padrão BR ("1.234,56")
// OU como célula numérica comum do Excel, que o SheetJS (com raw:false)
// renderiza sem separador de milhar ("10.5") — nesses casos o ponto É o
// separador decimal. Remover todo ponto incondicionalmente (como o parser
// original fazia) transforma "10.5" em 105: um erro silencioso de 10x a
// 1000x. A vírgula é o sinal inequívoco de formatação BR — só stripa pontos
// quando ela está presente.
function paraNumeroPlanilha(valor: unknown): number | null {
  if (valor == null) return null;
  const texto = String(valor).trim().replace(/^R\$\s*/i, '');
  if (!texto || texto === '-') return null;
  const numero = texto.includes(',') ? Number(texto.replace(/\./g, '').replace(',', '.')) : Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

@Injectable()
export class AtasService {
  constructor(
    @Inject(DRIZZLE) private db: DrizzleDB,
    private saldoCeiling: SaldoCeilingService,
    private contratosService: ContratosService,
  ) {}

  async list(tenantId: string, apenasCiclosAnteriores = false) {
    const rows = await this.db.query.atas.findMany({
      where: eq(atas.tenantId, tenantId),
      with: { licitacao: true, detentorPrincipal: true, orgaos: { with: { itens: true } } },
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
    // "Ciclos Anteriores": atas que já têm uma renovação mais recente
    // apontando de volta pra elas via ataOrigemId — a aba padrão (vigentes)
    // precisa excluir essas, senão uma ata já substituída continua aparecendo
    // ao lado da própria renovação.
    const temRenovacaoMaisNova = (r: (typeof rows)[number]) => rows.some((r2) => r2.ataOrigemId === r.id);
    const filtradas = apenasCiclosAnteriores ? rows.filter(temRenovacaoMaisNova) : rows.filter((r) => !temRenovacaoMaisNova(r));
    return Promise.all(filtradas.map((r) => this.comSaldoResumo(r)));
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
        const utilizado = (await this.usadoPorOrgao(o.id)) + this.valorContratado(o.itens, contratadas);
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
  private async comSaldoResumo<T extends { orgaos: { itens: { quantidadeContratada: string; valorUnitario: string; id: string }[] }[] }>(ata: T) {
    const ataItemIds = ata.orgaos.flatMap((o) => o.itens.map((i) => i.id));
    const valorTotal = ata.orgaos.reduce(
      (acc, o) => acc + o.itens.reduce((a2, it) => a2 + Number(it.quantidadeContratada) * Number(it.valorUnitario), 0),
      0,
    );
    const contratadas = await this.quantidadeContratadaPorItens(this.db, ataItemIds);
    const utilizado = (ataItemIds.length ? await this.usadoPorItens(ataItemIds) : 0) + this.valorContratado(ata.orgaos.flatMap((o) => o.itens), contratadas);
    const { orgaos, ...rest } = ata;
    return {
      ...rest,
      quantidadeOrgaos: orgaos.length,
      valorTotal,
      valorUtilizado: utilizado,
      saldoDisponivel: valorTotal - utilizado,
    };
  }

  private async usadoPorOrgao(ataOrgaoId: string) {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.ataOrgaoId, ataOrgaoId), eq(ordens.status, 'EMITIDA')));
    return Number(row?.total ?? 0);
  }

  private async usadoPorItens(ataItemIds: string[]) {
    const [row] = await this.db
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(inArray(itensOrdem.ataItemId, ataItemIds), eq(ordens.status, 'EMITIDA')));
    return Number(row?.total ?? 0);
  }

  // Quantidade de cada item de ata já abatida por contratos do mesmo órgão —
  // mesma regra de SaldoCeilingService.ataItemSaldoDisponivel (contrato do
  // ataOrgaoId cujo item aponta pro mesmo item homologado), só que em lote.
  // Contrato nunca é gravado como "consumo" na ata: é sempre somado na leitura.
  private async quantidadeContratadaPorItens(dbOrTx: DrizzleDB, ataItemIds: string[]) {
    if (!ataItemIds.length) return new Map<string, number>();
    const rows = await dbOrTx
      .select({ ataItemId: ataItens.id, total: sql<string>`coalesce(sum(${itensContrato.quantidade}), 0)` })
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

  // Quantidade (não valor monetário) já consumida de um único item da ata: por
  // ordens emitidas direto dele + por contratos que abatem dele. Diferente de
  // usadoPorItens/usadoPorOrgao acima, que somam precoTotal pra alimentar
  // valorUtilizado — comparar uma quantidade contra uma soma de precoTotal
  // seria misturar unidades; por isso este helper separado, parametrizado por
  // tx pra ler dentro do lock de quem chama.
  private async quantidadeUsadaPorItem(dbOrTx: DrizzleDB, ataItemId: string) {
    const [row] = await dbOrTx
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(itensOrdem.ataItemId, ataItemId), eq(ordens.status, 'EMITIDA')));
    const contratada = (await this.quantidadeContratadaPorItens(dbOrTx, [ataItemId])).get(ataItemId) ?? 0;
    return Number(row?.total ?? 0) + contratada;
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
    const dup = await this.db.select().from(atas).where(and(eq(atas.tenantId, tenantId), eq(atas.numeroArp, dto.numeroArp)));
    if (dup.length) throw new ConflictException('Já existe uma ata com este número ARP');

    const [licitacao] = await this.db.select({ id: licitacoes.id }).from(licitacoes).where(and(eq(licitacoes.id, dto.licitacaoId), eq(licitacoes.tenantId, tenantId)));
    if (!licitacao) throw new BadRequestException('Licitação não encontrada para este tenant');

    const [detentor] = await this.db.select({ id: fornecedores.id }).from(fornecedores).where(and(eq(fornecedores.id, dto.detentorPrincipalId), eq(fornecedores.tenantId, tenantId)));
    if (!detentor) throw new BadRequestException('Detentor principal não encontrado para este tenant');

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

  async update(tenantId: string, id: string, dto: UpdateAtaDto) {
    await this.get(tenantId, id);
    const patch: Record<string, unknown> = {};
    if (dto.numeroArp !== undefined) patch.numeroArp = dto.numeroArp;
    if (dto.vigenciaInicial !== undefined) patch.vigenciaInicial = new Date(dto.vigenciaInicial);
    if (dto.vigenciaFinal !== undefined) patch.vigenciaFinal = new Date(dto.vigenciaFinal);
    if (dto.situacao !== undefined) patch.situacao = dto.situacao as any;
    if (Object.keys(patch).length) {
      await this.db.update(atas).set(patch).where(and(eq(atas.id, id), eq(atas.tenantId, tenantId)));
    }
    return this.get(tenantId, id);
  }

  async addOrgao(tenantId: string, ataId: string, dto: OrgaoAtaInput) {
    await this.get(tenantId, ataId);
    await this.validarSecretarias(tenantId, [dto]);
    const [row] = await this.db.insert(ataOrgaos).values({ tenantId, ataId, secretariaId: dto.secretariaId, perfil: dto.perfil as any }).returning();
    return row;
  }

  // Itens de um órgão com a quantidade já usada em ordens emitidas e o saldo
  // restante — mesmo papel de ContratosService.itensComSaldo para o wizard.
  async itensDoOrgao(tenantId: string, ataId: string, ataOrgaoId: string) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);
    const itens = await this.db.select().from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));

    const usados = await this.db
      .select({ ataItemId: itensOrdem.ataItemId, total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.ataOrgaoId, ataOrgaoId), eq(ordens.status, 'EMITIDA')))
      .groupBy(itensOrdem.ataItemId);

    const usadoPorItem = new Map(usados.map((u) => [u.ataItemId, Number(u.total)]));
    const contratadas = await this.quantidadeContratadaPorItens(this.db, itens.map((it) => it.id));

    return itens.map((it) => {
      const usado = (usadoPorItem.get(it.id) ?? 0) + (contratadas.get(it.id) ?? 0);
      return { ...it, quantidadeUtilizada: usado, quantidadeDisponivel: Number(it.quantidadeContratada) - usado };
    });
  }

  async addItem(tenantId: string, ataId: string, ataOrgaoId: string, dto: ItemAtaInput) {
    await this.validarOrgao(tenantId, ataId, ataOrgaoId);

    if (!dto.homologacaoItemId) {
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
      const [ata] = await tx.select({ homologacaoFornecedorId: atas.homologacaoFornecedorId }).from(atas).where(eq(atas.id, ataId));
      const [item] = await tx
        .select({ homologacaoFornecedorId: homologacaoItens.homologacaoFornecedorId, quantidade: homologacaoItens.quantidade })
        .from(homologacaoItens)
        .where(and(eq(homologacaoItens.id, dto.homologacaoItemId!), eq(homologacaoItens.tenantId, tenantId)));
      if (!item) throw new BadRequestException('Item homologado não encontrado');
      if (!ata?.homologacaoFornecedorId || item.homologacaoFornecedorId !== ata.homologacaoFornecedorId) {
        throw new BadRequestException('Este item homologado não pertence ao fornecedor desta ata');
      }

      const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, dto.homologacaoItemId!);
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
          descricao: dto.descricao,
          unidade: dto.unidade,
          loteId: dto.loteId,
          quantidadeContratada: String(dto.quantidade),
          valorUnitario: String(dto.valorUnitario),
          homologacaoItemId: dto.homologacaoItemId,
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

      if (!homologacaoItemId) {
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

      const [ata] = await tx.select({ homologacaoFornecedorId: atas.homologacaoFornecedorId }).from(atas).where(eq(atas.id, ataId));
      const [item] = await tx.select({ homologacaoFornecedorId: homologacaoItens.homologacaoFornecedorId }).from(homologacaoItens).where(and(eq(homologacaoItens.id, homologacaoItemId), eq(homologacaoItens.tenantId, tenantId)));
      if (!item) throw new BadRequestException('Item homologado não encontrado');
      if (!ata?.homologacaoFornecedorId || item.homologacaoFornecedorId !== ata.homologacaoFornecedorId) {
        throw new BadRequestException('Este item homologado não pertence ao fornecedor desta ata');
      }

      const { disponivel } = await this.saldoCeiling.homologacaoItemSaldoDisponivel(tx, tenantId, homologacaoItemId);
      const quantidadeAntigaMesmoItem = existente.homologacaoItemId === homologacaoItemId ? Number(existente.quantidadeContratada) : 0;
      const disponivelExcluindoEsteItem = disponivel + quantidadeAntigaMesmoItem;
      if (dto.quantidade > disponivelExcluindoEsteItem) {
        throw new BadRequestException(`Quantidade (${dto.quantidade}) excede o saldo homologado restante para este item (${disponivelExcluindoEsteItem})`);
      }

      const [row] = await tx
        .update(ataItens)
        .set({ descricao: dto.descricao, unidade: dto.unidade, loteId: dto.loteId, quantidadeContratada: String(dto.quantidade), valorUnitario: String(dto.valorUnitario), homologacaoItemId })
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

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    } catch {
      throw new BadRequestException('Não foi possível ler o arquivo como planilha — confira se não está corrompido');
    }
    const nomeAba = workbook.SheetNames[0];
    if (!nomeAba) throw new BadRequestException('A planilha não tem nenhuma aba');
    const linhas: unknown[][] = XLSX.utils.sheet_to_json(workbook.Sheets[nomeAba], { header: 1, raw: false, defval: '' });

    const existentes = await this.db.select({ numeroItem: ataItens.numeroItem }).from(ataItens).where(eq(ataItens.ataOrgaoId, ataOrgaoId));
    let proximoNumero = existentes.length + 1;

    const erros: { linha: number; motivo: string }[] = [];
    let inseridos = 0;

    for (let i = 1; i < linhas.length; i++) {
      const linha = linhas[i];
      const [, descricao, unidade, quantidadeStr, precoStr] = linha;
      const descricaoTexto = String(descricao ?? '').trim();
      const unidadeTexto = String(unidade ?? '').trim();
      if (!descricaoTexto && !unidadeTexto && !quantidadeStr && !precoStr) continue; // linha em branco

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

  // Cria uma nova ata a partir desta, com a mesma composição de órgãos/itens
  // e a QUANTIDADE CHEIA ORIGINAL (não o saldo atual) — ata original não é
  // alterada. Atas vinculadas a uma homologação não são renováveis por
  // enquanto: a UNIQUE em atas.homologacaoFornecedorId impede duas atas
  // ativas pro mesmo fornecedor homologado ao mesmo tempo, e copiar o
  // vínculo sem ele faria a ata renovada perder o rastreio de teto.
  async renovar(tenantId: string, ataId: string) {
    const [original] = await this.db.select().from(atas).where(and(eq(atas.id, ataId), eq(atas.tenantId, tenantId)));
    if (!original) throw new NotFoundException('Ata não encontrada');
    if (original.homologacaoFornecedorId) {
      throw new BadRequestException('Atas vinculadas a uma homologação ainda não podem ser renovadas');
    }

    const novoId = await this.db.transaction(async (tx) => {
      const orgaosOriginais = await tx.select().from(ataOrgaos).where(eq(ataOrgaos.ataId, ataId));
      const itensOriginais = orgaosOriginais.length
        ? await tx.select().from(ataItens).where(inArray(ataItens.ataOrgaoId, orgaosOriginais.map((o) => o.id)))
        : [];

      const vigenciaInicial = new Date();
      const vigenciaFinal = new Date(vigenciaInicial);
      vigenciaFinal.setFullYear(vigenciaFinal.getFullYear() + 1);

      const [nova] = await tx
        .insert(atas)
        .values({
          tenantId,
          tipo: original.tipo,
          // Mesmo número base + sufixo de data — a UNIQUE(tenantId, numeroArp)
          // impede reusar o número original enquanto a ata antiga existir.
          numeroArp: `${original.numeroArp} (renovação ${vigenciaInicial.toISOString().slice(0, 10)})`,
          licitacaoId: original.licitacaoId,
          detentorPrincipalId: original.detentorPrincipalId,
          ataOrigemId: original.id,
          vigenciaInicial,
          vigenciaFinal,
          atasComLotes: original.atasComLotes,
          formaControleSaldo: original.formaControleSaldo,
          casasDecimaisValor: original.casasDecimaisValor,
          casasDecimaisQuantidade: original.casasDecimaisQuantidade,
          situacao: 'VIGENTE',
        })
        .returning();

      const mapaOrgaos = new Map<string, string>();
      for (const o of orgaosOriginais) {
        const [novoOrgao] = await tx.insert(ataOrgaos).values({ tenantId, ataId: nova.id, secretariaId: o.secretariaId, perfil: o.perfil }).returning();
        mapaOrgaos.set(o.id, novoOrgao.id);
      }

      if (itensOriginais.length) {
        await tx.insert(ataItens).values(
          itensOriginais.map((it) => ({
            tenantId,
            ataOrgaoId: mapaOrgaos.get(it.ataOrgaoId)!,
            numeroItem: it.numeroItem,
            descricao: it.descricao,
            unidade: it.unidade,
            // Lotes não são clonados (número colidiria por ata) — usuário
            // recadastra se precisar na ata renovada.
            loteId: null,
            quantidadeContratada: it.quantidadeContratada,
            valorUnitario: it.valorUnitario,
          })),
        );
      }

      // Arquiva a original — sem isso, ela continua VIGENTE com o próprio
      // saldo restante ao mesmo tempo em que o clone nasce com a quantidade
      // cheia, dobrando o teto realmente gastável enquanto a vigência da
      // original não vence. Emissão de ordem já rejeita ata ARQUIVADO
      // incondicionalmente (OrdensService.validarOrigemAta/revalidarSaldoAta).
      await tx.update(atas).set({ situacao: 'ARQUIVADO' }).where(and(eq(atas.id, ataId), eq(atas.tenantId, tenantId)));

      return nova.id;
    });

    return this.get(tenantId, novoId);
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

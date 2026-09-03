import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { contratoDotacoes, contratos, itensContrato, itensOrdem, ordens } from '../db/schema';
import { CreateContratoDto, UpdateContratoDto } from './dto/contrato.dto';

@Injectable()
export class ContratosService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

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

  // Calcula o saldo do contrato: valor total dos itens (contratado) menos o
  // total já usado em ordens emitidas. Nunca é uma coluna armazenada — ver
  // seção 6.1 e 9.2 do documento de análise sobre por que isso é derivado.
  private async comSaldo<T extends { id: string; itens?: any[] }>(row: T) {
    const itens = row.itens ?? (await this.db.select().from(itensContrato).where(eq(itensContrato.contratoId, row.id)));
    const valorTotal = itens.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.valorUnitario), 0);

    const [utilizadoRow] = await this.db
      .select({ total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.contratoId, row.id), eq(ordens.status, 'EMITIDA')));

    const utilizado = Number(utilizadoRow?.total ?? 0);
    return { ...row, valorTotal, saldoDisponivel: valorTotal - utilizado, valorUtilizado: utilizado };
  }

  async create(tenantId: string, dto: CreateContratoDto) {
    const dup = await this.db.select().from(contratos).where(and(eq(contratos.tenantId, tenantId), eq(contratos.numero, dto.numero)));
    if (dup.length) throw new ConflictException('Já existe um contrato com este número');

    const [created] = await this.db
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
        vigenciaInicial: new Date(dto.vigenciaInicial),
        vigenciaFinal: new Date(dto.vigenciaFinal),
        dataAssinatura: dto.dataAssinatura ? new Date(dto.dataAssinatura) : undefined,
        formaFaturamento: dto.formaFaturamento as any,
        formaControleSaldo: (dto.formaControleSaldo as any) ?? 'NORMAL',
        situacao: (dto.situacao as any) ?? 'MINUTA',
        valorOriginal: '0',
      })
      .returning();

    if (dto.itens?.length) {
      await this.db.insert(itensContrato).values(
        dto.itens.map((it, idx) => ({
          contratoId: created.id,
          numero: idx + 1,
          descricao: it.descricao,
          unidade: it.unidade,
          quantidade: String(it.quantidade),
          valorUnitario: String(it.valorUnitario),
        })),
      );
    }

    if (dto.dotacaoIds?.length) {
      await this.db.insert(contratoDotacoes).values(
        dto.dotacaoIds.map((dotacaoId) => ({ contratoId: created.id, dotacaoId })),
      );
    }

    return this.get(tenantId, created.id);
  }

  async update(tenantId: string, id: string, dto: UpdateContratoDto) {
    await this.get(tenantId, id);
    const patch: Record<string, unknown> = {};
    if (dto.objeto !== undefined) patch.objeto = dto.objeto;
    if (dto.vigenciaInicial !== undefined) patch.vigenciaInicial = new Date(dto.vigenciaInicial);
    if (dto.vigenciaFinal !== undefined) patch.vigenciaFinal = new Date(dto.vigenciaFinal);
    if (dto.situacao !== undefined) patch.situacao = dto.situacao as any;
    if (Object.keys(patch).length) {
      await this.db.update(contratos).set(patch).where(eq(contratos.id, id));
    }
    return this.get(tenantId, id);
  }

  async addItem(tenantId: string, contratoId: string, item: { descricao: string; unidade: string; quantidade: number; valorUnitario: number }) {
    await this.get(tenantId, contratoId);
    const existentes = await this.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contratoId));
    const proximoNumero = existentes.length + 1;
    const [row] = await this.db
      .insert(itensContrato)
      .values({
        contratoId,
        numero: proximoNumero,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: String(item.quantidade),
        valorUnitario: String(item.valorUnitario),
      })
      .returning();
    return row;
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

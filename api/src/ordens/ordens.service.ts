import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { contadores, contratos, itensContrato, itensOrdem, ordens } from '../db/schema';
import { CreateOrdemDto } from './dto/ordem.dto';

@Injectable()
export class OrdensService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  list(tenantId: string) {
    return this.db.query.ordens.findMany({
      where: eq(ordens.tenantId, tenantId),
      with: { contrato: true, itens: true, dotacao: true },
      orderBy: (o, { desc }) => [desc(o.createdAt)],
    });
  }

  async get(tenantId: string, id: string) {
    const row = await this.findDetalhada(this.db, tenantId, id);
    if (!row) throw new NotFoundException('Ordem não encontrada');
    return row;
  }

  // Usado tanto fora quanto dentro de uma transação: dentro de uma tx aberta,
  // uma leitura pela conexão "this.db" (fora da tx) não enxergaria a linha
  // recém-inserida ainda não commitada — por isso este helper aceita
  // explicitamente qual conexão (db normal ou tx) usar.
  private findDetalhada(dbOrTx: DrizzleDB, tenantId: string, id: string) {
    return dbOrTx.query.ordens.findFirst({
      where: and(eq(ordens.tenantId, tenantId), eq(ordens.id, id)),
      with: { contrato: true, itens: { with: { itemContrato: true } }, dotacao: true },
    });
  }

  // Emite uma ordem: valida saldo item a item, obtém o próximo número
  // sequencial do tenant (contador configurável) e grava tudo em uma
  // transação — ou fecha por completo, ou não decrementa saldo nenhum.
  async create(tenantId: string, dto: CreateOrdemDto) {
    return this.db.transaction(async (tx) => {
      const [contrato] = await tx.select().from(contratos).where(and(eq(contratos.tenantId, tenantId), eq(contratos.id, dto.contratoId)));
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.situacao === 'ARQUIVADO') {
        throw new BadRequestException('Não é possível emitir ordem para um contrato arquivado');
      }
      if (new Date(contrato.vigenciaFinal) < new Date()) {
        throw new BadRequestException('Contrato vencido: emissão de ordens bloqueada (configurável em versões futuras)');
      }

      const itensCalculados: { itemContratoId: string; quantidade: string; precoUnitario: string; precoTotal: string }[] = [];

      for (const linha of dto.itens) {
        const [item] = await tx.select().from(itensContrato).where(eq(itensContrato.id, linha.itemContratoId));
        if (!item || item.contratoId !== dto.contratoId) {
          throw new BadRequestException('Item não pertence ao contrato selecionado');
        }

        const [usadoRow] = await tx
          .select({ total: sql<string>`coalesce(sum(${itensOrdem.quantidade}), 0)` })
          .from(itensOrdem)
          .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
          .where(and(eq(ordens.contratoId, dto.contratoId), eq(ordens.status, 'EMITIDA'), eq(itensOrdem.itemContratoId, item.id)));

        const usado = Number(usadoRow?.total ?? 0);
        const disponivel = Number(item.quantidade) - usado;
        if (linha.quantidade > disponivel) {
          throw new BadRequestException(
            `Quantidade solicitada para "${item.descricao}" (${linha.quantidade}) excede o saldo disponível (${disponivel})`,
          );
        }

        const precoUnitario = Number(item.valorUnitario);
        itensCalculados.push({
          itemContratoId: item.id,
          quantidade: String(linha.quantidade),
          precoUnitario: String(precoUnitario),
          precoTotal: (precoUnitario * linha.quantidade).toFixed(2),
        });
      }

      // Contador sequencial por tenant — cria com valor inicial 1 na primeira ordem.
      const [contador] = await tx.select().from(contadores).where(eq(contadores.tenantId, tenantId));
      let numero: number;
      if (!contador) {
        numero = 1;
        await tx.insert(contadores).values({ tenantId, proximaOrdem: 2 });
      } else {
        numero = contador.proximaOrdem;
        await tx.update(contadores).set({ proximaOrdem: numero + 1 }).where(eq(contadores.tenantId, tenantId));
      }

      const [ordem] = await tx
        .insert(ordens)
        .values({ tenantId, numero, contratoId: dto.contratoId, dotacaoId: dto.dotacaoId, status: 'EMITIDA' })
        .returning();

      await tx.insert(itensOrdem).values(itensCalculados.map((it) => ({ ordemId: ordem.id, ...it })));

      return this.findDetalhada(tx as unknown as DrizzleDB, tenantId, ordem.id);
    });
  }

  async cancelar(tenantId: string, id: string) {
    await this.get(tenantId, id);
    await this.db.update(ordens).set({ status: 'CANCELADA' }).where(eq(ordens.id, id));
    return this.get(tenantId, id);
  }
}

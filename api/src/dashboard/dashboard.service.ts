import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { diaDaData, hoje } from '../common/datas';
import { contratos, fornecedores, itensContrato, itensOrdem, ordens } from '../db/schema';

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async resumo(tenantId: string) {
    const listaContratos = await this.db.select().from(contratos).where(eq(contratos.tenantId, tenantId));
    // Datas de calendário comparadas por dia (ver common/datas.ts): o
    // contrato ainda vale no próprio dia final de vigência.
    const hojeDia = hoje();
    const limite30 = new Date(`${hojeDia}T00:00:00Z`);
    limite30.setUTCDate(limite30.getUTCDate() + 30);
    const em30dias = diaDaData(limite30);

    let vigentes = 0, vencendo30 = 0, vencidos = 0, arquivados = 0;
    let valorTotalContratado = 0;

    for (const c of listaContratos) {
      if (c.situacao === 'ARQUIVADO') { arquivados++; continue; }
      const vf = diaDaData(c.vigenciaFinal);
      if (vf < hojeDia) vencidos++;
      else if (vf <= em30dias) { vigentes++; vencendo30++; }
      else vigentes++;
    }

    // saldo por contrato (reaproveita a mesma lógica: itens - ordens emitidas)
    let saldoDisponivelTotal = 0;
    let valorUtilizadoTotal = 0;
    for (const c of listaContratos) {
      if (c.situacao === 'ARQUIVADO') continue;
      const itens = await this.db.select().from(itensContrato).where(eq(itensContrato.contratoId, c.id));
      const valorContrato = itens.reduce((acc, it) => acc + Number(it.quantidade) * Number(it.valorUnitario), 0);
      valorTotalContratado += valorContrato;

      const [utilizadoRow] = await this.db
        .select({ total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
        .from(itensOrdem)
        .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
        .where(and(eq(ordens.contratoId, c.id), eq(ordens.status, 'EMITIDA')));

      const utilizado = Number(utilizadoRow?.total ?? 0);
      valorUtilizadoTotal += utilizado;
      saldoDisponivelTotal += valorContrato - utilizado;
    }

    const [{ count: ordensEmitidas }] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(ordens)
      .where(and(eq(ordens.tenantId, tenantId), eq(ordens.status, 'EMITIDA')));

    const topFornecedoresRaw = await this.db
      .select({
        fornecedor: fornecedores.razaoSocial,
        valor: sql<string>`coalesce(sum(${itensContrato.quantidade}::numeric * ${itensContrato.valorUnitario}::numeric), 0)`,
      })
      .from(contratos)
      .innerJoin(fornecedores, eq(contratos.fornecedorId, fornecedores.id))
      .leftJoin(itensContrato, eq(itensContrato.contratoId, contratos.id))
      .where(eq(contratos.tenantId, tenantId))
      .groupBy(fornecedores.razaoSocial)
      .orderBy(sql`sum(${itensContrato.quantidade}::numeric * ${itensContrato.valorUnitario}::numeric) desc`)
      .limit(5);

    return {
      saldoDisponivelTotal,
      valorTotalContratado,
      valorUtilizadoTotal,
      percentualUtilizado: valorTotalContratado > 0 ? (valorUtilizadoTotal / valorTotalContratado) * 100 : 0,
      contratosAtivos: listaContratos.filter((c) => c.situacao !== 'ARQUIVADO').length,
      ordensEmitidas: Number(ordensEmitidas ?? 0),
      situacaoContratos: { vigentes, vencendo30, vencidos, arquivados },
      topFornecedores: topFornecedoresRaw.map((f) => ({ fornecedor: f.fornecedor, valor: Number(f.valor) })),
    };
  }
}

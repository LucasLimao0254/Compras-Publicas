import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { diaDaData, hoje } from '../common/datas';
import { centavos, reais } from '../common/dinheiro';
import { calcularSaldosContratos } from '../contratos/contratos.service';
import { contratos, fornecedores, ordens } from '../db/schema';

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  async resumo(tenantId: string) {
    const listaContratos = await this.db
      .select({ id: contratos.id, situacao: contratos.situacao, vigenciaFinal: contratos.vigenciaFinal, fornecedorId: contratos.fornecedorId, fornecedor: fornecedores.razaoSocial })
      .from(contratos)
      .innerJoin(fornecedores, eq(contratos.fornecedorId, fornecedores.id))
      .where(eq(contratos.tenantId, tenantId));
    // Datas de calendário comparadas por dia (ver common/datas.ts): o
    // contrato ainda vale no próprio dia final de vigência.
    const hojeDia = hoje();
    const limite30 = new Date(`${hojeDia}T00:00:00Z`);
    limite30.setUTCDate(limite30.getUTCDate() + 30);
    const em30dias = diaDaData(limite30);

    let vigentes = 0, vencendo30 = 0, vencidos = 0, arquivados = 0;

    for (const c of listaContratos) {
      if (c.situacao === 'ARQUIVADO') { arquivados++; continue; }
      const vf = diaDaData(c.vigenciaFinal);
      if (vf < hojeDia) vencidos++;
      else if (vf <= em30dias) { vigentes++; vencendo30++; }
      else vigentes++;
    }

    // Mesmo cálculo das telas de contrato (itens + aditivos de valor, em
    // centavos) — antes o dashboard tinha a própria conta, sem aditivos, e
    // fazia duas consultas por contrato. Arquivados ficam fora de tudo,
    // inclusive do ranking de fornecedores (antes entravam só no ranking).
    const ativos = listaContratos.filter((c) => c.situacao !== 'ARQUIVADO');
    const saldos = await calcularSaldosContratos(this.db, ativos.map((c) => c.id));

    let valorTotalContratado = 0, valorUtilizadoTotal = 0;
    const porFornecedor = new Map<string, { fornecedor: string; valor: number }>();
    for (const c of ativos) {
      const s = saldos.get(c.id)!;
      const total = centavos(s.valorTotal);
      valorTotalContratado += total;
      valorUtilizadoTotal += centavos(s.valorUtilizado);
      // agrupado por id — dois fornecedores com a mesma razão social não se somam
      const atual = porFornecedor.get(c.fornecedorId) ?? { fornecedor: c.fornecedor, valor: 0 };
      atual.valor += total;
      porFornecedor.set(c.fornecedorId, atual);
    }

    const [{ count: ordensEmitidas }] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(ordens)
      .where(and(eq(ordens.tenantId, tenantId), eq(ordens.status, 'EMITIDA')));

    const topFornecedores = [...porFornecedor.values()]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 5)
      .map((f) => ({ fornecedor: f.fornecedor, valor: reais(f.valor) }));

    return {
      saldoDisponivelTotal: reais(valorTotalContratado - valorUtilizadoTotal),
      valorTotalContratado: reais(valorTotalContratado),
      valorUtilizadoTotal: reais(valorUtilizadoTotal),
      percentualUtilizado: valorTotalContratado > 0 ? (valorUtilizadoTotal / valorTotalContratado) * 100 : 0,
      contratosAtivos: ativos.length,
      ordensEmitidas: Number(ordensEmitidas ?? 0),
      situacaoContratos: { vigentes, vencendo30, vencidos, arquivados },
      topFornecedores,
    };
  }
}

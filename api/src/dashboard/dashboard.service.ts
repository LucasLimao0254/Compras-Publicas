import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { aditivos, contratos, fornecedores, itensContrato, itensOrdem, ordens } from '../db/schema';
import { diasAte, hojeIso } from '../common/datas';

@Injectable()
export class DashboardService {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  // Três agregações por tenant (itens, aditivos de valor, ordens emitidas) em
  // vez de duas consultas por contrato — e o mesmo cálculo de
  // ContratosService.calcularSaldo: valor dos itens ± aditivos de
  // valor/supressão, menos o emitido. Sem os aditivos, o saldo daqui não batia
  // com a soma dos saldos da tela de contratos.
  async resumo(tenantId: string) {
    const listaContratos = await this.db.select().from(contratos).where(eq(contratos.tenantId, tenantId));

    const valorItens = await this.db
      .select({ contratoId: itensContrato.contratoId, total: sql<string>`coalesce(sum(${itensContrato.quantidade} * ${itensContrato.valorUnitario}), 0)` })
      .from(itensContrato)
      .innerJoin(contratos, eq(itensContrato.contratoId, contratos.id))
      .where(eq(contratos.tenantId, tenantId))
      .groupBy(itensContrato.contratoId);
    const valorAditivos = await this.db
      .select({ contratoId: aditivos.contratoId, total: sql<string>`coalesce(sum(case when ${aditivos.tipo} = 'SUPRESSAO' then -${aditivos.valorAcrescimo} else ${aditivos.valorAcrescimo} end), 0)` })
      .from(aditivos)
      .where(and(eq(aditivos.tenantId, tenantId), sql`${aditivos.tipo} in ('VALOR', 'SUPRESSAO')`))
      .groupBy(aditivos.contratoId);
    const valorOrdens = await this.db
      .select({ contratoId: ordens.contratoId, total: sql<string>`coalesce(sum(${itensOrdem.precoTotal}), 0)` })
      .from(itensOrdem)
      .innerJoin(ordens, eq(itensOrdem.ordemId, ordens.id))
      .where(and(eq(ordens.tenantId, tenantId), eq(ordens.status, 'EMITIDA')))
      .groupBy(ordens.contratoId);

    const itensPor = new Map(valorItens.map((r) => [r.contratoId, Number(r.total)]));
    const aditivosPor = new Map(valorAditivos.map((r) => [r.contratoId, Number(r.total)]));
    const ordensPor = new Map(valorOrdens.map((r) => [r.contratoId, Number(r.total)]));

    // Só contrato em situação VIGENTE entra nas contagens de vigência: minuta
    // ainda não vale e arquivado já saiu. "Vencido" é o VIGENTE cujo último
    // dia de vigência já passou (o próprio último dia ainda conta como vigente).
    let vigentes = 0, vencendo30 = 0, vencidos = 0, arquivados = 0, minutas = 0;
    let valorTotalContratado = 0, valorUtilizadoTotal = 0;
    const valorPorFornecedor = new Map<string, number>();

    for (const c of listaContratos) {
      if (c.situacao === 'ARQUIVADO') { arquivados++; continue; }
      if (c.situacao === 'MINUTA') { minutas++; continue; }

      const dias = diasAte(c.vigenciaFinal);
      if (dias < 0) vencidos++;
      else {
        vigentes++;
        if (dias <= 30) vencendo30++;
      }

      const valorContrato = (itensPor.get(c.id) ?? 0) + (aditivosPor.get(c.id) ?? 0);
      valorTotalContratado += valorContrato;
      valorUtilizadoTotal += ordensPor.get(c.id) ?? 0;
      valorPorFornecedor.set(c.fornecedorId, (valorPorFornecedor.get(c.fornecedorId) ?? 0) + valorContrato);
    }

    const [{ count: ordensEmitidas }] = await this.db
      .select({ count: sql<string>`count(*)` })
      .from(ordens)
      .where(and(eq(ordens.tenantId, tenantId), eq(ordens.status, 'EMITIDA')));

    // Agrupado pelo id do fornecedor (duas empresas de mesma razão social não
    // se somam mais), sobre os mesmos contratos e o mesmo valor do resto do painel.
    const nomes = await this.db.select({ id: fornecedores.id, razaoSocial: fornecedores.razaoSocial }).from(fornecedores).where(eq(fornecedores.tenantId, tenantId));
    const nomePor = new Map(nomes.map((f) => [f.id, f.razaoSocial]));
    const topFornecedores = [...valorPorFornecedor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, valor]) => ({ fornecedor: nomePor.get(id) ?? '—', valor }));

    return {
      exercicio: Number(hojeIso().slice(0, 4)),
      saldoDisponivelTotal: valorTotalContratado - valorUtilizadoTotal,
      valorTotalContratado,
      valorUtilizadoTotal,
      percentualUtilizado: valorTotalContratado > 0 ? (valorUtilizadoTotal / valorTotalContratado) * 100 : 0,
      contratosAtivos: vigentes,
      ordensEmitidas: Number(ordensEmitidas ?? 0),
      situacaoContratos: { vigentes, vencendo30, vencidos, arquivados, minutas },
      topFornecedores,
    };
  }
}

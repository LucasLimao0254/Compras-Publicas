import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { faixaPrazo, hoje } from '../../src/common/datas';
import { DashboardService } from '../../src/dashboard/dashboard.service';
import { Ctx, criarCenario, criarContrato, criarCtx, encerrarCtx } from '../helpers';

// A Visão geral abre a lista de contratos já filtrada: os dois lados precisam
// classificar o prazo do mesmo jeito, ou o número clicado não bate com a lista.
describe('Faixa de prazo do contrato', () => {
  it('o último dia de vigência ainda vale; 30 dias contam como "vencendo"', () => {
    expect(faixaPrazo('VIGENTE', '2026-10-06', '2026-10-07')).toBe('VENCIDO');
    expect(faixaPrazo('VIGENTE', '2026-10-07', '2026-10-07')).toBe('VENCENDO_30');
    expect(faixaPrazo('VIGENTE', '2026-11-06', '2026-10-07')).toBe('VENCENDO_30');
    expect(faixaPrazo('VIGENTE', '2026-11-07', '2026-10-07')).toBe('VIGENTE');
    expect(faixaPrazo('ARQUIVADO', '2020-01-01', '2026-10-07')).toBe('ARQUIVADO');
  });
});

describe('Visão geral × lista de contratos', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('cada contador da Visão geral é o número de contratos da lista naquela faixa', async () => {
    const c = await criarCenario(ctx);
    const dia = (delta: number) => { const d = new Date(`${hoje()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + delta); return d; };
    for (const [delta, situacao] of [[-1, 'VIGENTE'], [0, 'VIGENTE'], [30, 'VIGENTE'], [31, 'VIGENTE'], [-400, 'ARQUIVADO']] as const) {
      const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 1 }], situacao });
      await ctx.db.update(schema.contratos).set({ vigenciaFinal: dia(delta), vigenciaInicial: dia(-500) }).where(eq(schema.contratos.id, ct.id));
    }
    const lista: any[] = await ctx.contratos.list(c.tenantId);
    const conta = (...faixas: string[]) => lista.filter((x) => faixas.includes(x.faixaPrazo)).length;
    const { situacaoContratos: s, contratosAtivos, topFornecedores } = await new DashboardService(ctx.db).resumo(c.tenantId);
    expect(s).toEqual({ vigentes: conta('VIGENTE', 'VENCENDO_30'), vencendo30: conta('VENCENDO_30'), vencidos: conta('VENCIDO'), arquivados: conta('ARQUIVADO') });
    expect(s).toEqual({ vigentes: 3, vencendo30: 2, vencidos: 1, arquivados: 1 });
    expect(contratosAtivos).toBe(conta('VIGENTE', 'VENCENDO_30', 'VENCIDO'));
    expect(topFornecedores[0].fornecedorId).toBe(c.fornecedorId); // o gráfico abre o fornecedor
  });
});

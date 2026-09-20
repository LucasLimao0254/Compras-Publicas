import { eq } from 'drizzle-orm';
import { itensContrato } from '../../src/db/schema';
import { Ctx, TETO_ITEM_1, criarCenario, criarCtx, criarContrato, encerrarCtx, esgotarContrato } from '../helpers';

// Invariante 7 — Apostilamento não tem trava de saldo e nunca altera quantidade.
describe('Invariante 7 — apostilamento sem trava de saldo e sem efeito em quantidade', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const TIPOS = ['REAJUSTE_REPACTUACAO', 'ATUALIZACAO_FINANCEIRA', 'ALTERACAO_RAZAO_SOCIAL', 'EMPENHO_DOTACAO'] as const;

  it('aceita os quatro tipos mesmo com saldo sobrando nos três níveis (ao contrário do aditivo)', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 40 }] });
    expect((await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel).toBeGreaterThan(0);

    for (const tipo of TIPOS) {
      const ap = await ctx.apostilamentos.create(c.tenantId, contrato.id, c.usuarioId, { tipo, descricao: `Apostilamento ${tipo}` });
      expect(ap.tipo).toBe(tipo);
    }
    expect(await ctx.apostilamentos.list(c.tenantId, contrato.id)).toHaveLength(TIPOS.length);
  });

  it('também aceita com o saldo zerado', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: TETO_ITEM_1 }] });
    await esgotarContrato(ctx, c, contrato.id);
    await ctx.apostilamentos.create(c.tenantId, contrato.id, c.usuarioId, { tipo: 'REAJUSTE_REPACTUACAO', descricao: 'Reajuste previsto em contrato' });
  });

  it('nunca altera quantidade nem saldo: o apostilamento só registra', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 40 }] });
    const antes = await ctx.contratos.get(c.tenantId, contrato.id);
    const [itemAntes] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));

    await ctx.apostilamentos.create(c.tenantId, contrato.id, c.usuarioId, {
      tipo: 'ATUALIZACAO_FINANCEIRA',
      descricao: 'Atualização financeira do pagamento',
      valorAnterior: 400,
      valorNovo: 999999,
    });

    const depois = await ctx.contratos.get(c.tenantId, contrato.id);
    const [itemDepois] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    expect(Number(itemDepois.quantidade)).toBe(Number(itemAntes.quantidade));
    expect(Number(itemDepois.valorUnitario)).toBe(Number(itemAntes.valorUnitario));
    expect(depois.valorTotal).toBe(antes.valorTotal);
    expect(depois.saldoDisponivel).toBe(antes.saldoDisponivel);
  });
});

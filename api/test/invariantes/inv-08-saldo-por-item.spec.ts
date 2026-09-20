import { eq } from 'drizzle-orm';
import { contratos } from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarCtx, criarContrato, encerrarCtx, rejeicao } from '../helpers';

// Invariante 8 — Contrato derivado de homologação ou ata controla saldo por
// item. O modo "Valor global" (APENAS_VALOR_TOTAL) fica indisponível nesses casos.
describe('Invariante 8 — contrato com origem controla saldo por item', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const MENSAGEM = /controlam saldo por item/i;

  it('caminho feliz: contrato SEM origem pode usar o modo Valor global', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', formaControleSaldo: 'APENAS_VALOR_TOTAL', itens: [{ item: 'item1', quantidade: 10 }] });
    expect(contrato.formaControleSaldo).toBe('APENAS_VALOR_TOTAL');
  });

  it('caminho feliz: contrato COM origem aceita o modo padrão por item', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, formaControleSaldo: 'NORMAL', itens: [{ item: 'item1', quantidade: 10 }] });
    expect(contrato.formaControleSaldo).toBe('NORMAL');
  });

  it('violação: origem em HOMOLOGAÇÃO + Valor global → rejeita, com mensagem explícita', async () => {
    const c = await criarCenario(ctx);
    const msg = await rejeicao(
      criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, formaControleSaldo: 'APENAS_VALOR_TOTAL', itens: [{ item: 'item1', quantidade: 10 }] }),
    );
    expect(msg).toMatch(MENSAGEM);
  });

  it('violação: origem em ATA + Valor global → rejeita, com mensagem explícita', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 50 }]);
    const msg = await rejeicao(
      criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, formaControleSaldo: 'APENAS_VALOR_TOTAL', itens: [{ item: 'item1', quantidade: 10 }] }),
    );
    expect(msg).toMatch(MENSAGEM);
  });

  it('violação na EDIÇÃO: trocar para Valor global um contrato que tem origem também é rejeitado', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const msg = await rejeicao(ctx.contratos.update(c.tenantId, contrato.id, { formaControleSaldo: 'APENAS_VALOR_TOTAL' } as any));
    expect(msg).toMatch(MENSAGEM);
    const [gravado] = await ctx.db.select().from(contratos).where(eq(contratos.id, contrato.id));
    expect(gravado.formaControleSaldo).toBe('NORMAL');
  });

  it('a rejeição não cria contrato: nada é gravado', async () => {
    const c = await criarCenario(ctx);
    await rejeicao(criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, formaControleSaldo: 'APENAS_VALOR_TOTAL', itens: [{ item: 'item1', quantidade: 10 }] }));
    const gravados = await ctx.db.select().from(contratos).where(eq(contratos.tenantId, c.tenantId));
    expect(gravados).toHaveLength(0);
  });
});

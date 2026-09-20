import { eq } from 'drizzle-orm';
import { homologacaoItens, itensContrato } from '../../src/db/schema';
import {
  Ctx, TETO_ITEM_1, criarAta, criarCenario, criarCtx, criarContrato, dadosAditivo, encerrarCtx, esgotarContrato, rejeicao,
} from '../helpers';

// Invariante 3 — O teto da homologação é fixo. Nenhuma operação aumenta a
// quantidade homologada de um par fornecedor+item — exceto aditivo (regra 6).
describe('Invariante 3 — teto da homologação fixo', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const tetoDoBanco = async (itemId: string) => {
    const [row] = await ctx.db.select().from(homologacaoItens).where(eq(homologacaoItens.id, itemId));
    return Number(row.quantidade);
  };

  it('caminho feliz: antes da revisão concluída o item ainda é rascunho e pode ser corrigido', async () => {
    const c = await criarCenario(ctx, { status: 'pronto_para_revisao' });
    await ctx.homologacao.patchItem(c.tenantId, c.homologacaoId, c.item1, { quantidade: 120 } as any);
    expect(await tetoDoBanco(c.item1)).toBe(120);
  });

  it('violação: depois de revisada, a homologação recusa qualquer edição de quantidade — o teto trava', async () => {
    const c = await criarCenario(ctx); // nasce 'revisado'
    const msg = await rejeicao(ctx.homologacao.patchItem(c.tenantId, c.homologacaoId, c.item1, { quantidade: TETO_ITEM_1 + 500 } as any));
    expect(msg).toMatch(/já foi revisada|bloqueada/i);
    expect(await tetoDoBanco(c.item1)).toBe(TETO_ITEM_1);
  });

  it('a ata não reserva mais que o teto — nem num órgão só, nem somando os órgãos', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 70 }]);

    // órgão B tenta 40 (70 + 40 = 110 > 100)
    const msg = await rejeicao(
      ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoB, { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: 10, quantidade: 40, homologacaoItemId: c.item1 } as any),
    );
    expect(msg).toMatch(/excede/i);

    // 30 fecha exatamente o teto
    await ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoB, { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: 10, quantidade: 30, homologacaoItemId: c.item1 } as any);
    expect(await tetoDoBanco(c.item1)).toBe(TETO_ITEM_1);
  });

  it('editar um item de ata para cima também respeita o teto', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    const [item] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    const msg = await rejeicao(ctx.atas.editarItem(c.tenantId, ata.ataId, ata.orgaoA, item.id, { descricao: 'Item 1 homologado', unidade: 'UN', valorUnitario: 10, quantidade: TETO_ITEM_1 + 1 } as any));
    expect(msg).toMatch(/excede/i);
  });

  it('remanejar saldo entre órgãos move quantidade, mas não cria teto: a soma da ata e o teto raiz ficam iguais', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [
      { orgao: 'A', item: 'item1', quantidade: 60 },
      { orgao: 'B', item: 'item1', quantidade: 40 },
    ]);
    const [itemA] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    const [itemB] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoB);
    await ctx.atas.remanejarSaldo(c.tenantId, ata.ataId, c.usuarioId, { ataItemOrigemId: itemA.id, ataItemDestinoId: itemB.id, quantidade: 25 });

    const a = (await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA))[0];
    const b = (await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoB))[0];
    expect(Number(a.quantidadeContratada) + Number(b.quantidadeContratada)).toBe(TETO_ITEM_1);
    expect(await tetoDoBanco(c.item1)).toBe(TETO_ITEM_1);
  });

  it('exceção legítima (regra 6): o aditivo de quantidade acrescenta no CONTRATO, nunca no teto da homologação', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: TETO_ITEM_1 }] });
    await esgotarContrato(ctx, c, contrato.id); // os três saldos ficam zerados

    const [itemContrato] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'QUANTIDADE', itens: [{ itemContratoId: itemContrato.id, quantidade: 10 }] }) as any);

    const [depois] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    expect(Number(depois.quantidade)).toBe(TETO_ITEM_1 + 10); // o contrato cresceu…
    expect(await tetoDoBanco(c.item1)).toBe(TETO_ITEM_1); //     …o teto da homologação não.
  });
});

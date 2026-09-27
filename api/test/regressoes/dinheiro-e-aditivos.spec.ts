import * as schema from '../../src/db/schema';
import { centavos, centavosDoTotal, decimal2 } from '../../src/common/dinheiro';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, dadosAditivo, encerrarCtx, esgotarContrato, rejeicao } from '../helpers';

// Grupo 2B da revisão de bugs: dinheiro sempre em duas casas (centavos),
// aditivo de quantidade fora do teto da ata/homologação e supressão que
// realmente reduz o que as ordens podem consumir.
describe('Dinheiro em duas casas decimais', () => {
  it('arredonda para centavos sem ruído de float', () => {
    expect(centavos(1.005)).toBe(101);
    expect(centavos(0.1 + 0.2)).toBe(30);
    expect(centavosDoTotal(3, 1.2345)).toBe(370);
    expect(centavosDoTotal('1', '1.2345')).toBe(123);
    expect(decimal2(370)).toBe('3.70');
  });
});

describe('Aditivos', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('preço com 4 casas: contrato todo consumido em ordens parciais libera o aditivo, e o saldo sai em centavos', async () => {
    const c = await criarCenario(ctx);
    const [itemFracionado] = await ctx.db
      .insert(schema.homologacaoItens)
      .values({ tenantId: c.tenantId, homologacaoFornecedorId: c.homologacaoFornecedorId, numeroItem: 3, descricao: 'Item fracionado', unidade: 'UN', quantidade: '3', valorUnitario: '1.2345' })
      .returning();
    const contrato: any = await ctx.contratos.create(c.tenantId, {
      numero: `CTR-${Date.now()}`, numeroProcesso: 'PA', objeto: 'x', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
      homologacaoFornecedorId: c.homologacaoFornecedorId, vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', formaFaturamento: 'MENSAL', situacao: 'VIGENTE',
      itens: [{ descricao: 'x', unidade: 'UN', quantidade: 3, valorUnitario: 1, homologacaoItemId: itemFracionado.id }],
    } as any);
    expect(contrato.valorTotal).toBe(3.7); // 3 × 1,2345 = 3,7035 → R$ 3,70
    expect(contrato.valorOriginal).toBe('3.70');

    // três ordens de 1 unidade: cada uma R$ 1,23 → R$ 3,69 no total
    for (let i = 0; i < 3; i++) {
      await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }] } as any);
    }
    const depois: any = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(depois.valorUtilizado).toBe(3.69);
    expect(depois.saldoDisponivel).toBe(0.01); // resíduo de arredondamento, exato em centavos

    // Antes, o resíduo (0,0035 em float) bloqueava o aditivo para sempre.
    const aditivo: any = await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'VALOR', percentual: 10 }) as any);
    expect(aditivo.valorAcrescimo).toBe('0.37');
  });

  it('aditivo de QUANTIDADE fica fora do teto: homologação e ata não ficam negativas', async () => {
    // homologação direta
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }, { item: 'item2', quantidade: 50 }] });
    await esgotarContrato(ctx, c, contrato.id);
    await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'QUANTIDADE', itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 10 }] }) as any);
    const saldoHom = await ctx.db.transaction((tx) => ctx.saldo.homologacaoItemSaldoDisponivel(tx as any, c.tenantId, c.item1));
    expect(saldoHom.disponivel).toBe(0);
    const itens = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    expect(itens.find((i) => i.homologacaoItemId === c.item1)!.quantidadeDisponivel).toBe(10); // o acréscimo existe no contrato

    // via ata
    const c2 = await criarCenario(ctx);
    const ata = await criarAta(ctx, c2, [{ orgao: 'A', item: 'item1', quantidade: 100 }, { orgao: 'A', item: 'item2', quantidade: 50 }]);
    const contratoAta = await criarContrato(ctx, c2, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 100 }, { item: 'item2', quantidade: 50 }] });
    await esgotarContrato(ctx, c2, contratoAta.id);
    await ctx.aditivos.create(c2.tenantId, contratoAta.id, dadosAditivo({ tipo: 'QUANTIDADE', itens: [{ itemContratoId: contratoAta.itens[0].id, quantidade: 10 }] }) as any);
    const [itemAta] = (await ctx.atas.itensDoOrgao(c2.tenantId, ata.ataId, ata.orgaoA)).filter((i) => i.homologacaoItemId === c2.item1);
    expect(itemAta.quantidadeDisponivel).toBe(0);
    const detalheAta: any = await ctx.atas.get(c2.tenantId, ata.ataId);
    expect(detalheAta.saldoDisponivel).toBeCloseTo(0);
  });

  it('SUPRESSAO reduz a quantidade dos itens (as ordens enxergam) e devolve ao teto; nunca abaixo do consumido', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }] });
    const itemId = contrato.itens[0].id;
    await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: itemId, quantidade: 30 }] } as any);

    // percentual não reduz nada que as ordens enxerguem num contrato por item
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'SUPRESSAO', percentual: 10 }) as any))).toMatch(/itens e as quantidades a suprimir/);
    // só 70 ainda não consumidos
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'SUPRESSAO', itens: [{ itemContratoId: itemId, quantidade: 80 }] }) as any))).toMatch(/até 70/);

    const aditivo: any = await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'SUPRESSAO', itens: [{ itemContratoId: itemId, quantidade: 20 }] }) as any);
    expect(aditivo.valorAcrescimo).toBe('200.00');

    const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    expect(Number(item.quantidade)).toBe(80);
    expect(item.quantidadeDisponivel).toBe(50);
    expect(await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: itemId, quantidade: 60 }] } as any))).toMatch(/excede o saldo/);

    const depois: any = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(depois.valorTotal).toBe(800); // não desconta a supressão duas vezes
    const saldoHom = await ctx.db.transaction((tx) => ctx.saldo.homologacaoItemSaldoDisponivel(tx as any, c.tenantId, c.item1));
    expect(saldoHom.disponivel).toBe(20);

    // limite de 25% do valor original (R$ 1.000,00): mais 60 × R$ 10 excede
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'SUPRESSAO', itens: [{ itemContratoId: itemId, quantidade: 6 }] }) as any))).toMatch(/limite de 25%/);
  });

  it('ACRESCIMO_ESPECIAL entra no valor total do contrato', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 100 }] });
    await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'ACRESCIMO_ESPECIAL', percentual: 40 }) as any);
    const depois: any = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(depois.valorTotal).toBe(1400);
  });
});

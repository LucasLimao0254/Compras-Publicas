import { Ctx, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Grupo 2C da revisão de bugs: o contador de ordens era lido e depois gravado
// sem trava, então emissões simultâneas pegavam o mesmo número; e o
// sequencial podia ser configurado para um número já usado.
describe('Numeração sequencial de ordens', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('emissões simultâneas recebem números distintos e consecutivos', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }] });
    const itemContratoId = contrato.itens[0].id;

    // rascunho não trava o item, então só o contador serializa as emissões
    const criadas: any[] = await Promise.all(
      Array.from({ length: 8 }, () => ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, emitirAgora: false, itens: [{ itemContratoId, quantidade: 1 }] } as any)),
    );
    const numeros = criadas.map((o) => o.numero).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    const config = await ctx.configuracoes.getOuCriar(c.tenantId);
    expect(config.proximoNumeroOrdem).toBe(9);
  });

  it('o sequencial não pode ser configurado para um número já usado; um número maior é respeitado', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }] });
    const itemContratoId = contrato.itens[0].id;
    for (let i = 0; i < 3; i++) {
      await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId, quantidade: 1 }] } as any);
    }

    expect((await ctx.configuracoes.getOuCriar(c.tenantId)).ultimoNumeroEmitido).toBe(3); // a tela mostra ao lado do campo
    expect(await rejeicao(ctx.configuracoes.update(c.tenantId, { proximoNumeroOrdem: 2 }))).toMatch(/maior que o último já emitido \(3\)/);

    await ctx.configuracoes.update(c.tenantId, { proximoNumeroOrdem: 100 });
    const ordem: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId, quantidade: 1 }] } as any);
    expect(ordem.numero).toBe(100);
  });
});

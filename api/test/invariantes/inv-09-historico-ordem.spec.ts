import { Ctx, criarCenario, criarCtx, criarContrato, emitirOrdem, encerrarCtx, rejeicao } from '../helpers';

// Invariante 9 — Toda ordem tem histórico, presente mesmo quando nunca foi
// alterada (mostrando ao menos a emissão).
describe('Invariante 9 — toda ordem tem histórico', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  async function contratoComItem(quantidade = 30) {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade }] });
    const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    return { c, contrato, itemContratoId: item.id };
  }
  const eventos = async (c: { tenantId: string }, ordemId: string) => (await ctx.ordens.historico(c.tenantId, ordemId)).map((e) => e.tipoEvento);

  it('ordem emitida e NUNCA alterada já mostra a emissão no histórico', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId, quantidade: 5 }]);
    const tipos = await eventos(c, ordem.id);
    expect(tipos).toContain('emitiu_ordem');
    expect(tipos.length).toBeGreaterThan(0);
  });

  it('o histórico não expõe o hash de senha do autor do evento', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId, quantidade: 5 }]);
    const historico = await ctx.ordens.historico(c.tenantId, ordem.id);
    for (const e of historico) {
      expect(e.usuario).toBeDefined();
      expect((e.usuario as any).senhaHash).toBeUndefined();
    }
  });

  it('rascunho (ainda não emitido) já tem histórico do cadastro; ao emitir, ganha o evento de emissão', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const rascunho: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, emitirAgora: false, itens: [{ itemContratoId, quantidade: 5 }] } as any);
    expect(rascunho.status).not.toBe('EMITIDA');
    expect(await eventos(c, rascunho.id)).toEqual(['cadastrou']);

    await ctx.ordens.emitir(c.tenantId, c.usuarioId, rascunho.id);
    expect(await eventos(c, rascunho.id)).toContain('emitiu_ordem');
  });

  it('toda alteração pós-emissão entra no histórico, com autor e o que mudou (antes/depois)', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId, quantidade: 5 }]);
    const detalhe = await ctx.ordens.get(c.tenantId, ordem.id);

    await ctx.ordens.update(c.tenantId, c.usuarioId, 'ADMIN', ordem.id, { itens: [{ itemOrdemId: detalhe.itens[0].id, quantidade: 8 }] });

    const historico = await ctx.ordens.historico(c.tenantId, ordem.id);
    const edicao = historico.find((e) => e.tipoEvento === 'editou_ordem');
    expect(edicao).toBeDefined();
    expect(edicao!.usuarioId).toBe(c.usuarioId);
    const snap = edicao!.dadosSnapshot as { antes: { quantidade: string }[]; depois: { quantidade: string }[] };
    expect(Number(snap.antes[0].quantidade)).toBe(5);
    expect(Number(snap.depois[0].quantidade)).toBe(8);
  });

  it('violação: edição pós-emissão é exclusiva do Administrador — usuário comum é rejeitado e nada entra no histórico', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId, quantidade: 5 }]);
    const detalhe = await ctx.ordens.get(c.tenantId, ordem.id);
    const antes = await eventos(c, ordem.id);

    await rejeicao(ctx.ordens.update(c.tenantId, c.usuarioId, 'PADRAO', ordem.id, { itens: [{ itemOrdemId: detalhe.itens[0].id, quantidade: 8 }] }));
    expect(await eventos(c, ordem.id)).toEqual(antes);
  });

  it('o cancelamento também fica registrado', async () => {
    const { c, contrato, itemContratoId } = await contratoComItem();
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId, quantidade: 5 }]);
    await ctx.ordens.cancelar(c.tenantId, c.usuarioId, ordem.id);
    expect(await eventos(c, ordem.id)).toContain('cancelou');
  });
});

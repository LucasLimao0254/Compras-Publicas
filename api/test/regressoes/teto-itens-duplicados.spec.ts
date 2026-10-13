import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao, TETO_ITEM_1 } from '../helpers';

// Grupo 2A da revisão de bugs: o mesmo item homologado repetido num contrato
// (cada linha passava na checagem de teto isoladamente) e o mesmo item
// homologado adicionado duas vezes no mesmo órgão da ata (travava a ata).
describe('Teto com itens repetidos', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('contrato: duas linhas do mesmo item homologado são rejeitadas, mesmo que cada uma caiba no teto', async () => {
    const c = await criarCenario(ctx);
    const msg = await rejeicao(
      criarContrato(ctx, c, {
        origem: { homologacaoFornecedorId: c.homologacaoFornecedorId },
        itens: [{ item: 'item1', quantidade: 60 }, { item: 'item1', quantidade: 60 }],
      }),
    );
    expect(msg).toMatch(/mais de uma vez/);
    const saldo = await ctx.db.transaction((tx) => ctx.saldo.homologacaoItemSaldoDisponivel(tx as any, c.tenantId, c.item1));
    expect(saldo.disponivel).toBe(TETO_ITEM_1);
  });

  it('contrato: addItem de um item homologado que já está no contrato é rejeitado', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const msg = await rejeicao(ctx.contratos.addItem(c.tenantId, contrato.id, { descricao: 'x', unidade: 'UN', quantidade: 5, valorUnitario: 10, homologacaoItemId: c.item1 }));
    expect(msg).toMatch(/mais de uma vez/);
  });

  it('contrato: descrição/unidade/valor do item vêm da homologação', async () => {
    const c = await criarCenario(ctx);
    const contrato = await ctx.contratos.create(c.tenantId, {
      numero: `CTR-${Date.now()}`, numeroProcesso: 'PA', objeto: 'x', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
      homologacaoFornecedorId: c.homologacaoFornecedorId, vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', formaFaturamento: 'MENSAL',
      itens: [{ descricao: 'REDIGITADO', unidade: 'XX', quantidade: 3, valorUnitario: 999, homologacaoItemId: c.item1 }],
    } as any);
    expect(contrato.itens[0].descricao).toBe('Item 1 homologado');
    expect(contrato.itens[0].unidade).toBe('UN');
    expect(Number(contrato.itens[0].valorUnitario)).toBe(10);
    expect(Number(contrato.valorOriginal)).toBe(30);
  });

  it('ata: o mesmo item homologado não entra duas vezes no mesmo órgão, e a ata segue utilizável', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 10 }]);
    const msg = await rejeicao(
      ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: 'x', unidade: 'UN', valorUnitario: 10, quantidade: 5, homologacaoItemId: c.item1 } as any),
    );
    expect(msg).toMatch(/já está neste órgão/);

    // sem a duplicata, contratar contra o item continua funcionando
    const contrato = await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 10 }] });
    expect(contrato.itens).toHaveLength(1);
  });

  it('ata: importação de planilha é recusada numa ata vinculada a homologação', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    const msg = await rejeicao(ctx.atas.importarItens(c.tenantId, ata.ataId, ata.orgaoA, Buffer.from('')));
    expect(msg).toMatch(/vinculada a uma homologação/);
  });
});

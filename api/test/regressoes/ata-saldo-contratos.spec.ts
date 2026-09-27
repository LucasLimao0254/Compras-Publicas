import { Ctx, criarAta, criarCenario, criarCtx, criarContrato, dadosAditivo, encerrarCtx, rejeicao } from '../helpers';

// Regressão encontrada na simulação de 100 itens: o saldo da ata só descontava
// ordens emitidas direto da ata e ignorava os contratos que abatem dela — a
// tela mostrava a ata com saldo cheio mesmo com o teto quase todo contratado, e
// editarItem/remanejarSaldo deixavam reduzir uma quantidade já contratada.
describe('Saldo da ata desconta os contratos que abatem dela', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  // item1: R$ 10 / unidade. Ata reserva 60 no órgão A; o contrato pega 25.
  async function cenario() {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 25 }] });
    return { c, ata };
  }

  it('detalhe da ata: valor utilizado e saldo por órgão e total refletem o que foi contratado', async () => {
    const { c, ata } = await cenario();
    const detalhe: any = await ctx.atas.get(c.tenantId, ata.ataId);
    const orgaoA = detalhe.orgaos.find((o: any) => o.id === ata.orgaoA);
    expect(orgaoA.valorTotal).toBeCloseTo(600);
    expect(orgaoA.valorUtilizado).toBeCloseTo(250); // 25 × R$ 10
    expect(orgaoA.saldoDisponivel).toBeCloseTo(350);
    expect(detalhe.valorUtilizado).toBeCloseTo(250);
    expect(detalhe.saldoDisponivel).toBeCloseTo(350);
  });

  it('listagem de atas: o resumo usa o mesmo cálculo do detalhe', async () => {
    const { c, ata } = await cenario();
    const resumo: any = (await ctx.atas.list(c.tenantId)).find((a: any) => a.id === ata.ataId);
    expect(resumo.valorUtilizado).toBeCloseTo(250);
    expect(resumo.saldoDisponivel).toBeCloseTo(350);
  });

  it('itens do órgão: quantidade utilizada e disponível consideram os contratos', async () => {
    const { c, ata } = await cenario();
    const [item] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(item.quantidadeUtilizada).toBe(25);
    expect(item.quantidadeDisponivel).toBe(35);
  });

  it('violação: editar o item da ata para uma quantidade abaixo da já contratada é rejeitado', async () => {
    const { c, ata } = await cenario();
    const [item] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    const dados = (quantidade: number) => ({ descricao: item.descricao, unidade: item.unidade, valorUnitario: Number(item.valorUnitario), homologacaoItemId: item.homologacaoItemId!, quantidade });

    await rejeicao(ctx.atas.editarItem(c.tenantId, ata.ataId, ata.orgaoA, item.id, dados(20) as any));
    await ctx.atas.editarItem(c.tenantId, ata.ataId, ata.orgaoA, item.id, dados(25) as any); // exatamente o contratado: ok
    const [depois] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(Number(depois.quantidadeContratada)).toBe(25);
  });

  it('violação: remanejar mais do que o disponível (reserva − contratado) é rejeitado; remanejar exatamente o disponível é aceito', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }, { orgao: 'B', item: 'item1', quantidade: 40 }]);
    await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 25 }] });
    const [origem] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    const [destino] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoB);

    await rejeicao(ctx.atas.remanejarSaldo(c.tenantId, ata.ataId, c.usuarioId, { ataItemOrigemId: origem.id, ataItemDestinoId: destino.id, quantidade: 40 })); // só 35 livres
    await ctx.atas.remanejarSaldo(c.tenantId, ata.ataId, c.usuarioId, { ataItemOrigemId: origem.id, ataItemDestinoId: destino.id, quantidade: 35 });

    const [depoisOrigem] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(Number(depoisOrigem.quantidadeContratada)).toBe(25);
    expect(depoisOrigem.quantidadeDisponivel).toBe(0);
  });

  it('o saldo da ata volta a subir só pela derivação — nada é gravado (contrato adicional reduz de novo)', async () => {
    const { c, ata } = await cenario();
    await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 35 }] });
    const detalhe: any = await ctx.atas.get(c.tenantId, ata.ataId);
    expect(detalhe.valorUtilizado).toBeCloseTo(600);
    expect(detalhe.saldoDisponivel).toBeCloseTo(0);
  });
});

describe('Mensagem de aditivo com saldo disponível', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('formata o valor em reais no padrão brasileiro (R$ 1.234,56), não como número cru', async () => {
    const c = await criarCenario(ctx);
    // 100 × R$ 10 = R$ 1.000,00 — já tem separador de milhar
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }] });
    const msg = await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'VALOR', percentual: 5 }) as any));
    expect(msg).toMatch(/R\$\s1\.000,00/);
    expect(msg).not.toMatch(/1000\.00/);
  });
});

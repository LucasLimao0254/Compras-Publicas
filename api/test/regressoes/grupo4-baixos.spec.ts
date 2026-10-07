import { DashboardService } from '../../src/dashboard/dashboard.service';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, dadosAditivo, encerrarCtx, esgotarContrato, rejeicao } from '../helpers';

// Grupo 4 da revisão de bugs (itens de gravidade baixa).
describe('Grupo 4', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('vigência inicial depois da final é recusada em contrato e ata', async () => {
    const c = await criarCenario(ctx);
    const base = {
      numero: `CTR-${Date.now()}`, numeroProcesso: 'PA', objeto: 'x', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
      formaFaturamento: 'MENSAL', itens: [],
    };
    expect(await rejeicao(ctx.contratos.create(c.tenantId, { ...base, vigenciaInicial: '2026-12-31', vigenciaFinal: '2026-01-01' } as any))).toMatch(/vigência inicial/);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [] });
    expect(await rejeicao(ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: '2025-01-01' }))).toMatch(/vigência inicial/);

    expect(await rejeicao(ctx.atas.create(c.tenantId, {
      numeroArp: `ARP-${Date.now()}`, licitacaoId: c.licitacaoId, detentorPrincipalId: c.fornecedorId, vigenciaInicial: '2026-12-31', vigenciaFinal: '2026-01-01',
    } as any))).toMatch(/vigência inicial/);
    const ata = await criarAta(ctx, c);
    expect(await rejeicao(ctx.atas.update(c.tenantId, ata.ataId, { vigenciaInicial: '2100-01-01' }))).toMatch(/vigência inicial/);
  });

  it('item de ata não aceita lote de outra ata', async () => {
    const c = await criarCenario(ctx);
    const ataA = await criarAta(ctx, c);
    const c2 = await criarCenario(ctx);
    const ataOutra = await criarAta(ctx, c2);
    const loteAlheio: any = await ctx.atas.criarLote(c2.tenantId, ataOutra.ataId, { numero: '1', nome: 'Lote' });
    expect(await rejeicao(ctx.atas.addItem(c.tenantId, ataA.ataId, ataA.orgaoA, { descricao: 'x', unidade: 'UN', valorUnitario: 10, quantidade: 1, homologacaoItemId: c.item1, loteId: loteAlheio.id } as any))).toMatch(/Lote não encontrado/);

    const loteProprio: any = await ctx.atas.criarLote(c.tenantId, ataA.ataId, { numero: '1', nome: 'Lote' });
    const item: any = await ctx.atas.addItem(c.tenantId, ataA.ataId, ataA.orgaoA, { descricao: 'x', unidade: 'UN', valorUnitario: 10, quantidade: 1, homologacaoItemId: c.item1, loteId: loteProprio.id } as any);
    expect(item.loteId).toBe(loteProprio.id);
  });

  it('listagem de contratos e atas em lote dá o mesmo saldo do detalhe', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    const contrato = await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 25 }] });
    await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 5 }] } as any);

    const [daLista]: any[] = (await ctx.contratos.list(c.tenantId)).filter((x: any) => x.id === contrato.id);
    const detalhe: any = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(daLista.valorTotal).toBe(detalhe.valorTotal);
    expect(daLista.saldoDisponivel).toBe(detalhe.saldoDisponivel);
    expect(detalhe.saldoDisponivel).toBe(200);

    const [ataDaLista]: any[] = (await ctx.atas.list(c.tenantId)).filter((a: any) => a.id === ata.ataId);
    expect(ataDaLista.saldoDisponivel).toBeCloseTo(350);
  });

  it('dashboard: inclui aditivos de valor e deixa arquivados fora do ranking', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] }); // R$ 100
    await esgotarContrato(ctx, c, contrato.id); // R$ 100 utilizados; aditivo exige saldo zerado
    await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'VALOR', percentual: 10 }) as any); // + R$ 10
    await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item2', quantidade: 50 }], situacao: 'ARQUIVADO' }); // R$ 1.000, arquivado

    const resumo = await new DashboardService(ctx.db).resumo(c.tenantId);
    expect(resumo.valorTotalContratado).toBe(110);
    expect(resumo.valorUtilizadoTotal).toBe(100);
    expect(resumo.saldoDisponivelTotal).toBe(10);
    expect(resumo.topFornecedores).toEqual([{ fornecedorId: c.fornecedorId, fornecedor: 'Fornecedor Teste Ltda', valor: 110 }]);
    expect(resumo.situacaoContratos.arquivados).toBe(1);
  });

  it('filtros inválidos em /ordens respondem 400, não erro do banco', async () => {
    const c = await criarCenario(ctx);
    expect(await rejeicao(ctx.ordens.list(c.tenantId, { status: 'QUALQUER' }))).toMatch(/Status inválido/);
    expect(await rejeicao(ctx.ordens.list(c.tenantId, { numero: 'abc' }))).toMatch(/inteiro/);
    await expect(ctx.ordens.list(c.tenantId, { status: 'EMITIDA', numero: '1' })).resolves.toEqual([]);
  });
});

import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, emitirOrdem, encerrarCtx, rejeicao } from '../helpers';

// Rodada 2 de testes: detentor da ARP só entre os homologados; editar e
// excluir atas e contratos com regras que não deixam dado órfão.
describe('ARP: detentor entre os homologados', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('licitação com homologação revisada recusa ata sem vínculo ao fornecedor homologado', async () => {
    const c = await criarCenario(ctx);
    expect(await rejeicao(ctx.atas.create(c.tenantId, {
      numeroArp: `ARP-${Date.now()}`, licitacaoId: c.licitacaoId, detentorPrincipalId: c.fornecedorId, vigenciaInicial: '2026-01-01', vigenciaFinal: '2026-12-31',
    } as any))).toMatch(/precisa ser um dos fornecedores homologados/);
  });
});

describe('Editar e excluir ata', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('edição recusa número de outra ata; exclusão só pelo admin e só sem contrato vinculado', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 10 }]);
    const outra: any = await ctx.atas.update(c.tenantId, ata.ataId, { numeroArp: 'ARP EDITADA' });
    expect(outra.numeroArp).toBe('ARP EDITADA');

    expect(await rejeicao(ctx.atas.remover(c.tenantId, 'PADRAO', ata.ataId))).toMatch(/Somente o Administrador/);
    const contrato = await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 5 }] });
    expect(await rejeicao(ctx.atas.remover(c.tenantId, 'ADMIN', ata.ataId))).toMatch(new RegExp(`contrato vinculado \\(${contrato.numero}\\)`));

    await ctx.db.delete(schema.contratos).where(eq(schema.contratos.id, contrato.id));
    await ctx.atas.remover(c.tenantId, 'ADMIN', ata.ataId);
    expect(await ctx.db.select().from(schema.ataOrgaos).where(eq(schema.ataOrgaos.ataId, ata.ataId))).toHaveLength(0);
    // o fornecedor homologado volta a poder ter uma ata
    await criarAta(ctx, c);
  });

  it('número de ARP já usado é recusado na edição', async () => {
    const c = await criarCenario(ctx);
    const a1 = await criarAta(ctx, c);
    const [{ numeroArp }] = await ctx.db.select().from(schema.atas).where(eq(schema.atas.id, a1.ataId));
    const c2 = await criarCenario(ctx);
    const a2 = await criarAta(ctx, c2);
    await ctx.db.update(schema.atas).set({ tenantId: c.tenantId }).where(eq(schema.atas.id, a2.ataId)); // mesmo tenant
    expect(await rejeicao(ctx.atas.update(c.tenantId, a2.ataId, { numeroArp }))).toMatch(/Já existe uma ata/);
  });
});

describe('Editar e excluir contrato', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('edita número/processo/faturamento; vigência final só sem ordens nem aditivos', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] });
    const editado: any = await ctx.contratos.update(c.tenantId, contrato.id, { numero: 'CT 99/2026', numeroProcesso: 'PA 99', formaFaturamento: 'POR_ENTREGA', vigenciaFinal: '2099-06-30' });
    expect([editado.numero, editado.numeroProcesso, editado.formaFaturamento]).toEqual(['CT 99/2026', 'PA 99', 'POR_ENTREGA']);

    const outro = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [] });
    expect(await rejeicao(ctx.contratos.update(c.tenantId, outro.id, { numero: 'CT 99/2026' }))).toMatch(/Já existe um contrato/);

    await emitirOrdem(ctx, c, contrato, [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }]);
    expect(await rejeicao(ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: '2099-12-31' }))).toMatch(/aditivo de prazo/);
    await ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: '2099-06-30', objeto: 'Novo objeto' }); // mesma data: ok
  });

  it('exclusão só pelo admin e só sem ordens; itens vão junto', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    expect(await rejeicao(ctx.contratos.remover(c.tenantId, 'PADRAO', contrato.id))).toMatch(/Somente o Administrador/);

    const comOrdem = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const ordem: any = await emitirOrdem(ctx, c, comOrdem, [{ itemContratoId: comOrdem.itens[0].id, quantidade: 1 }]);
    await ctx.ordens.cancelar(c.tenantId, c.usuarioId, ordem.id, 'ADMIN'); // mesmo cancelada, a ordem impede a exclusão
    expect(await rejeicao(ctx.contratos.remover(c.tenantId, 'ADMIN', comOrdem.id))).toMatch(/não pode ser excluído/);

    await ctx.contratos.remover(c.tenantId, 'ADMIN', contrato.id);
    expect(await ctx.db.select().from(schema.itensContrato).where(eq(schema.itensContrato.contratoId, contrato.id))).toHaveLength(0);
    // a quantidade volta ao teto da homologação
    const itens = await ctx.homologacao.itensParaImportar(c.tenantId, c.licitacaoId, c.fornecedorId);
    expect(itens.find((i) => i.homologacaoItemId === c.item1)!.quantidade).toBe(90);
  });
});

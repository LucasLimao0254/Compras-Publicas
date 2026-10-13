import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { cnpjValido, documentoFornecedor } from '../../src/common/documentos';
import { FornecedoresService } from '../../src/fornecedores/fornecedores.service';
import { Ctx, criarAta, criarCenario, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Análise de bugs, grupo F: centavos na ARP, item duplicado por corrida,
// CNPJ/CPF do fornecedor e revisão com o mesmo fornecedor em dois blocos.
describe('Análise grupo F', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('valores da ARP em centavos (antes 0.1 + 0.2 = 0.30000000000000004)', async () => {
    const c = await criarCenario(ctx);
    const [itemBarato] = await ctx.db.insert(schema.homologacaoItens).values({ tenantId: c.tenantId, homologacaoFornecedorId: c.homologacaoFornecedorId, numeroItem: 9, descricao: 'Clipe', unidade: 'UN', quantidade: '10', valorUnitario: '0.1' }).returning();
    const [itemBarato2] = await ctx.db.insert(schema.homologacaoItens).values({ tenantId: c.tenantId, homologacaoFornecedorId: c.homologacaoFornecedorId, numeroItem: 10, descricao: 'Grampo', unidade: 'UN', quantidade: '10', valorUnitario: '0.2' }).returning();
    const ata = await criarAta(ctx, c);
    for (const it of [itemBarato, itemBarato2]) await ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: '', unidade: '', quantidade: 1, valorUnitario: 1, homologacaoItemId: it.id } as any);
    const d: any = await ctx.atas.get(c.tenantId, ata.ataId);
    expect(d.valorTotal).toBe(0.3);
    const [daLista]: any[] = (await ctx.atas.list(c.tenantId)).filter((a: any) => a.id === ata.ataId);
    expect(daLista.saldoDisponivel).toBe(0.3);
  });

  it('dois envios simultâneos do mesmo item homologado no mesmo órgão gravam uma linha só', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    const enviar = () => ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: '', unidade: '', quantidade: 5, valorUnitario: 1, homologacaoItemId: c.item1 } as any).then(() => 'ok', (e) => e.message);
    const r = await Promise.all([enviar(), enviar(), enviar()]);
    expect(r.filter((x) => x === 'ok')).toHaveLength(1);
    const linhas = await ctx.db.select().from(schema.ataItens).where(eq(schema.ataItens.ataOrgaoId, ata.orgaoA));
    expect(linhas).toHaveLength(1);
  });

  it('CNPJ/CPF do fornecedor: validado, num formato só, e duplicado pelos dígitos', async () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(documentoFornecedor('11222333000181')).toBe('11.222.333/0001-81');
    expect(documentoFornecedor('529.982.247-25')).toBe('529.982.247-25');

    const c = await criarCenario(ctx);
    const svc = new FornecedoresService(ctx.db, ctx.atas, ctx.contratos);
    expect(await rejeicao(svc.create(c.tenantId, { cnpjCpf: '11.222.333/0001-80', razaoSocial: 'X' }))).toMatch(/CNPJ\/CPF inválido/);
    const f = await svc.create(c.tenantId, { cnpjCpf: '11222333000181', razaoSocial: 'Papelaria Ltda' });
    expect(f.cnpjCpf).toBe('11.222.333/0001-81');
    expect(await rejeicao(svc.create(c.tenantId, { cnpjCpf: '11.222.333/0001-81', razaoSocial: 'Outra' }))).toMatch(/Já existe um fornecedor .*Papelaria Ltda/);
    // cadastro antigo com documento inválido segue editável na razão social
    const [antigo] = await ctx.db.insert(schema.fornecedores).values({ tenantId: c.tenantId, cnpjCpf: '00.000.000/0001-00', razaoSocial: 'Antigo' }).returning();
    expect((await svc.update(c.tenantId, antigo.id, { cnpjCpf: '00.000.000/0001-00', razaoSocial: 'Antigo Editado' })).razaoSocial).toBe('Antigo Editado');
  });

  it('revisão não conclui com o mesmo fornecedor vinculado a dois blocos', async () => {
    const c = await criarCenario(ctx, { status: 'pronto_para_revisao' });
    await ctx.db.insert(schema.homologacaoFornecedores).values({ tenantId: c.tenantId, homologacaoId: c.homologacaoId, nomeExtraido: 'Mesmo fornecedor (2º bloco)', fornecedorId: c.fornecedorId });
    expect(await rejeicao(ctx.homologacao.concluirRevisao(c.tenantId, c.homologacaoId))).toMatch(/vinculados ao mesmo fornecedor/);
  });
});

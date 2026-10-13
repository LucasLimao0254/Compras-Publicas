import JSZip = require('jszip');
import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { AuthService } from '../../src/auth/auth.service';
import { reaisPorExtenso } from '../../src/common/extenso';
import { MinutasService } from '../../src/minutas/minutas.service';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Análise de bugs, grupo G: login, minutas (itens e valor por extenso),
// numeração dos itens da ata pelo edital e listas filtradas no banco.
describe('Análise grupo G', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('login: e-mail sem diferenciar maiúsculas e bloqueio depois de 5 senhas erradas', async () => {
    const c = await criarCenario(ctx);
    const [tenant] = await ctx.db.select().from(schema.tenants).where(eq(schema.tenants.id, c.tenantId));
    const [user] = await ctx.db.update(schema.usuarios).set({ senhaHash: await bcrypt.hash('certa123', 4) }).where(eq(schema.usuarios.id, c.usuarioId)).returning();
    const auth = new AuthService(ctx.db, { signAsync: async () => 'token' } as any);
    const sessao: any = await auth.login({ tenantCodigo: tenant.codigo, email: user.email.toUpperCase(), senha: 'certa123' } as any);
    expect(sessao.usuario.id).toBe(c.usuarioId);

    for (let i = 0; i < 5; i++) expect(await rejeicao(auth.login({ tenantCodigo: tenant.codigo, email: user.email, senha: 'errada' } as any))).toMatch(/Credenciais inválidas/);
    expect(await rejeicao(auth.login({ tenantCodigo: tenant.codigo, email: user.email, senha: 'certa123' } as any))).toMatch(/Muitas tentativas/);
  });

  it('valor por extenso', () => {
    expect(reaisPorExtenso(159368)).toBe('mil quinhentos e noventa e três reais e sessenta e oito centavos');
    expect(reaisPorExtenso(100000000)).toBe('um milhão de reais');
    expect(reaisPorExtenso(110000)).toBe('mil e cem reais');
    expect(reaisPorExtenso(1)).toBe('um centavo');
  });

  it('minuta do contrato: {{itens}} em várias linhas e {{valor_total_extenso}}', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }, { item: 'item2', quantidade: 5 }] });
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>{{itens}}</w:t></w:r></w:p><w:p><w:r><w:t>{{valor_total_extenso}}</w:t></w:r></w:p></w:body></w:document>');
    const s = new MinutasService(ctx.db);
    await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', { originalname: 'm.docx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    const corpo = await (await JSZip.loadAsync(await s.gerar(c.tenantId, 'CONTRATO', contrato.id))).file('word/document.xml')!.async('string');
    expect(corpo).toContain('1. Item 1 homologado — 10 UN × R$ 10,00 = R$ 100,00</w:t><w:br/><w:t xml:space="preserve">2. Item 2 homologado — 5 CX × R$ 20,00 = R$ 100,00');
    expect(corpo).toContain('duzentos reais');
  });

  it('item da ata recebe o número do item na homologação', async () => {
    const c = await criarCenario(ctx);
    await ctx.db.update(schema.homologacaoItens).set({ numeroItem: 7 }).where(eq(schema.homologacaoItens.id, c.item2));
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item2', quantidade: 5 }, { orgao: 'B', item: 'item2', quantidade: 5 }]);
    const itens = await ctx.db.select().from(schema.ataItens).where(eq(schema.ataItens.homologacaoItemId, c.item2));
    expect(itens.map((i) => i.numeroItem)).toEqual([7, 7]);
    expect(ata.ataId).toBeTruthy();
  });

  it('listas filtradas no banco devolvem só o pedido', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 1 }] });
    expect((await ctx.contratos.list(c.tenantId, { licitacaoId: c.licitacaoId })).map((x: any) => x.id)).toEqual([ct.id]);
    expect(await ctx.contratos.list(c.tenantId, { ataOrgaoIds: [] })).toEqual([]);
    expect(await ctx.contratos.list(c.tenantId, { fornecedorId: '00000000-0000-0000-0000-000000000000' })).toEqual([]);
  });
});

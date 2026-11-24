import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { normalizarDocumento } from '../../src/common/documentos';
import { FornecedoresService } from '../../src/fornecedores/fornecedores.service';
import { UnidadesExecutorasService } from '../../src/unidades-executoras/unidades-executoras.service';
import { Cenario, Ctx, criarCenario, criarCtx, emitirOrdem, encerrarCtx, rejeicao } from '../helpers';

// Regressões da revisão de 03/11/2026: vigência só por aditivo, período
// coerente, CNPJ/CPF validado e comparado pelos dígitos, rateio de dotações.
describe('Revisão de novembro', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const contratoManual = (c: Cenario, extra: Record<string, unknown> = {}) =>
    ctx.contratos.create(c.tenantId, {
      numero: `R-${Math.random()}`, numeroProcesso: 'p', objeto: 'o', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
      vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', formaFaturamento: 'MENSAL', situacao: 'VIGENTE',
      itens: [{ descricao: 'x', unidade: 'UN', quantidade: 10, valorUnitario: 10 }], ...extra,
    } as any) as Promise<any>;

  describe('vigência', () => {
    it('edição do contrato não altera a vigência final (só o aditivo de prazo altera)', async () => {
      const c = await criarCenario(ctx);
      const ct = await contratoManual(c);
      // `as any`: vigenciaFinal não existe mais em UpdateContratoDto — simula um cliente enviando o campo mesmo assim
      await ctx.contratos.update(c.tenantId, ct.id, { vigenciaFinal: '2199-01-01' } as any);
      const depois: any = await ctx.contratos.get(c.tenantId, ct.id);
      expect(new Date(depois.vigenciaFinal).toISOString().slice(0, 10)).toBe('2099-12-31');
    });

    it('contrato e ata recusam vigência final anterior à inicial; o mesmo dia é aceito', async () => {
      const c = await criarCenario(ctx);
      expect(await rejeicao(contratoManual(c, { vigenciaInicial: '2026-05-10', vigenciaFinal: '2026-05-09' }))).toMatch(/anterior à vigência inicial/);
      await contratoManual(c, { vigenciaInicial: '2026-05-10', vigenciaFinal: '2026-05-10' });
      expect(await rejeicao(ctx.atas.create(c.tenantId, {
        numeroArp: 'ARP-X', licitacaoId: c.licitacaoId, detentorPrincipalId: c.fornecedorId, vigenciaInicial: '2026-05-10', vigenciaFinal: '2026-01-01',
      } as any))).toMatch(/anterior à vigência inicial/);
      const ct = await contratoManual(c, { vigenciaFinal: '2026-12-31' });
      expect(await rejeicao(ctx.contratos.update(c.tenantId, ct.id, { vigenciaInicial: '2027-01-01' }))).toMatch(/anterior/);
    });
  });

  describe('CNPJ/CPF', () => {
    it('valida dígitos verificadores e devolve sempre com máscara', () => {
      expect(normalizarDocumento('11222333000181')).toBe('11.222.333/0001-81');
      expect(normalizarDocumento('529.982.247-25')).toBe('529.982.247-25');
      expect(() => normalizarDocumento('11.222.333/0001-82')).toThrow(/CNPJ inválido/);
      expect(() => normalizarDocumento('111.111.111-11')).toThrow(/CPF inválido/);
      expect(() => normalizarDocumento('52998224725', { aceitaCpf: false })).toThrow(/CNPJ válido/);
    });

    it('o mesmo documento com e sem máscara não vira dois fornecedores', async () => {
      const c = await criarCenario(ctx);
      const svc = new FornecedoresService(ctx.db, ctx.atas, ctx.contratos);
      const f = await svc.create(c.tenantId, { cnpjCpf: '11222333000181', razaoSocial: 'Alfa' });
      expect(f.cnpjCpf).toBe('11.222.333/0001-81');
      expect(await rejeicao(svc.create(c.tenantId, { cnpjCpf: '11.222.333/0001-81', razaoSocial: 'Alfa de novo' }))).toMatch(/Já existe/);
    });

    it('cadastrar fornecedor pela revisão da homologação reaproveita o existente com outra máscara', async () => {
      const c = await criarCenario(ctx, { status: 'pronto_para_revisao' });
      const svc = new FornecedoresService(ctx.db, ctx.atas, ctx.contratos);
      const existente = await svc.create(c.tenantId, { cnpjCpf: '11.222.333/0001-81', razaoSocial: 'Alfa' });
      await ctx.homologacao.patchFornecedor(c.tenantId, c.homologacaoId, c.homologacaoFornecedorId, { novoFornecedor: { cnpjCpf: '11222333000181', razaoSocial: 'Alfa' } });
      const [hf] = await ctx.db.select().from(schema.homologacaoFornecedores).where(eq(schema.homologacaoFornecedores.id, c.homologacaoFornecedorId));
      expect(hf.fornecedorId).toBe(existente.id);
    });

    it('unidade executora aceita só CNPJ válido', async () => {
      const c = await criarCenario(ctx);
      const svc = new UnidadesExecutorasService(ctx.db);
      expect(await rejeicao(svc.create(c.tenantId, { cnpj: '529.982.247-25', razaoSocial: 'Fundo' }))).toMatch(/CNPJ/);
      expect((await svc.create(c.tenantId, { cnpj: '11222333000181', razaoSocial: 'Fundo' })).cnpj).toBe('11.222.333/0001-81');
    });
  });

  it('rateio entre dotações não pode passar do valor da ordem', async () => {
    const c = await criarCenario(ctx);
    const ct = await contratoManual(c);
    const [it] = await ctx.contratos.itensComSaldo(c.tenantId, ct.id);
    const [d1] = await ctx.db.insert(schema.dotacoes).values({ tenantId: c.tenantId, gestaoUnidade: 'A', fonteRecursos: '1', programaTrabalho: '1' }).returning();
    const [d2] = await ctx.db.insert(schema.dotacoes).values({ tenantId: c.tenantId, gestaoUnidade: 'B', fonteRecursos: '1', programaTrabalho: '1' }).returning();
    const pedir = (a: number, b: number) => ctx.ordens.create(c.tenantId, c.usuarioId, {
      contratoId: ct.id, itens: [{ itemContratoId: it.id, quantidade: 2 }], dotacoes: [{ dotacaoId: d1.id, valorRateado: a }, { dotacaoId: d2.id, valorRateado: b }],
    } as any);
    expect(await rejeicao(pedir(15, 10))).toMatch(/maior que o valor da ordem/); // ordem = 2 × R$ 10 = R$ 20
    await pedir(12, 8);
    await emitirOrdem(ctx, c, ct, [{ itemContratoId: it.id, quantidade: 1 }]); // sem dotação continua valendo
  });
});

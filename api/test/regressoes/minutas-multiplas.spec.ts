import JSZip = require('jszip');
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { MinutasService } from '../../src/minutas/minutas.service';
import { Ctx, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Grupo C do teste interno: vários modelos de minuta por tipo, com nome e
// modalidades; ao gerar, sugere pela modalidade da licitação e aceita escolha.
describe('Vários modelos de minuta por tipo', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = criarCtx();
    process.env.MINUTAS_UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'minutas-mult-'));
  });
  afterAll(() => encerrarCtx(ctx));

  async function docx(texto: string) {
    const zip = new JSZip();
    zip.file('word/document.xml', `<w:document><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`);
    return { originalname: 'modelo.docx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) };
  }
  const corpo = async (buf: Buffer) => (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');

  it('cadastra vários do mesmo tipo, sugere pela modalidade, gera com o escolhido; editar, substituir e remover', async () => {
    const c = await criarCenario(ctx); // licitação do cenário: PREGAO_ELETRONICO
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const s = new MinutasService(ctx.db);

    const generico: any = await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await docx('GENERICO {{numero_contrato}}'), { nome: 'Contrato genérico' });
    const dispensa: any = await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await docx('DISPENSA {{numero_contrato}}'), { nome: 'Dispensa', modalidades: ['DISPENSA'] });
    const pregao: any = await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await docx('PREGAO {{numero_contrato}}'), { nome: 'Pregão', modalidades: ['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL'] });

    const lista: any = await s.listarModelos(c.tenantId);
    expect(lista.prontos).toBe(1); // um tipo pronto, com 3 modelos
    expect(lista.modelos.find((m: any) => m.tipo === 'CONTRATO').itens.map((i: any) => i.nome)).toEqual(['Contrato genérico', 'Dispensa', 'Pregão']);

    const opcoes: any = await s.modelosParaEntidade(c.tenantId, 'CONTRATO', contrato.id);
    expect(opcoes.modalidade).toBe('PREGAO_ELETRONICO');
    expect(opcoes.sugeridoId).toBe(pregao.id);
    expect(await corpo(await s.gerar(c.tenantId, 'CONTRATO', contrato.id))).toContain(`PREGAO ${contrato.numero}`);
    expect(await corpo(await s.gerar(c.tenantId, 'CONTRATO', contrato.id, dispensa.id))).toContain(`DISPENSA ${contrato.numero}`);

    // sem modelo da modalidade, vale o genérico
    await s.atualizarModelo(c.tenantId, 'ADMIN', pregao.id, { modalidades: ['CONCORRENCIA_PUBLICA'] });
    expect((await s.modelosParaEntidade(c.tenantId, 'CONTRATO', contrato.id)).sugeridoId).toBe(generico.id);

    // substituir troca o arquivo do mesmo modelo e apaga o antigo do disco
    const [antes] = await ctx.db.select().from(schema.minutaModelos).where(eq(schema.minutaModelos.id, generico.id));
    await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await docx('GENERICO V2 {{numero_contrato}}'), { substituirId: generico.id });
    expect(existsSync(antes.arquivoPath)).toBe(false);
    expect(await corpo(await s.gerar(c.tenantId, 'CONTRATO', contrato.id, generico.id))).toContain('GENERICO V2');

    await s.removerModelo(c.tenantId, 'ADMIN', dispensa.id);
    expect((await s.listarModelos(c.tenantId) as any).modelos.find((m: any) => m.tipo === 'CONTRATO').itens).toHaveLength(2);
  });

  it('validações: só ADMIN mexe, modalidade inválida é recusada, modelo de outro tenant não serve', async () => {
    const a = await criarCenario(ctx);
    const b = await criarCenario(ctx);
    const s = new MinutasService(ctx.db);
    const modeloA: any = await s.enviarModelo(a.tenantId, a.usuarioId, 'ADMIN', 'CONTRATO', await docx('A'));
    expect(await rejeicao(s.enviarModelo(a.tenantId, a.usuarioId, 'ADMIN', 'CONTRATO', await docx('x'), { modalidades: ['INVENTADA'] }))).toMatch(/Modalidade/);
    expect(await rejeicao(s.atualizarModelo(a.tenantId, 'PADRAO', modeloA.id, { nome: 'x' }))).toMatch(/Administrador/);
    expect(await rejeicao(s.removerModelo(a.tenantId, 'PADRAO', modeloA.id))).toMatch(/Administrador/);
    expect(await rejeicao(s.removerModelo(b.tenantId, 'ADMIN', modeloA.id))).toMatch(/não encontrado/);
    const contratoB = await criarContrato(ctx, b, { origem: { homologacaoFornecedorId: b.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 1 }] });
    await s.enviarModelo(b.tenantId, b.usuarioId, 'ADMIN', 'CONTRATO', await docx('B'));
    expect(await rejeicao(s.gerar(b.tenantId, 'CONTRATO', contratoB.id, modeloA.id))).toMatch(/não encontrado/);
  });
});

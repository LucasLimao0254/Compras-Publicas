import JSZip = require('jszip');
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  Ctx, TETO_ITEM_1, criarCenario, criarCtx, criarContrato, dadosAditivo, encerrarCtx, esgotarContrato, rejeicao,
} from '../helpers';

// Invariante 10 — Documento sem modelo cadastrado não é gerado. Não há fallback
// nem modelo de sistema.
//
// ESTE ARQUIVO DESCREVE O CONTRATO DO ITEM 6 da TAREFA_RECONCILIACAO (minutas),
// que ainda não existe — por isso falha hoje. O módulo é carregado com `require`
// dinâmico dentro do teste, para a falha ser "Cannot find module" só aqui (e não
// um erro de compilação). API assumida — se a implementação divergir, ajuste
// este arquivo junto:
//
//   new MinutasService(db)                      // uploads em process.env.MINUTAS_UPLOADS_DIR
//   marcadoresPorTipo(): Record<TipoMinuta, { marcador: string; descricao: string }[]>
//   listarModelos(tenantId): { modelos: [...]; prontos: number; total: number }
//   enviarModelo(tenantId, usuarioId, tipoUsuario, tipo, { originalname, buffer }): Promise<void>
//   gerar(tenantId, tipo, entidadeId): Promise<Buffer>   // .docx com os marcadores substituídos
//
// tipos: 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO'
describe('Invariante 10 — documento sem modelo cadastrado não é gerado', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = criarCtx();
    process.env.MINUTAS_UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'minutas-teste-'));
  });
  afterAll(() => encerrarCtx(ctx));

  const servico = (): any => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { MinutasService } = require('../../src/minutas/minutas.service');
    return new MinutasService(ctx.db);
  };

  async function docx(textoDoCorpo: string): Promise<Buffer> {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${textoDoCorpo}</w:t></w:r></w:p></w:body></w:document>`);
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  const arquivo = async (texto = 'Contrato {{numero_contrato}} — {{fornecedor_razao_social}}') => ({ originalname: 'modelo.docx', buffer: await docx(texto) });
  const corpoDe = async (buf: Buffer) => (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');

  it('a tela de upload tem de onde listar os marcadores: cada um dos quatro tipos expõe os seus', () => {
    const marcadores = servico().marcadoresPorTipo();
    expect(Object.keys(marcadores).sort()).toEqual(['ADITIVO', 'APOSTILAMENTO', 'ARP', 'CONTRATO']);
    for (const lista of Object.values(marcadores) as { marcador: string }[][]) expect(lista.length).toBeGreaterThan(0);
    expect((marcadores.CONTRATO as { marcador: string }[]).map((m) => m.marcador)).toContain('numero_contrato');
  });

  it('violação: sem modelo cadastrado o documento NÃO é gerado — sem fallback, sem modelo de sistema', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const msg = await rejeicao(servico().gerar(c.tenantId, 'CONTRATO', contrato.id));
    expect(msg).toMatch(/modelo/i);
    await expect(servico().listarModelos(c.tenantId)).resolves.toMatchObject({ prontos: 0, total: 4 });
  });

  it('caminho feliz: com o modelo do tipo cadastrado por um Administrador, o documento é gerado com os marcadores preenchidos', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const s = servico();
    await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await arquivo());

    const gerado: Buffer = await s.gerar(c.tenantId, 'CONTRATO', contrato.id);
    const corpo = await corpoDe(gerado);
    expect(corpo).toContain(contrato.numero);
    expect(corpo).toContain('Fornecedor Teste Ltda');
    expect(corpo).not.toContain('{{');
    expect(await s.listarModelos(c.tenantId)).toMatchObject({ prontos: 1, total: 4 });
  });

  it('violação: ter o modelo de UM tipo não libera os outros — cada tipo exige o seu', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: TETO_ITEM_1 }] });
    await esgotarContrato(ctx, c, contrato.id);
    const aditivo: any = await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'VALOR', percentual: 5 }) as any);
    const apostilamento = await ctx.apostilamentos.create(c.tenantId, contrato.id, c.usuarioId, { tipo: 'REAJUSTE_REPACTUACAO', descricao: 'Reajuste' });

    const s = servico();
    await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', await arquivo());
    expect(await rejeicao(s.gerar(c.tenantId, 'ADITIVO', aditivo.id))).toMatch(/modelo/i);
    expect(await rejeicao(s.gerar(c.tenantId, 'APOSTILAMENTO', apostilamento.id))).toMatch(/modelo/i);
  });

  it('o modelo é por tenant: o modelo de um município não vale para outro', async () => {
    const a = await criarCenario(ctx);
    const b = await criarCenario(ctx);
    const contratoB = await criarContrato(ctx, b, { origem: { homologacaoFornecedorId: b.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const s = servico();
    await s.enviarModelo(a.tenantId, a.usuarioId, 'ADMIN', 'CONTRATO', await arquivo());
    expect(await rejeicao(s.gerar(b.tenantId, 'CONTRATO', contratoB.id))).toMatch(/modelo/i);
  });

  it('violação: só o Administrador do tenant cadastra modelo — usuário comum é rejeitado e nada fica cadastrado', async () => {
    const c = await criarCenario(ctx);
    const s = servico();
    await rejeicao(s.enviarModelo(c.tenantId, c.usuarioId, 'PADRAO', 'CONTRATO', await arquivo()));
    expect(await s.listarModelos(c.tenantId)).toMatchObject({ prontos: 0 });
  });

  it('violação: arquivo que não é .docx não vira modelo', async () => {
    const c = await criarCenario(ctx);
    const s = servico();
    await rejeicao(s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', { originalname: 'modelo.pdf', buffer: Buffer.from('%PDF-1.4') }));
    await rejeicao(s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', { originalname: 'modelo.docx', buffer: Buffer.from('isto não é um zip') }));
    expect(await s.listarModelos(c.tenantId)).toMatchObject({ prontos: 0 });
  });
});

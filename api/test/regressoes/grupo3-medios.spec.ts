import JSZip = require('jszip');
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as schema from '../../src/db/schema';
import { diaDaData, formatarDiaBR, hoje, vencida } from '../../src/common/datas';
import { codigoPostgres } from '../../src/common/postgres-exception.filter';
import { MinutasService, substituirMarcadores } from '../../src/minutas/minutas.service';
import { UsuariosService } from '../../src/usuarios/usuarios.service';
import { Ctx, criarCenario, criarContrato, criarCtx, dadosAditivo, encerrarCtx, esgotarContrato, rejeicao } from '../helpers';

// Grupo 3 da revisão de bugs (itens de gravidade média).
describe('Grupo 3', () => {
  let ctx: Ctx;
  beforeAll(() => {
    ctx = criarCtx();
    process.env.MINUTAS_UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'minutas-g3-'));
  });
  afterAll(() => encerrarCtx(ctx));

  const diaRelativo = (dias: number) => {
    const d = new Date(`${hoje()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return diaDaData(d);
  };

  describe('datas de calendário', () => {
    it('o contrato ainda vale no último dia de vigência e vence no dia seguinte', () => {
      expect(vencida(new Date(`${hoje()}T00:00:00Z`))).toBe(false);
      expect(vencida(new Date(`${diaRelativo(-1)}T00:00:00Z`))).toBe(true);
      expect(formatarDiaBR(new Date('2026-12-31'))).toBe('31/12/2026');
    });

    it('ordem pode ser emitida no último dia de vigência', async () => {
      const c = await criarCenario(ctx);
      const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
      await ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: hoje() });
      const ordem: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }] } as any);
      expect(ordem.status).toBe('EMITIDA');

      await ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: diaRelativo(-1) });
      expect(await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }] } as any))).toMatch(/vencido/);
    });
  });

  describe('minutas', () => {
    it('marcador quebrado pelo Word em vários <w:t> é substituído; formatação do 1º trecho fica', () => {
      const xml = '<w:body><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Contrato {{numero_</w:t></w:r><w:r><w:t>contrato}} de </w:t></w:r><w:r><w:t>{{fornecedor}}</w:t></w:r></w:p></w:body>';
      const r = substituirMarcadores(xml, { numero_contrato: '010/2026', fornecedor: 'A & B' });
      const texto = [...r.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
      expect(texto).toBe('Contrato 010/2026 de A &amp; B');
      expect(r).toContain('<w:b/></w:rPr><w:t xml:space="preserve">Contrato 010/2026</w:t>');
      expect(r).not.toContain('{{');
    });

    it('marcador desconhecido fica como está; cabeçalho também é preenchido', async () => {
      const c = await criarCenario(ctx);
      // sem origem: aditivo de valor não depende de teto esgotado
      const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] });
      const zip = new JSZip();
      zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Valor {{valor_</w:t></w:r><w:r><w:t>total}} {{nao_existe}}</w:t></w:r></w:p></w:body></w:document>');
      zip.file('word/header1.xml', '<w:hdr><w:p><w:r><w:t>Contrato {{numero_contrato}}</w:t></w:r></w:p></w:hdr>');
      const s = new MinutasService(ctx.db);
      await s.enviarModelo(c.tenantId, c.usuarioId, 'ADMIN', 'CONTRATO', { originalname: 'm.docx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });

      // valor total ATUAL: 10 × R$ 10 = 100, + aditivo de valor 10% do original = 110
      // (o aditivo exige o saldo zerado: consome o contrato antes)
      await esgotarContrato(ctx, c, contrato.id);
      await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'VALOR', percentual: 10 }) as any);

      const gerado = await JSZip.loadAsync(await s.gerar(c.tenantId, 'CONTRATO', contrato.id));
      const corpo = await gerado.file('word/document.xml')!.async('string');
      const cabecalho = await gerado.file('word/header1.xml')!.async('string');
      expect(corpo).toContain('Valor 110,00');
      expect(corpo).toContain('{{nao_existe}}');
      expect(cabecalho).toContain(`Contrato ${contrato.numero}`);
    });
  });

  it('addItem antes de qualquer aditivo entra no valor original; depois de aditivo é recusado', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [] });
    expect(Number(contrato.valorOriginal)).toBe(0);
    await ctx.contratos.addItem(c.tenantId, contrato.id, { descricao: 'Item', unidade: 'UN', quantidade: 3, valorUnitario: 1.2345 });
    const depois: any = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(depois.valorOriginal).toBe('3.70');

    await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'PRAZO', diasProrrogacao: 30 }) as any);
    expect(await rejeicao(ctx.contratos.addItem(c.tenantId, contrato.id, { descricao: 'Outro', unidade: 'UN', quantidade: 1, valorUnitario: 1 }))).toMatch(/termo aditivo/);
  });

  it('aditivo de prazo soma dias de calendário sem deslocar pelo fuso', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 1 }] });
    await ctx.contratos.update(c.tenantId, contrato.id, { vigenciaFinal: '2026-12-31' });
    const aditivo: any = await ctx.aditivos.create(c.tenantId, contrato.id, dadosAditivo({ tipo: 'PRAZO', diasProrrogacao: 1 }) as any);
    expect(diaDaData(aditivo.vigenciaFinalNova)).toBe('2027-01-01');
  });

  it('usuário com histórico não é excluído (400 com orientação), e o código do Postgres é lido do erro do drizzle', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }] } as any);
    const usuarios = new UsuariosService(ctx.db);
    expect(await rejeicao(usuarios.remove(c.tenantId, { tipoUsuario: 'ADMIN', ehAdminPlataforma: false }, c.usuarioId))).toMatch(/desative-o/);

    const erro = await ctx.db.insert(schema.secretarias).values({ tenantId: '00000000-0000-0000-0000-000000000000', titulo: 'x' }).catch((e) => e);
    expect(codigoPostgres(erro)).toBe('23503');
  });

  it('ordem emitida só é cancelada por ADMIN; rascunho qualquer usuário descarta', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const itens = [{ itemContratoId: contrato.itens[0].id, quantidade: 1 }];
    const emitida: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens } as any);
    const rascunho: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens, emitirAgora: false } as any);

    expect(await rejeicao(ctx.ordens.cancelar(c.tenantId, c.usuarioId, emitida.id, 'PADRAO'))).toMatch(/administradores/);
    expect((await ctx.ordens.get(c.tenantId, emitida.id)).status).toBe('EMITIDA');
    expect((await ctx.ordens.cancelar(c.tenantId, c.usuarioId, rascunho.id, 'PADRAO')).status).toBe('CANCELADA');
    expect((await ctx.ordens.cancelar(c.tenantId, c.usuarioId, emitida.id, 'ADMIN')).status).toBe('CANCELADA');
  });
});

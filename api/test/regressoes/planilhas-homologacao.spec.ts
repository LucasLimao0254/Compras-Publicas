import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import * as schema from '../../src/db/schema';
import { paraNumeroPlanilha } from '../../src/common/numero-planilha';
import { ExtracaoHomologacaoService } from '../../src/licitacoes-homologacao/extracao-homologacao.service';
import { Ctx, criarAta, criarCenario, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Grupo 2D da revisão de bugs: números de planilha com separador de milhar,
// reenvio de homologação duplicando o teto, fornecedor homologado vindo da
// homologação errada e extração gravada pela metade.

const CABECALHO = ['ITEM', 'QUANTIDADE', 'UNIDADE', 'DESCRIÇÃO', 'MARCA', 'MODELO', 'UNITÁRIO ADJUDICADO', 'TOTAL ADJUDICADO'];

// Célula numérica com formato "#,##0.00" — como o Excel exporta valores em R$.
function celulaNumerica(v: number): XLSX.CellObject {
  return { t: 'n', v, z: '#,##0.00' };
}

function planilhaHomologacao(blocos: { fornecedor: string; itens: [number, number, string, string, number][] }[]): Buffer {
  const linhas: unknown[][] = [];
  for (const b of blocos) {
    linhas.push([b.fornecedor]);
    linhas.push(CABECALHO);
    for (const [item, qtd, un, desc, valor] of b.itens) linhas.push([item, qtd, un, desc, '', '', valor, qtd * valor]);
  }
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  // reaplica formato de milhar nas colunas numéricas (B e G)
  for (let r = 0; r < linhas.length; r++) {
    for (const c of [1, 6]) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (typeof ws[ref]?.v === 'number') ws[ref] = celulaNumerica(ws[ref].v as number);
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Homologação');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('Números de planilha', () => {
  it('número cru é usado direto; texto decide o separador decimal pelo último sinal', () => {
    expect(paraNumeroPlanilha(8495.91)).toBe(8495.91);
    expect(paraNumeroPlanilha('R$ 8.495,91')).toBe(8495.91);
    expect(paraNumeroPlanilha('8,495.91')).toBe(8495.91);
    expect(paraNumeroPlanilha('9,5')).toBe(9.5);
    expect(paraNumeroPlanilha('10.5')).toBe(10.5);
    expect(paraNumeroPlanilha('-')).toBeNull();
    expect(paraNumeroPlanilha('')).toBeNull();
    expect(paraNumeroPlanilha('abc')).toBeNull();
  });

  it('extração de homologação lê célula numérica formatada com milhar pelo valor real (não 1000x menor)', async () => {
    const buffer = planilhaHomologacao([{ fornecedor: 'Fornecedor: ACME LTDA- 12.345.678/0001-90', itens: [[1, 1500, 'UN', 'Cadeira', 8495.91]] }]);
    const r = await new ExtracaoHomologacaoService().extrair(buffer);
    expect(r.fornecedores[0].itens[0].quantidade).toBe(1500);
    expect(r.fornecedores[0].itens[0].valorUnitario).toBe(8495.91);
  });
});

describe('Homologação', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  function arquivo(buffer: Buffer) {
    const path = join(tmpdir(), `homologacao-teste-${Date.now()}-${Math.random()}.xlsx`);
    writeFileSync(path, buffer);
    return { path, originalname: 'homologacao.xlsx', size: buffer.length };
  }

  it('falha no meio da gravação não deixa fornecedor/item pela metade', async () => {
    const c = await criarCenario(ctx);
    // segundo fornecedor com valor fora da precisão da coluna numeric(14,4)
    const buffer = planilhaHomologacao([
      { fornecedor: 'Fornecedor: PRIMEIRO LTDA- 11.111.111/0001-11', itens: [[1, 10, 'UN', 'Item ok', 5]] },
      { fornecedor: 'Fornecedor: SEGUNDO LTDA- 22.222.222/0001-22', itens: [[1, 10, 'UN', 'Item estourado', 1e12]] },
    ]);
    const hom: any = await ctx.homologacao.upload(c.tenantId, c.licitacaoId, c.usuarioId, arquivo(buffer));
    expect(hom.status).toBe('erro');
    expect(hom.fornecedores).toHaveLength(0);
  });

  async function reenvioProntoParaRevisao(c: Awaited<ReturnType<typeof criarCenario>>) {
    const [hom] = await ctx.db.insert(schema.licitacaoHomologacoes).values({
      tenantId: c.tenantId, licitacaoId: c.licitacaoId, arquivoNome: 'reenvio.xlsx', arquivoPath: '/dev/null', tamanhoBytes: 0, enviadoPor: c.usuarioId, status: 'pronto_para_revisao',
    }).returning();
    const [forn] = await ctx.db.insert(schema.homologacaoFornecedores).values({ tenantId: c.tenantId, homologacaoId: hom.id, nomeExtraido: 'Fornecedor', fornecedorId: c.fornecedorId }).returning();
    await ctx.db.insert(schema.homologacaoItens).values({ tenantId: c.tenantId, homologacaoFornecedorId: forn.id, numeroItem: 1, descricao: 'Item 1 corrigido', unidade: 'UN', quantidade: '100', valorUnitario: '9' });
    return { hom, forn };
  }

  it('reenvio concluído substitui a revisão anterior ainda não usada — só um teto vale', async () => {
    const c = await criarCenario(ctx);
    const { forn } = await reenvioProntoParaRevisao(c);
    await ctx.homologacao.concluirRevisao(c.tenantId, (await ctx.db.select().from(schema.homologacaoFornecedores).where(eq(schema.homologacaoFornecedores.id, forn.id)))[0].homologacaoId);

    const [anterior] = await ctx.db.select().from(schema.licitacaoHomologacoes).where(eq(schema.licitacaoHomologacoes.id, c.homologacaoId));
    expect(anterior.status).toBe('substituido');

    const fornecedores = await ctx.homologacao.fornecedoresHomologados(c.tenantId, c.licitacaoId);
    expect(fornecedores).toHaveLength(1);
    expect(fornecedores[0].homologacaoFornecedorId).toBe(forn.id);
    const itens = await ctx.homologacao.itensParaImportar(c.tenantId, c.licitacaoId, c.fornecedorId);
    expect(itens.map((i) => i.descricao)).toEqual(['Item 1 corrigido']);
  });

  it('reenvio é recusado quando a revisão anterior já está em uso por ata/contrato', async () => {
    const c = await criarCenario(ctx);
    await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 10 }]);
    const { hom } = await reenvioProntoParaRevisao(c);
    expect(await rejeicao(ctx.homologacao.concluirRevisao(c.tenantId, hom.id))).toMatch(/já tem uma homologação revisada em uso/);
    const [anterior] = await ctx.db.select().from(schema.licitacaoHomologacoes).where(eq(schema.licitacaoHomologacoes.id, c.homologacaoId));
    expect(anterior.status).toBe('revisado');
  });

  it('com duas revisadas (dado legado), fornecedoresHomologados escolhe a mais recente — a mesma de itensParaImportar', async () => {
    const c = await criarCenario(ctx);
    const { hom, forn } = await reenvioProntoParaRevisao(c);
    await ctx.db.update(schema.licitacaoHomologacoes).set({ status: 'revisado', enviadoEm: new Date(Date.now() + 60_000) }).where(eq(schema.licitacaoHomologacoes.id, hom.id));
    const [f] = await ctx.homologacao.fornecedoresHomologados(c.tenantId, c.licitacaoId);
    expect(f.homologacaoFornecedorId).toBe(forn.id);
  });
});

describe('Importação mostra a quantidade disponível (E3)', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('sem órgão: teto menos o que atas e contratos diretos já usaram; com órgão da ata: o saldo daquele órgão', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    const porItem = (lista: any[]) => Object.fromEntries(lista.map((i) => [i.homologacaoItemId, i]));

    const semOrgao = porItem(await ctx.homologacao.itensParaImportar(c.tenantId, c.licitacaoId, c.fornecedorId));
    expect(semOrgao[c.item1].quantidadeHomologada).toBe(100);
    expect(semOrgao[c.item1].quantidade).toBe(40); // 60 reservados na ata
    expect(semOrgao[c.item2].quantidade).toBe(50);

    await criarContratoNaAta(ctx, c, ata.orgaoA, 25);
    const noOrgaoA = porItem(await ctx.homologacao.itensParaImportar(c.tenantId, c.licitacaoId, c.fornecedorId, ata.orgaoA));
    expect(noOrgaoA[c.item1].quantidade).toBe(35); // 60 do órgão − 25 contratados
    expect(noOrgaoA[c.item2].quantidade).toBe(0); // item 2 não está neste órgão
  });
});

async function criarContratoNaAta(ctx: Ctx, c: any, ataOrgaoId: string, quantidade: number) {
  const { criarContrato } = await import('../helpers');
  return criarContrato(ctx, c, { origem: { ataOrgaoId }, itens: [{ item: 'item1', quantidade }] });
}

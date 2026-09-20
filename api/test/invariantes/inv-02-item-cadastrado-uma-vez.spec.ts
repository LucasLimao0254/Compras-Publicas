import { homologacaoFornecedores, homologacaoItens, fornecedores } from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarCtx, criarContrato, encerrarCtx, rejeicao, TETO_ITEM_1 } from '../helpers';

// Invariante 2 — Item é cadastrado uma única vez, na importação da homologação.
// Ata, contrato e ordem referenciam o item; nunca redigitam descrição, unidade,
// marca ou valor unitário.
describe('Invariante 2 — item cadastrado uma única vez (na homologação)', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('caminho feliz: o item de ata referencia o item homologado do fornecedor da própria ata', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 10 }]);
    const itens = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(itens).toHaveLength(1);
    expect(itens[0].homologacaoItemId).toBe(c.item1);
  });

  it('violação: não dá pra puxar para a ata um item homologado de OUTRO fornecedor', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);

    // segundo fornecedor homologado na mesma licitação, com um item próprio
    const [outro] = await ctx.db.insert(fornecedores).values({ tenantId: c.tenantId, cnpjCpf: '11.111.111/0001-11', razaoSocial: 'Outro Fornecedor' }).returning();
    const [outroHom] = await ctx.db
      .insert(homologacaoFornecedores)
      .values({ tenantId: c.tenantId, homologacaoId: c.homologacaoId, nomeExtraido: 'Outro', fornecedorId: outro.id })
      .returning();
    const [itemAlheio] = await ctx.db
      .insert(homologacaoItens)
      .values({ tenantId: c.tenantId, homologacaoFornecedorId: outroHom.id, numeroItem: 1, descricao: 'Item do outro', unidade: 'UN', quantidade: '10', valorUnitario: '5' })
      .returning();

    const msg = await rejeicao(
      ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: 'x', unidade: 'UN', valorUnitario: 5, quantidade: 1, homologacaoItemId: itemAlheio.id } as any),
    );
    expect(msg).toMatch(/não pertence ao fornecedor/i);
  });

  // ---- LACUNAS CONHECIDAS (fora do escopo dos itens 2–6 da TAREFA_RECONCILIACAO) ----
  // O código de hoje aceita descrição/unidade/valor digitados junto do vínculo com
  // a homologação, e aceita item sem vínculo em ata/contrato que têm origem. Isso
  // contradiz o invariante 2. Ficam como `it.failing`: passam (como "falha
  // esperada") enquanto a lacuna existir e VIRAM VERMELHO quando ela for
  // corrigida — aí é só trocar `it.failing` por `it`.

  it.failing('LACUNA: descrição/unidade/valor do item de ata vêm da homologação, não do que o cliente digitar', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    await ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, {
      descricao: 'DESCRIÇÃO REDIGITADA',
      unidade: 'XX',
      valorUnitario: 999,
      quantidade: 5,
      homologacaoItemId: c.item1,
    } as any);
    const [item] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(item.descricao).toBe('Item 1 homologado');
    expect(item.unidade).toBe('UN');
    expect(Number(item.valorUnitario)).toBe(10);
  });

  it.failing('LACUNA: ata vinculada a uma homologação não aceita item sem homologacaoItemId', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    await rejeicao(
      ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: 'Item digitado à mão', unidade: 'UN', valorUnitario: 1, quantidade: 1 } as any),
    );
  });

  it.failing('LACUNA: contrato com origem não aceita item sem homologacaoItemId', async () => {
    const c = await criarCenario(ctx);
    await rejeicao(
      ctx.contratos.create(c.tenantId, {
        numero: 'CTR-LACUNA',
        numeroProcesso: 'PA',
        objeto: 'x',
        licitacaoId: c.licitacaoId,
        orgaoGerenciadorId: c.secretariaA,
        fornecedorId: c.fornecedorId,
        homologacaoFornecedorId: c.homologacaoFornecedorId,
        vigenciaInicial: '2026-01-01',
        vigenciaFinal: '2099-12-31',
        formaFaturamento: 'MENSAL',
        itens: [{ descricao: 'Item digitado à mão', unidade: 'UN', quantidade: TETO_ITEM_1, valorUnitario: 1 }],
      } as any),
    );
  });

  it('o teto do item (quantidade homologada) é a única fonte de quantidade máxima — o contrato não passa dele', async () => {
    const c = await criarCenario(ctx);
    const msg = await rejeicao(
      criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: TETO_ITEM_1 + 1 }] }),
    );
    expect(msg).toMatch(/excede/i);
  });
});

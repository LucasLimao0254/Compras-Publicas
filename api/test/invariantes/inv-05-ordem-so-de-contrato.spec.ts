import { eq } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { itensOrdem, ordens } from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarCtx, criarContrato, emitirOrdem, encerrarCtx, rejeicao } from '../helpers';

// Invariante 5 — Ordem só nasce de contrato. Não existe ordem derivada
// diretamente de ata ou de homologação. Não é possível emitir ordem de item não
// contratado ou sem saldo no contrato.
describe('Invariante 5 — ordem só nasce de contrato', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  // Enquanto o toggle `permitirOrdemDiretoAta` existir no schema, liga-o: assim o
  // teste prova que a ordem-direto-da-ata é rejeitada SEMPRE, e não só porque um
  // flag de configuração estava desligado. Quando o toggle for removido (item 2
  // da TAREFA_RECONCILIACAO), este passo vira no-op.
  async function ligarToggleDeOrdemDiretoSeExistir(tenantId: string) {
    const { rows } = await ctx.pool.query(
      `select 1 from information_schema.columns where table_name = 'configuracoes_compras' and column_name = 'permitir_ordem_direto_ata'`,
    );
    if (rows.length) await ctx.pool.query(`update configuracoes_compras set permitir_ordem_direto_ata = true where tenant_id = $1`, [tenantId]);
  }

  it('caminho feliz: ordem emitida a partir de contrato, com saldo', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 30 }] });
    const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId: item.id, quantidade: 10 }]);
    expect(ordem.status).toBe('EMITIDA');
    expect(ordem.contratoId).toBe(contrato.id);
  });

  it('violação: ordem a partir de ata (ataOrgaoId + ataItemId) é rejeitada, mesmo com o toggle antigo ligado', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 50 }]);
    const [ataItem] = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    await ligarToggleDeOrdemDiretoSeExistir(c.tenantId);

    await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { ataOrgaoId: ata.orgaoA, itens: [{ ataItemId: ataItem.id, quantidade: 1 }] } as any));

    const criadas = await ctx.db.select().from(ordens).where(eq(ordens.tenantId, c.tenantId));
    expect(criadas).toHaveLength(0); // nada foi gravado
    const depois = await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoA);
    expect(depois[0].quantidadeDisponivel).toBe(50); // e o saldo da ata não se mexeu
  });

  it('violação: informar contrato E ata na mesma ordem é rejeitado', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 50 }]);
    const contrato = await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 20 }] });
    const [itemContrato] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    await ligarToggleDeOrdemDiretoSeExistir(c.tenantId);

    await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, ataOrgaoId: ata.orgaoA, itens: [{ itemContratoId: itemContrato.id, quantidade: 1 }] } as any));
  });

  it('violação: ordem sem nenhuma origem é rejeitada', async () => {
    const c = await criarCenario(ctx);
    await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { itens: [{ itemContratoId: 'x', quantidade: 1 }] } as any));
  });

  it('violação: não emite ordem de item que não pertence ao contrato informado', async () => {
    const c = await criarCenario(ctx);
    const contratoA = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const contratoB = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item2', quantidade: 10 }] });
    const [itemDeB] = await ctx.contratos.itensComSaldo(c.tenantId, contratoB.id);
    const msg = await rejeicao(emitirOrdem(ctx, c, contratoA, [{ itemContratoId: itemDeB.id, quantidade: 1 }]));
    expect(msg).toMatch(/não pertence ao contrato/i);
  });

  it('violação: não emite ordem acima do saldo do contrato', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
    const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    await emitirOrdem(ctx, c, contrato, [{ itemContratoId: item.id, quantidade: 8 }]);
    const msg = await rejeicao(emitirOrdem(ctx, c, contrato, [{ itemContratoId: item.id, quantidade: 3 }]));
    expect(msg).toMatch(/excede o saldo/i);
  });

  // Garantia estrutural: enquanto o schema tiver colunas de origem em ata na
  // ordem, o invariante depende só de um `if` no serviço. Falha hoje; passa
  // quando o item 2 da tarefa remover `ordens.ata_orgao_id` e `itens_ordem.ata_item_id`.
  it('estrutura: o schema não permite representar uma ordem derivada de ata', () => {
    const colunasOrdens = getTableConfig(ordens).columns.map((col) => col.name);
    const colunasItens = getTableConfig(itensOrdem).columns.map((col) => col.name);
    expect(colunasOrdens).not.toContain('ata_orgao_id');
    expect(colunasItens).not.toContain('ata_item_id');
  });
});

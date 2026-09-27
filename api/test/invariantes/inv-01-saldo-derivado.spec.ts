import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarCtx, criarContrato, emitirOrdem, encerrarCtx } from '../helpers';

// Invariante 1 — Saldo é sempre derivado, nunca armazenado.
describe('Invariante 1 — saldo derivado, nunca armazenado', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('nenhuma tabela do schema tem coluna que guarde saldo (conferido por leitura do schema, não por convenção)', () => {
    const colunas: string[] = [];
    for (const valor of Object.values(schema)) {
      if (!is(valor, PgTable)) continue;
      const { name, columns } = getTableConfig(valor);
      for (const col of columns) colunas.push(`${name}.${col.name}`);
    }
    expect(colunas.length).toBeGreaterThan(50); // sanidade: o scan realmente leu o schema

    // `forma_controle_saldo` é um modo de controle (enum), não um valor gravado.
    const suspeitas = colunas.filter((c) => /(^|[._])saldo([_.]|$)/.test(c) && !c.endsWith('.forma_controle_saldo'));
    expect(suspeitas).toEqual([]);
  });

  it('caminho feliz: o saldo do contrato cai ao emitir ordem e volta ao cancelar — sem nenhuma coluna sendo atualizada', async () => {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 40 }] });
    const antes = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(antes.saldoDisponivel).toBeCloseTo(400); // 40 × R$ 10

    const itens = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
    const ordem = await emitirOrdem(ctx, c, contrato, [{ itemContratoId: itens[0].id, quantidade: 15 }]);

    const durante = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(durante.saldoDisponivel).toBeCloseTo(250); // 400 − 15 × 10
    expect(durante.valorUtilizado).toBeCloseTo(150);

    await ctx.ordens.cancelar(c.tenantId, c.usuarioId, ordem.id, 'ADMIN');
    const depois = await ctx.contratos.get(c.tenantId, contrato.id);
    expect(depois.saldoDisponivel).toBeCloseTo(400);
  });

  it('violação: o saldo do item de uma ata também é derivado da soma dos contratos que abatem dela', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    const sem = await ctx.saldo.ataItemSaldoDisponivel(ctx.db, c.tenantId, ata.orgaoA, c.item1);
    expect(sem.disponivel).toBe(60);

    await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 25 }] });
    const com = await ctx.saldo.ataItemSaldoDisponivel(ctx.db, c.tenantId, ata.orgaoA, c.item1);
    expect(com.disponivel).toBe(35);
  });
});

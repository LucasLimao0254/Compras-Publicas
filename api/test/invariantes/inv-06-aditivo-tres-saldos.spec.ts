import { eq } from 'drizzle-orm';
import { homologacaoItens, itensContrato } from '../../src/db/schema';
import {
  Cenario, Ctx, TETO_ITEM_1, criarAta, criarCenario, criarCtx, criarContrato, dadosAditivo, emitirOrdem, encerrarCtx, esgotarContrato, rejeicao,
} from '../helpers';

// Invariante 6 — Aditivo só com os três saldos zerados. Contrato, ata (quando
// houver) e homologação precisam estar simultaneamente em saldo zero — sem
// tolerância percentual. A quantidade do aditivo é acrescida FORA do teto da
// homologação.
//
// Escopo destes testes: os tipos que ACRESCENTAM consumo (valor, quantidade,
// acréscimo especial). Como PRAZO e SUPRESSÃO se comportam sob a regra é uma
// dúvida em aberto — ver relatório da TAREFA_RECONCILIACAO — e por isso não são
// afirmados aqui.
describe('Invariante 6 — aditivo só com os três saldos zerados', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const aditivoDeValor = () => dadosAditivo({ tipo: 'VALOR', percentual: 5 });
  const aditivoDeQuantidade = (itemContratoId: string) => dadosAditivo({ tipo: 'QUANTIDADE', itens: [{ itemContratoId, quantidade: 10 }] });
  const aditivoEspecial = () => dadosAditivo({ tipo: 'ACRESCIMO_ESPECIAL', percentual: 10 });

  // Cenário com ata: teto 100 do item 1; a ata reserva `reservaAta`, o contrato
  // (do órgão A) pega `noContrato`, e `ordenado` é o que já foi efetivamente pedido.
  async function comAta(reservaAta: number, noContrato: number, ordenado: number) {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: reservaAta }]);
    const contrato = await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: noContrato }] });
    if (ordenado > 0) {
      const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
      await emitirOrdem(ctx, c, contrato, [{ itemContratoId: item.id, quantidade: ordenado }]);
    }
    const [itemContrato] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    return { c, contrato, itemContratoId: itemContrato.id };
  }

  async function diretoDaHomologacao(noContrato: number, ordenado: number) {
    const c = await criarCenario(ctx);
    const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: noContrato }] });
    if (ordenado > 0) {
      const [item] = await ctx.contratos.itensComSaldo(c.tenantId, contrato.id);
      await emitirOrdem(ctx, c, contrato, [{ itemContratoId: item.id, quantidade: ordenado }]);
    }
    const [itemContrato] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.contratoId, contrato.id));
    return { c, contrato, itemContratoId: itemContrato.id };
  }

  const tetoDoBanco = async (c: Cenario) => {
    const [row] = await ctx.db.select().from(homologacaoItens).where(eq(homologacaoItens.id, c.item1));
    return Number(row.quantidade);
  };

  describe('com ata no meio', () => {
    // Um cenário zerado por tipo: um aditivo de valor/quantidade devolve saldo ao
    // contrato (é o objetivo dele), então o segundo aditivo no mesmo contrato
    // seria — corretamente — barrado de novo.
    it.each([
      ['VALOR', () => aditivoDeValor()],
      ['ACRESCIMO_ESPECIAL', () => aditivoEspecial()],
    ])('caminho feliz: os TRÊS saldos zerados → aceita aditivo %s', async (_tipo, dados) => {
      const { c, contrato } = await comAta(TETO_ITEM_1, TETO_ITEM_1, TETO_ITEM_1);
      expect((await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel).toBe(0);
      await ctx.aditivos.create(c.tenantId, contrato.id, dados() as any);
      expect(await ctx.aditivos.list(c.tenantId, contrato.id)).toHaveLength(1);
    });

    it('caminho feliz: os TRÊS saldos zerados → aceita aditivo de QUANTIDADE, que entra fora do teto da homologação', async () => {
      const { c, contrato, itemContratoId } = await comAta(TETO_ITEM_1, TETO_ITEM_1, TETO_ITEM_1);
      expect((await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel).toBe(0);

      await ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any);

      const [depois] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.id, itemContratoId));
      expect(Number(depois.quantidade)).toBe(TETO_ITEM_1 + 10); // o contrato passou do teto original…
      expect(await tetoDoBanco(c)).toBe(TETO_ITEM_1); //            …que segue intacto.
    });

    it('violação: saldo do CONTRATO diferente de zero → rejeita', async () => {
      const { c, contrato, itemContratoId } = await comAta(TETO_ITEM_1, TETO_ITEM_1, 90); // sobram 10 no contrato
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any));
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoEspecial() as any));
    });

    it('violação: saldo da ATA diferente de zero (contrato e homologação zerados) → rejeita', async () => {
      // ata reserva os 100; o contrato pega só 60 e o esgota → contrato 0, homologação 0, ata sobra 40
      const { c, contrato, itemContratoId } = await comAta(TETO_ITEM_1, 60, 60);
      expect((await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel).toBe(0);
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any));
    });

    it('violação: saldo da HOMOLOGAÇÃO diferente de zero (contrato e ata zerados) → rejeita', async () => {
      // ata reserva só 60 dos 100; contrato pega os 60 e esgota → contrato 0, ata 0, homologação sobra 40
      const { c, contrato, itemContratoId } = await comAta(60, 60, 60);
      expect((await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel).toBe(0);
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any));
    });
  });

  describe('sem ata (contrato direto da homologação)', () => {
    it('caminho feliz: contrato e homologação zerados → aceita', async () => {
      const { c, contrato } = await diretoDaHomologacao(TETO_ITEM_1, TETO_ITEM_1);
      await ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any);
    });

    it('violação: saldo da HOMOLOGAÇÃO ainda não consumido → rejeita', async () => {
      const { c, contrato, itemContratoId } = await diretoDaHomologacao(60, 60); // contrato zerado, homologação sobra 40
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any));
    });

    it('violação: saldo do CONTRATO ainda não consumido → rejeita', async () => {
      const { c, contrato } = await diretoDaHomologacao(TETO_ITEM_1, 50);
      await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
    });
  });

  it('sem tolerância percentual: 1% de saldo restante já bloqueia o aditivo', async () => {
    const { c, contrato } = await diretoDaHomologacao(TETO_ITEM_1, 99); // sobra 1 unidade (1% do contrato)
    const saldo = (await ctx.contratos.get(c.tenantId, contrato.id)).saldoDisponivel;
    expect(saldo).toBeGreaterThan(0);
    await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeValor() as any));
  });

  it('a rejeição não deixa rastro: nenhum aditivo gravado e nenhuma quantidade alterada', async () => {
    const { c, contrato, itemContratoId } = await comAta(TETO_ITEM_1, TETO_ITEM_1, 90);
    await rejeicao(ctx.aditivos.create(c.tenantId, contrato.id, aditivoDeQuantidade(itemContratoId) as any));
    expect(await ctx.aditivos.list(c.tenantId, contrato.id)).toHaveLength(0);
    const [item] = await ctx.db.select().from(itensContrato).where(eq(itensContrato.id, itemContratoId));
    expect(Number(item.quantidade)).toBe(TETO_ITEM_1);
  });
});

import { eq } from 'drizzle-orm';
import { atas } from '../../src/db/schema';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Item 3 da TAREFA_RECONCILIACAO — renovação de ata vira prorrogação de
// prazo na própria ata (MODELO.md, seção 4): mesma ata, mesmo teto, saldo
// restante preservado. Não cria ata nova, não copia itens, não gera ciclo.
describe('Prorrogação de ata (renovação vira extensão de vigenciaFinal)', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('caminho feliz: estende vigenciaFinal, mantém id/teto/saldo e registra o evento', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 60 }]);
    await criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 25 }] });
    const antes = await ctx.atas.get(c.tenantId, ata.ataId);

    const nova = new Date(antes.vigenciaFinal); nova.setFullYear(nova.getFullYear() + 1);
    const isoNova = nova.toISOString().slice(0, 10);
    const depois: any = await ctx.atas.prorrogar(c.tenantId, ata.ataId, c.usuarioId, { vigenciaFinal: isoNova });

    expect(depois.id).toBe(ata.ataId); // mesma ata, não uma nova
    expect(new Date(depois.vigenciaFinal).toISOString().slice(0, 10)).toBe(isoNova);
    expect(depois.valorTotal).toBeCloseTo(antes.valorTotal); // mesmo teto
    expect(depois.saldoDisponivel).toBeCloseTo(antes.saldoDisponivel); // saldo restante preservado

    // não gerou ciclo: só existe esta ata para o tenant
    const todas = await ctx.db.select().from(atas).where(eq(atas.tenantId, c.tenantId));
    expect(todas).toHaveLength(1);

    const historico = await ctx.atas.prorrogacoes(c.tenantId, ata.ataId);
    expect(historico).toHaveLength(1);
    expect(historico[0].usuarioId).toBe(c.usuarioId);
    expect((historico[0].usuario as any).senhaHash).toBeUndefined();
    expect(new Date(historico[0].vigenciaFinalNova).toISOString().slice(0, 10)).toBe(isoNova);
  });

  it('violação: nova vigência igual ou anterior à atual é rejeitada, e nada é gravado', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    const antes = await ctx.atas.get(c.tenantId, ata.ataId);
    const mesmaData = new Date(antes.vigenciaFinal).toISOString().slice(0, 10);
    const dataAnterior = new Date(new Date(antes.vigenciaFinal).getTime() - 86400000).toISOString().slice(0, 10);

    await rejeicao(ctx.atas.prorrogar(c.tenantId, ata.ataId, c.usuarioId, { vigenciaFinal: mesmaData }));
    await rejeicao(ctx.atas.prorrogar(c.tenantId, ata.ataId, c.usuarioId, { vigenciaFinal: dataAnterior }));

    const depois = await ctx.atas.get(c.tenantId, ata.ataId);
    expect(new Date(depois.vigenciaFinal).getTime()).toBe(new Date(antes.vigenciaFinal).getTime());
    expect(await ctx.atas.prorrogacoes(c.tenantId, ata.ataId)).toHaveLength(0);
  });

  it('violação: PATCH genérico (update) não altera mais vigenciaFinal — só a prorrogação dedicada pode', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    const antes = await ctx.atas.get(c.tenantId, ata.ataId);
    const tentativa = new Date(antes.vigenciaFinal); tentativa.setFullYear(tentativa.getFullYear() + 5);

    // `as any`: vigenciaFinal não existe mais em UpdateAtaDto — simula um
    // cliente tentando o caminho antigo, sem validação nem registro.
    await ctx.atas.update(c.tenantId, ata.ataId, { vigenciaFinal: tentativa.toISOString().slice(0, 10) } as any);

    const depois = await ctx.atas.get(c.tenantId, ata.ataId);
    expect(new Date(depois.vigenciaFinal).getTime()).toBe(new Date(antes.vigenciaFinal).getTime());
  });

  it('atas vinculadas a uma homologação também podem ser prorrogadas (a antiga restrição de renovar() não existe mais)', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c); // criarAta já vincula homologacaoFornecedorId
    const antes = await ctx.atas.get(c.tenantId, ata.ataId);
    const nova = new Date(antes.vigenciaFinal); nova.setDate(nova.getDate() + 1);
    const depois: any = await ctx.atas.prorrogar(c.tenantId, ata.ataId, c.usuarioId, { vigenciaFinal: nova.toISOString().slice(0, 10) });
    expect(depois.id).toBe(ata.ataId);
  });
});

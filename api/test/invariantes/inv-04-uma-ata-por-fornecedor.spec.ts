import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ItemAtaInput } from '../../src/atas/dto/ata.dto';
import { Ctx, criarAta, criarCenario, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Invariante 4 — Uma ata por fornecedor por licitação. A soma das quantidades
// distribuídas entre os órgãos nunca excede o teto homologado. Quantidade zero
// para um órgão é válida, não é erro.
describe('Invariante 4 — uma ata por fornecedor; soma dos órgãos respeita o teto', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('caminho feliz: a primeira ata do fornecedor homologado é aceita', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c);
    expect(ata.ataId).toBeTruthy();
  });

  it('violação: uma segunda ata para o mesmo fornecedor homologado é rejeitada', async () => {
    const c = await criarCenario(ctx);
    await criarAta(ctx, c);
    const msg = await rejeicao(criarAta(ctx, c));
    expect(msg).toMatch(/já tem uma ata|uma por fornecedor|única ata/i);
  });

  it('a soma distribuída entre os órgãos pode chegar ao teto, mas não passa dele', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [
      { orgao: 'A', item: 'item1', quantidade: 55 },
      { orgao: 'B', item: 'item1', quantidade: 45 }, // 55 + 45 = teto exato
    ]);
    const msg = await rejeicao(
      ctx.atas.addItem(c.tenantId, ata.ataId, ata.orgaoA, { descricao: 'Item 2 homologado', unidade: 'CX', valorUnitario: 20, quantidade: 51, homologacaoItemId: c.item2 } as any),
    );
    expect(msg).toMatch(/excede/i); // item 2 tem teto 50
  });

  it('quantidade zero para um órgão é válida no serviço e não quebra o saldo derivado', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [
      { orgao: 'A', item: 'item1', quantidade: 100 },
      { orgao: 'B', item: 'item1', quantidade: 0 },
    ]);
    const b = (await ctx.atas.itensDoOrgao(c.tenantId, ata.ataId, ata.orgaoB))[0];
    expect(Number(b.quantidadeContratada)).toBe(0);
    expect(b.quantidadeDisponivel).toBe(0);
    const detalhe = await ctx.atas.get(c.tenantId, ata.ataId);
    expect(detalhe.valorTotal).toBe(1000);
  });

  it('quantidade zero também é válida na borda HTTP — a validação do DTO não pode rejeitá-la', async () => {
    const dto = plainToInstance(ItemAtaInput, { descricao: 'Item', unidade: 'UN', valorUnitario: 10, quantidade: 0, homologacaoItemId: 'x' });
    const erros = await validate(dto);
    expect(erros.map((e) => e.property)).not.toContain('quantidade');
  });
});

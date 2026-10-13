import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { JwtStrategy } from '../../src/auth/jwt.strategy';
import { UsuariosService } from '../../src/usuarios/usuarios.service';
import { Ctx, criarAta, criarCenario, criarContrato, criarCtx, dadosAditivo, emitirOrdem, encerrarCtx, esgotarContrato, gerarCpf, rejeicao } from '../helpers';

// Análise de bugs, grupo E (graves): aditivo de valor utilizável, ARP vencida/
// arquivada/sem homologação, sessão revogável e município sem administrador.
describe('Aditivo de valor e "Valor global"', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('contrato por item: acréscimo de valor exige itens, e a quantidade acrescida é utilizável pelas ordens', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] });
    await esgotarContrato(ctx, c, ct.id);
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'VALOR', percentual: 25 }) as any))).toMatch(/controlado por item/);

    const ad: any = await ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'VALOR', itens: [{ itemContratoId: ct.itens[0].id, quantidade: 2 }] }) as any);
    expect(ad.valorAcrescimo).toBe('20.00');
    expect(ad.percentual).toBe('20.00'); // 20 de 100
    const ordem: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 2 }]);
    expect(ordem.status).toBe('EMITIDA');
  });

  it('valor global: a ordem abate R$ (pode passar a quantidade do item) e é recusada além do saldo', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }], formaControleSaldo: 'APENAS_VALOR_TOTAL' }); // R$ 100
    await emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 10 }]);
    await ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'VALOR', percentual: 25 }) as any); // + R$ 25
    const ordem: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 2 }]); // R$ 20, além das 10 unidades
    expect(ordem.status).toBe('EMITIDA');
    expect(await rejeicao(emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 1 }]))).toMatch(/excede o saldo do contrato \(R\$\s5,00\)/);
  });

  it('o controle de saldo não muda depois de haver ordem', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] });
    await emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 1 }]);
    expect(await rejeicao(ctx.contratos.update(c.tenantId, ct.id, { formaControleSaldo: 'APENAS_VALOR_TOTAL' }))).toMatch(/já tem ordens/);
  });

  it('supressão depois de aditivo de quantidade sai primeiro do acréscimo (fora do teto)', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 100 }] });
    await esgotarContrato(ctx, c, ct.id);
    await ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'QUANTIDADE', itens: [{ itemContratoId: ct.itens[0].id, quantidade: 20 }] }) as any);
    const disp = async () => (await ctx.db.transaction((tx) => ctx.saldo.homologacaoItemSaldoDisponivel(tx as any, c.tenantId, c.item1))).disponivel;
    await ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'SUPRESSAO', itens: [{ itemContratoId: ct.itens[0].id, quantidade: 15 }] }) as any);
    expect(await disp()).toBe(0); // os 15 saíram dos 20 do aditivo
  });

  it('aditivo só em contrato vigente, e sem repetir o número', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: 'nenhuma', itens: [{ item: 'item1', quantidade: 10 }] });
    await ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'PRAZO', diasProrrogacao: 10, numero: '1º TA' }) as any);
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'PRAZO', diasProrrogacao: 10, numero: ' 1º ta ' }) as any))).toMatch(/já tem um aditivo de número/);
    await ctx.contratos.update(c.tenantId, ct.id, { situacao: 'ARQUIVADO' });
    expect(await rejeicao(ctx.aditivos.create(c.tenantId, ct.id, dadosAditivo({ tipo: 'PRAZO', diasProrrogacao: 10 }) as any))).toMatch(/arquivado/);
  });
});

describe('ARP como origem de contrato', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('ARP arquivada ou vencida não origina contrato', async () => {
    const c = await criarCenario(ctx);
    const ata = await criarAta(ctx, c, [{ orgao: 'A', item: 'item1', quantidade: 10 }]);
    await ctx.db.update(schema.atas).set({ situacao: 'ARQUIVADO' }).where(eq(schema.atas.id, ata.ataId));
    expect(await rejeicao(criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 1 }] }))).toMatch(/arquivada/);
    await ctx.db.update(schema.atas).set({ situacao: 'VIGENTE', vigenciaInicial: new Date('2019-01-01'), vigenciaFinal: new Date('2020-01-01') }).where(eq(schema.atas.id, ata.ataId));
    expect(await rejeicao(criarContrato(ctx, c, { origem: { ataOrgaoId: ata.orgaoA }, itens: [{ item: 'item1', quantidade: 1 }] }))).toMatch(/venceu em 01\/01\/2020/);
  });

  it('ARP só com homologação revisada; a antiga, sem homologação, não origina contrato', async () => {
    const c = await criarCenario(ctx);
    const [lic] = await ctx.db.insert(schema.licitacoes).values({ tenantId: c.tenantId, numero: `L-${Date.now()}`, numeroProcesso: 'P', objeto: 'o', modalidade: 'DISPENSA' } as any).returning();
    const base = { licitacaoId: lic.id, detentorPrincipalId: c.fornecedorId, vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-01-01' };
    expect(await rejeicao(ctx.atas.create(c.tenantId, { ...base, numeroArp: `ARP-X-${Date.now()}` } as any))).toMatch(/ainda não tem homologação revisada/);

    // ata antiga, criada antes da regra
    const [ata] = await ctx.db.insert(schema.atas).values({ tenantId: c.tenantId, numeroArp: `ARP-ANTIGA-${Date.now()}`, ...base, vigenciaInicial: new Date('2026-01-01'), vigenciaFinal: new Date('2099-01-01') } as any).returning();
    const [orgao] = await ctx.db.insert(schema.ataOrgaos).values({ tenantId: c.tenantId, ataId: ata.id, secretariaId: c.secretariaA, perfil: 'GERENCIADOR' }).returning();
    const msg = await rejeicao(ctx.contratos.create(c.tenantId, { numero: `CT-${Date.now()}`, numeroProcesso: 'P', objeto: 'o', licitacaoId: lic.id, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId, ataOrgaoId: orgao.id, vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-01-01', formaFaturamento: 'MENSAL', itens: [{ descricao: 'X', unidade: 'UN', quantidade: 1000, valorUnitario: 2 }] } as any));
    expect(msg).toMatch(/não está vinculada a uma homologação/);
  });
});

describe('Sessão e administradores', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  const estrategia = () => new JwtStrategy({ get: () => 'segredo-de-teste' } as any, ctx.db);
  const payload = (c: any, extra: object = {}) => ({ sub: c.usuarioId, tenantId: c.tenantId, tipoUsuario: 'ADMIN', permissoes: ['tudo'], ehAdminPlataforma: false, ...extra }) as any;

  it('token de usuário desativado deixa de valer; tipo e permissões vêm do banco, não do token', async () => {
    const c = await criarCenario(ctx);
    const [padrao] = await ctx.db.insert(schema.usuarios).values({ tenantId: c.tenantId, cpf: gerarCpf(), nome: 'Comum', email: `p-${Date.now()}@t.gov.br`, senhaHash: 'x', tipoUsuario: 'PADRAO' }).returning();
    await ctx.db.insert(schema.permissoes).values({ usuarioId: padrao.id, recurso: 'compras.ordens', permitido: true });
    const sessao: any = await estrategia().validate(payload({ usuarioId: padrao.id, tenantId: c.tenantId }));
    expect(sessao.tipoUsuario).toBe('PADRAO'); // o token dizia ADMIN
    expect(sessao.permissoes).toEqual(['compras.ordens']);

    await ctx.db.update(schema.usuarios).set({ ativo: false }).where(eq(schema.usuarios.id, padrao.id));
    expect(await rejeicao(estrategia().validate(payload({ usuarioId: padrao.id, tenantId: c.tenantId })))).toMatch(/Sessão encerrada/);
  });

  it('o único administrador não se desativa, não se rebaixa nem é removido; ninguém se desativa', async () => {
    const c = await criarCenario(ctx);
    const svc = new UsuariosService(ctx.db);
    const eu = { tipoUsuario: 'ADMIN' as const, ehAdminPlataforma: false, userId: c.usuarioId };
    expect(await rejeicao(svc.update(c.tenantId, eu, c.usuarioId, { ativo: false } as any))).toMatch(/desativar o próprio/);
    const [outro] = await ctx.db.insert(schema.usuarios).values({ tenantId: c.tenantId, cpf: gerarCpf(), nome: 'Segundo', email: `s-${Date.now()}@t.gov.br`, senhaHash: 'x', tipoUsuario: 'PADRAO' }).returning();
    const outroAdmin = { tipoUsuario: 'ADMIN' as const, ehAdminPlataforma: false, userId: outro.id };
    expect(await rejeicao(svc.update(c.tenantId, outroAdmin, c.usuarioId, { tipoUsuario: 'PADRAO' } as any))).toMatch(/único administrador ativo/);
    expect(await rejeicao(svc.remove(c.tenantId, outroAdmin, c.usuarioId))).toMatch(/único administrador ativo/);
    await svc.update(c.tenantId, eu, outro.id, { tipoUsuario: 'ADMIN' } as any);
    await svc.update(c.tenantId, outroAdmin, c.usuarioId, { tipoUsuario: 'PADRAO' } as any); // agora há outro admin
  });

  it('quem não é admin não mexe nas próprias permissões e só concede as que tem', async () => {
    const c = await criarCenario(ctx);
    const svc = new UsuariosService(ctx.db);
    const [gestor] = await ctx.db.insert(schema.usuarios).values({ tenantId: c.tenantId, cpf: gerarCpf(), nome: 'Gestor', email: `g-${Date.now()}@t.gov.br`, senhaHash: 'x', tipoUsuario: 'PADRAO' }).returning();
    await ctx.db.insert(schema.permissoes).values([{ usuarioId: gestor.id, recurso: 'administrativo.usuarios', permitido: true }, { usuarioId: gestor.id, recurso: 'compras.ordens', permitido: true }]);
    const chamador = { tipoUsuario: 'PADRAO' as const, ehAdminPlataforma: false, userId: gestor.id, permissoes: ['administrativo.usuarios', 'compras.ordens'] };
    expect(await rejeicao(svc.update(c.tenantId, chamador, gestor.id, { permissoes: ['administrativo.usuarios', 'compras.ordens', 'compras.contratos'] } as any))).toMatch(/próprias permissões/);
    const [colega] = await ctx.db.insert(schema.usuarios).values({ tenantId: c.tenantId, cpf: gerarCpf(), nome: 'Colega', email: `c-${Date.now()}@t.gov.br`, senhaHash: 'x', tipoUsuario: 'PADRAO' }).returning();
    expect(await rejeicao(svc.update(c.tenantId, chamador, colega.id, { permissoes: ['compras.contratos'] } as any))).toMatch(/sem acesso a: compras\.contratos/);
    await svc.update(c.tenantId, chamador, colega.id, { permissoes: ['compras.ordens'] } as any);
  });
});

describe('Edição de ordem', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  it('quantidade 0 tira a linha; dotações e rateio são salvos e conferidos', async () => {
    const c = await criarCenario(ctx);
    const ct = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }, { item: 'item2', quantidade: 10 }] });
    const ordem: any = await emitirOrdem(ctx, c, ct, [{ itemContratoId: ct.itens[0].id, quantidade: 2 }, { itemContratoId: ct.itens[1].id, quantidade: 1 }]); // 20 + 20
    const linha = (i: number) => ordem.itens.find((l: any) => l.itemContratoId === ct.itens[i].id).id;
    const [d1] = await ctx.db.insert(schema.dotacoes).values({ tenantId: c.tenantId, gestaoUnidade: '1', fonteRecursos: '2', programaTrabalho: '3' }).returning();
    const [d2] = await ctx.db.insert(schema.dotacoes).values({ tenantId: c.tenantId, gestaoUnidade: '4', fonteRecursos: '5', programaTrabalho: '6' }).returning();

    expect(await rejeicao(ctx.ordens.update(c.tenantId, c.usuarioId, 'ADMIN', ordem.id, { itens: [{ itemOrdemId: linha(0), quantidade: 0 }, { itemOrdemId: linha(1), quantidade: 0 }] } as any))).toMatch(/ao menos um item/);
    expect(await rejeicao(ctx.ordens.update(c.tenantId, c.usuarioId, 'ADMIN', ordem.id, { itens: [{ itemOrdemId: linha(1), quantidade: 0 }], dotacoes: [{ dotacaoId: d1.id, valorRateado: 10 }, { dotacaoId: d2.id, valorRateado: 5 }] } as any))).toMatch(/soma R\$\s15,00, mas a ordem vale R\$\s20,00/);

    const editada: any = await ctx.ordens.update(c.tenantId, c.usuarioId, 'ADMIN', ordem.id, { itens: [{ itemOrdemId: linha(1), quantidade: 0 }], dotacoes: [{ dotacaoId: d1.id, valorRateado: 15 }, { dotacaoId: d2.id, valorRateado: 5 }] } as any);
    expect(editada.itens).toHaveLength(1);
    expect(editada.dotacoes.map((d: any) => d.dotacaoId).sort()).toEqual([d1.id, d2.id].sort());
  });
});

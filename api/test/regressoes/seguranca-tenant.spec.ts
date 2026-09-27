import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import { CreateContratoDto } from '../../src/contratos/dto/contrato.dto';
import { UsuariosService } from '../../src/usuarios/usuarios.service';
import { Ctx, criarCenario, criarContrato, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Grupo 1 da revisão de bugs: escalada de privilégio em usuários, dotações de
// outro tenant e itens de contrato sem validação.
describe('Segurança e isolamento entre tenants', () => {
  let ctx: Ctx;
  let usuarios: UsuariosService;
  beforeAll(() => {
    ctx = criarCtx();
    usuarios = new UsuariosService(ctx.db);
  });
  afterAll(() => encerrarCtx(ctx));

  const PADRAO = { tipoUsuario: 'PADRAO' as const, ehAdminPlataforma: false };
  const ADMIN = { tipoUsuario: 'ADMIN' as const, ehAdminPlataforma: false };
  let n = 0;
  const novoUsuarioDto = (extra: Record<string, unknown> = {}) => {
    n++;
    const sufixo = `${Date.now()}${n}`;
    return { cpf: sufixo.slice(-11), nome: 'Fulano', email: `u${sufixo}@teste.gov.br`, senha: 'segredo123', ...extra } as any;
  };

  describe('usuários: somente ADMIN concede ou mexe em ADMIN', () => {
    it('PADRAO não cria ADMIN, não se promove, não altera nem remove ADMIN', async () => {
      const c = await criarCenario(ctx);
      expect(await rejeicao(usuarios.create(c.tenantId, PADRAO, novoUsuarioDto({ tipoUsuario: 'ADMIN' })))).toMatch(/administradores/);

      const comum: any = await usuarios.create(c.tenantId, PADRAO, novoUsuarioDto());
      expect(comum.tipoUsuario).toBe('PADRAO');
      expect(await rejeicao(usuarios.update(c.tenantId, PADRAO, comum.id, { tipoUsuario: 'ADMIN' }))).toMatch(/administradores/);

      // c.usuarioId é o ADMIN do cenário: trocar a senha dele seria assumir a conta
      expect(await rejeicao(usuarios.update(c.tenantId, PADRAO, c.usuarioId, { senha: 'outrasenha' }))).toMatch(/administradores/);
      expect(await rejeicao(usuarios.remove(c.tenantId, PADRAO, c.usuarioId))).toMatch(/administradores/);

      const [admin] = await ctx.db.select().from(schema.usuarios).where(eq(schema.usuarios.id, c.usuarioId));
      expect(admin.senhaHash).toBe('x'); // nada mudou
    });

    it('PADRAO continua editando usuários comuns; ADMIN pode promover', async () => {
      const c = await criarCenario(ctx);
      const comum: any = await usuarios.create(c.tenantId, PADRAO, novoUsuarioDto());
      const editado: any = await usuarios.update(c.tenantId, PADRAO, comum.id, { nome: 'Novo nome', tipoUsuario: 'PADRAO' });
      expect(editado.nome).toBe('Novo nome');

      const promovido: any = await usuarios.update(c.tenantId, ADMIN, comum.id, { tipoUsuario: 'ADMIN' });
      expect(promovido.tipoUsuario).toBe('ADMIN');
    });
  });

  describe('dotações precisam ser do mesmo tenant', () => {
    it('ordem e contrato rejeitam dotação de outro tenant e aceitam a própria', async () => {
      const c = await criarCenario(ctx);
      const outro = await criarCenario(ctx);
      const [dotacaoAlheia] = await ctx.db.insert(schema.dotacoes).values({ tenantId: outro.tenantId, gestaoUnidade: 'G', fonteRecursos: 'F', programaTrabalho: 'P' }).returning();
      const [dotacaoPropria] = await ctx.db.insert(schema.dotacoes).values({ tenantId: c.tenantId, gestaoUnidade: 'G', fonteRecursos: 'F', programaTrabalho: 'P' }).returning();

      const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
      const itemContratoId = contrato.itens[0].id;

      expect(await rejeicao(ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId, quantidade: 1 }], dotacoes: [{ dotacaoId: dotacaoAlheia.id }] } as any))).toMatch(/Dotação/);
      const ordem: any = await ctx.ordens.create(c.tenantId, c.usuarioId, { contratoId: contrato.id, itens: [{ itemContratoId, quantidade: 1 }], dotacoes: [{ dotacaoId: dotacaoPropria.id }] } as any);
      expect(ordem.dotacoes).toHaveLength(1);

      const base = {
        numeroProcesso: 'PA', objeto: 'Obj', licitacaoId: c.licitacaoId, orgaoGerenciadorId: c.secretariaA, fornecedorId: c.fornecedorId,
        vigenciaInicial: '2026-01-01', vigenciaFinal: '2099-12-31', formaFaturamento: 'MENSAL', itens: [],
      };
      expect(await rejeicao(ctx.contratos.create(c.tenantId, { ...base, numero: `X-${Date.now()}`, dotacaoIds: [dotacaoAlheia.id] } as any))).toMatch(/Dotação/);
      const ok: any = await ctx.contratos.create(c.tenantId, { ...base, numero: `Y-${Date.now()}`, dotacaoIds: [dotacaoPropria.id] } as any);
      expect(ok.dotacoes).toHaveLength(1);
    });
  });

  describe('itens de contrato são validados', () => {
    it('o DTO valida cada item (quantidade/valor positivos)', async () => {
      const dto = plainToInstance(CreateContratoDto, {
        numero: '1', numeroProcesso: '1', objeto: 'o', licitacaoId: 'l', orgaoGerenciadorId: 'o', fornecedorId: 'f',
        vigenciaInicial: '2026-01-01', vigenciaFinal: '2026-12-31', formaFaturamento: 'MENSAL',
        itens: [{ descricao: 'a', unidade: 'UN', quantidade: -5, valorUnitario: 10 }],
      });
      const erros = await validate(dto, { whitelist: true });
      expect(JSON.stringify(erros)).toMatch(/quantidade/);
    });

    it('quantidade negativa não libera teto da homologação', async () => {
      const c = await criarCenario(ctx);
      expect(await rejeicao(criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: -50 }] }))).toMatch(/maior que zero/);
      const contrato = await criarContrato(ctx, c, { origem: { homologacaoFornecedorId: c.homologacaoFornecedorId }, itens: [{ item: 'item1', quantidade: 10 }] });
      expect(await rejeicao(ctx.contratos.addItem(c.tenantId, contrato.id, { descricao: 'x', unidade: 'UN', quantidade: -10, valorUnitario: 10, homologacaoItemId: c.item1 }))).toMatch(/maior que zero/);
    });
  });
});

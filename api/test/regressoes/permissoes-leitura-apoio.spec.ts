import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../../src/common/permissions.guard';
import { SecretariasController } from '../../src/secretarias/secretarias.controller';
import { Ctx, criarCenario, criarCtx, encerrarCtx, rejeicao } from '../helpers';

// Encontrado no teste interno: um comprador (compras.* sem permissões
// administrativas) não conseguia abrir Contratos, Atas nem o Painel de
// ordens — as telas carregam a lista de órgãos (/secretarias), presa à
// permissão administrativa, e a tela inteira falhava. Leitura de cadastro de
// apoio passa a aceitar qualquer tela de Compras; escrita continua restrita.
describe('Leitura de cadastros de apoio', () => {
  let ctx: Ctx;
  beforeAll(() => { ctx = criarCtx(); });
  afterAll(() => encerrarCtx(ctx));

  async function podeAcessar(tenantId: string, permissoes: string[], handler: keyof SecretariasController) {
    const guard = new PermissionsGuard(new Reflector(), ctx.db);
    const contexto: any = {
      getHandler: () => SecretariasController.prototype[handler],
      getClass: () => SecretariasController,
      switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u', tenantId, tipoUsuario: 'PADRAO', permissoes, ehAdminPlataforma: false } }) }),
    };
    return guard.canActivate(contexto);
  }

  it('comprador lê a lista de órgãos, mas não cria órgão; sem nenhuma tela de Compras, nem lê', async () => {
    const c = await criarCenario(ctx);
    // (o banco de testes não tem catálogo de módulos, então a trava de setor
    // do guard não se aplica aqui — só a de permissão, que é o que se testa)
    expect(await podeAcessar(c.tenantId, ['compras.contratos'], 'list')).toBe(true);
    expect(await rejeicao(podeAcessar(c.tenantId, ['compras.contratos'], 'create'))).toMatch(/sem permissão/);
    expect(await podeAcessar(c.tenantId, ['administrativo.secretarias'], 'create')).toBe(true);
    expect(await rejeicao(podeAcessar(c.tenantId, ['administrativo.usuarios'], 'list'))).toMatch(/sem permissão/);
  });
});

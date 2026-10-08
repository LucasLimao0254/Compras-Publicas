import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, DrizzleDB } from '../db/db.module';
import { modulos, tenantSetores } from '../db/schema';
import { PERMISSION_KEY } from './require-permission.decorator';
import { AuthUser } from './current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DRIZZLE) private db: DrizzleDB,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const marcado = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const recursos = Array.isArray(marcado) ? marcado : marcado ? [marcado] : [];
    if (!recursos.length) return true;

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return false;

    // Com mais de um recurso na rota basta ter um deles (ver
    // RequirePermission) — ADMIN do tenant conta como tendo todos.
    const concedidos = user.tipoUsuario === 'ADMIN' ? recursos : recursos.filter((r) => user.permissoes.includes(r));
    if (!concedidos.length) throw new ForbiddenException(`Usuário sem permissão para o recurso "${recursos[0]}"`);

    // Trava de nível "o que este tenant contratou" — independente de ser
    // ADMIN do tenant. Sem isso, desabilitar um setor em /plataforma só
    // escondia o item de menu; a API por trás continuava totalmente aberta.
    // Precisa valer para pelo menos um dos recursos que o usuário de fato tem.
    for (const recurso of concedidos) {
      if (await this.setorHabilitado(user.tenantId, recurso)) return true;
    }
    throw new ForbiddenException(`O recurso "${recursos[0]}" não está disponível para o seu município`);
  }

  private async setorHabilitado(tenantId: string, recurso: string): Promise<boolean> {
    const [modulo] = await this.db.select({ setorId: modulos.setorId }).from(modulos).where(eq(modulos.recurso, recurso));
    // Recurso fora do catálogo de setores (ex.: administrativo.*, que não é
    // um módulo do Setor de Compras) — não é gated por setor nenhum.
    if (!modulo) return true;

    const [vinculo] = await this.db
      .select({ habilitado: tenantSetores.habilitado })
      .from(tenantSetores)
      .where(and(eq(tenantSetores.tenantId, tenantId), eq(tenantSetores.setorId, modulo.setorId)));
    return vinculo?.habilitado ?? false;
  }
}

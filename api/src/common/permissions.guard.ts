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
    const recurso = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!recurso) return true;

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return false;

    const temPermissao = user.tipoUsuario === 'ADMIN' || user.permissoes.includes(recurso);
    if (!temPermissao) throw new ForbiddenException(`Usuário sem permissão para o recurso "${recurso}"`);

    // Trava de nível "o que este tenant contratou" — independente de ser
    // ADMIN do tenant. Sem isso, desabilitar um setor em /plataforma só
    // escondia o item de menu; a API por trás continuava totalmente aberta.
    if (!(await this.setorHabilitado(user.tenantId, recurso))) {
      throw new ForbiddenException(`O recurso "${recurso}" não está disponível para o seu município`);
    }

    return true;
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

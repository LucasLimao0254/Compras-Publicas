import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { AuthUser } from './current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const recurso = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!recurso) return true;

    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return false;
    if (user.tipoUsuario === 'ADMIN') return true;
    if (user.permissoes.includes(recurso)) return true;

    throw new ForbiddenException(`Usuário sem permissão para o recurso "${recurso}"`);
  }
}

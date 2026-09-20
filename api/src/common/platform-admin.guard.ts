import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from './current-user.decorator';

// Gate pras rotas de nível plataforma (acima da hierarquia de tenant) — nunca
// basta ser ADMIN de um tenant, precisa do flag ehAdminPlataforma no JWT.
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user?.ehAdminPlataforma) {
      throw new ForbiddenException('Área de plataforma — acesso restrito a administradores de plataforma');
    }
    return true;
  }
}

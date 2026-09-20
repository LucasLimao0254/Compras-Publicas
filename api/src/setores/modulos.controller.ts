import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { SetoresService } from './setores.service';

// Sem @RequirePermission — todo usuário autenticado pode ler os módulos do
// próprio tenant (é o catálogo que monta o menu e a árvore de permissões).
@UseGuards(JwtAuthGuard)
@Controller('modulos')
export class ModulosController {
  constructor(private service: SetoresService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.service.modulosDoTenant(u.tenantId);
  }
}

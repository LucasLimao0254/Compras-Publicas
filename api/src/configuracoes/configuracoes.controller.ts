import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { PermissionsGuard } from '../common/permissions.guard';
import { RequirePermission } from '../common/require-permission.decorator';
import { CurrentUser, AuthUser } from '../common/current-user.decorator';
import { ConfiguracoesService } from './configuracoes.service';
import { UpdateConfiguracoesComprasDto } from './dto/configuracoes.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('compras.configuracoes')
@Controller('configuracoes/compras')
export class ConfiguracoesController {
  constructor(private service: ConfiguracoesService) {}

  @Get() get(@CurrentUser() u: AuthUser) { return this.service.getOuCriar(u.tenantId); }
  @Patch() update(@CurrentUser() u: AuthUser, @Body() dto: UpdateConfiguracoesComprasDto) { return this.service.update(u.tenantId, dto); }
}
